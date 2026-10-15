import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, map, merge } from 'rxjs';
import {
  GroupByField,
  LlmUsageFilters,
  LlmUsageFiltersResponse,
  LlmUsageSummaryRow,
} from '../../core/models/llm-usage.model';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { LlmUsageService } from '../../core/services/llm-usage.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/components/multi-select/multi-select';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';
import { buildChartModel, buildCompareChartModel, buildDonutSlices, DonutSlice, TOTAL_SERIES_KEY } from './chart-data';
import { CostChartComponent, CostChartSeries } from './cost-chart/cost-chart';
import { CostDonutComponent } from './cost-donut/cost-donut';
import { UsageTableComponent, UsageTableSort } from './usage-table/usage-table';
import {
  BucketGranularity,
  daysInRange,
  isValidIsoDate,
  presetRange,
  previousRange,
  suggestGranularity,
  USAGE_PRESETS,
  UsagePreset,
} from './date-utils';
import {
  compareValues,
  Delta,
  formatCompact,
  formatCost,
  formatInteger,
  formatPeriodLabel,
  formatPeriodTitle,
  intlLocale,
  perDay,
} from './usage-format';
import {
  CHART_GRANULARITIES,
  CHART_VIEWS,
  ChartViewMode,
  resolveUsageState,
  SPLIT_DIMENSIONS,
  UsageState,
  usageStateToQueryParams,
} from './usage-state';

/** Series colors, assigned by a value's position in the (alphabetical) filter list so a model/type keeps its color whatever else is filtered. Hex because Chart.js can't derive alpha variants of oklch(). */
const SERIES_PALETTE = [
  '#ff6b4a',
  '#4ea8ff',
  '#7bd88f',
  '#f2c94c',
  '#b48cf2',
  '#4fd1c5',
  '#f2994a',
  '#eb6fa5',
  '#9fb3c8',
  '#a3e635',
  '#38bdf8',
  '#c084fc',
];

/** What the overview block (KPI tiles + breakdowns) depends on - deliberately without granularity/split, so switching those doesn't refetch it. */
interface OverviewQuery {
  from: string;
  to: string;
  types: string[];
  flows: string[];
  models: string[];
}

interface SeriesQuery extends OverviewQuery {
  granularity: BucketGranularity;
  splitBy: GroupByField;
}

interface OverviewResult {
  total: LlmUsageSummaryRow[];
  byType: LlmUsageSummaryRow[];
  byModel: LlmUsageSummaryRow[];
}

interface SeriesResult {
  query: SeriesQuery;
  rows: LlmUsageSummaryRow[];
}

interface Totals {
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

interface BreakdownItem {
  key: string;
  label: string;
  cost: number;
  requests: number;
  /** Fraction (0..1) of the total cost. */
  share: number;
  /** Requests were made but the backend reported no tokens and no cost (some models, e.g. gpt-*, aren't metered). */
  noTokens: boolean;
  /** The same entity in the period being compared with (while comparing). */
  previous: BreakdownPrevious | null;
}

interface BreakdownPrevious {
  cost: number;
  /** Fraction (0..1) of that period's total cost. */
  share: number;
  /** "+12.3%", "new" or "" (nothing to say). */
  changeText: string;
  direction: 'up' | 'down' | 'flat';
}

interface CompareChartView {
  labels: string[];
  titles: string[];
  notes: string[];
  faded: boolean[];
  series: CostChartSeries[];
}

/** One KPI tile's change against the previous period, ready to render. */
interface KpiDelta {
  kind: Delta['kind'];
  direction: 'up' | 'down' | 'flat';
  /** "+12.3%", "new", ... */
  text: string;
  /** The other period's value, for the tooltip. */
  previous: string;
  /** Set when the two periods differ in length: the per-day averages, which are the fair comparison then. */
  perDay: { current: string; previous: string; text: string } | null;
}

type KpiKey = keyof Totals;

interface ChartView {
  labels: string[];
  titles: string[];
  notes: string[];
  faded: boolean[];
  series: CostChartSeries[];
  hasPartial: boolean;
}

/** The "everything else" slice of the doughnut - neutral on purpose, so it can't be mistaken for an entity. */
const DONUT_REST_COLOR = '#5d6577';

/** The two periods of the "A vs B" chart: the selected period in the accent color, the one compared with in a calm blue-grey. */
const COMPARE_COLOR_A = '#ff6b4a';
const COMPARE_COLOR_B = '#6f8fb3';

const ZERO_TOTALS: Totals = { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0 };

const sameJson = <T>(a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);

function toFilters(query: OverviewQuery): LlmUsageFilters {
  return { from: query.from, to: query.to, type: query.types, flow: query.flows, llmMod: query.models };
}

/** Rows without a group value (shouldn't happen, but never crash the chart over it). */
function rowKey(row: LlmUsageSummaryRow, field: GroupByField): string {
  return row[field] ?? '—';
}

/**
 * LLM spend dashboard: KPI tiles, a cost-over-time chart and cost
 * breakdowns by type and model for a chosen period and filter set.
 *
 * The filter state lives in the URL (see usage-state.ts) so a link can
 * be shared; the page only ever reads it back from there. Each data block
 * re-fetches when - and only when - its own inputs change, and a request
 * that's been superseded is cancelled, so a slow response can never
 * overwrite a newer one.
 */
@Component({
  selector: 'app-llm-usage',
  imports: [
    RouterLink,
    TranslatePipe,
    SpinnerComponent,
    EmptyStateComponent,
    LanguageSwitcherComponent,
    MultiSelectComponent,
    CostChartComponent,
    CostDonutComponent,
    UsageTableComponent,
  ],
  templateUrl: './llm-usage.html',
  styleUrls: ['./llm-usage.css', './llm-usage-compare.css'],
})
export class LlmUsageComponent implements OnInit {
  private readonly usageService = inject(LlmUsageService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  protected readonly presets = USAGE_PRESETS;
  protected readonly granularities = CHART_GRANULARITIES;
  protected readonly splitDimensions = SPLIT_DIMENSIONS;
  protected readonly views = CHART_VIEWS;

  protected readonly filters = signal<LlmUsageFiltersResponse | null>(null);
  protected readonly filtersLoading = signal(true);
  protected readonly filtersError = signal(false);

  protected readonly overview = signal<OverviewResult | null>(null);
  protected readonly overviewLoading = signal(false);
  private readonly overviewError = signal<string | null>(null);

  private readonly seriesResult = signal<SeriesResult | null>(null);
  protected readonly seriesLoading = signal(false);
  private readonly seriesError = signal<string | null>(null);

  /** The compared period's overview (null while loading, when comparing is off or unavailable, or if a request failed - a missing comparison never breaks the page). */
  private readonly previousOverview = signal<OverviewResult | null>(null);
  private readonly previousTotals = computed<Totals | null>(() => {
    const overview = this.previousOverview();
    if (!overview) {
      return null;
    }
    const row = overview.total[0];
    return row
      ? { cost: row.cost, requests: row.requests, inputTokens: row.inputTokens, outputTokens: row.outputTokens }
      : ZERO_TOTALS;
  });

  /** The compared period's cost per bucket (no split), for the "A vs B" chart. */
  private readonly compareSeriesResult = signal<SeriesResult | null>(null);
  protected readonly compareSeriesLoading = signal(false);
  protected readonly compareSeriesFailed = signal(false);

  /** Bumped whenever translations load or the language changes, so label helpers that call `translate.instant` re-evaluate. */
  private readonly translationsVersion = toSignal(
    merge(this.translate.onLangChange, this.translate.onTranslationChange, this.translate.onFallbackLangChange).pipe(
      map(() => Math.random()),
    ),
    { initialValue: 0 },
  );

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly locale = computed(() => intlLocale(this.languageService.currentLanguage()));

  /** The filter panel's state, resolved from the URL - null until the filter dictionary (and with it `maxDate`) has loaded, or when there's no data at all. */
  protected readonly state = computed<UsageState | null>(() => {
    const maxDate = this.filters()?.maxDate;
    return maxDate ? resolveUsageState(this.queryParams(), maxDate) : null;
  });

  private readonly overviewQuery = computed<OverviewQuery | null>(
    () => {
      const state = this.state();
      return state
        ? { from: state.from, to: state.to, types: state.types, flows: state.flows, models: state.models }
        : null;
    },
    { equal: sameJson },
  );

  private readonly seriesQuery = computed<SeriesQuery | null>(
    () => {
      const state = this.state();
      return state
        ? {
            from: state.from,
            to: state.to,
            types: state.types,
            flows: state.flows,
            models: state.models,
            granularity: state.granularity,
            splitBy: state.splitBy,
          }
        : null;
    },
    { equal: sameJson },
  );

  /** The period compared with: the one picked by hand, else the one of the same length right before the selected period. */
  protected readonly comparePeriod = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    if (state.compareFrom && state.compareTo) {
      return { from: state.compareFrom, to: state.compareTo, custom: true };
    }
    return { ...previousRange(state.from, state.to), custom: false };
  });

  /** An automatic previous period has nothing to compare with when it ends before the first day the backend has data for (a hand-picked one is the user's call). */
  protected readonly comparisonUnavailable = computed(() => {
    const period = this.comparePeriod();
    const minDate = this.filters()?.minDate;
    return !!period && !period.custom && !!minDate && period.to < minDate;
  });

  /** Comparing is on and there is something to compare with. */
  protected readonly comparing = computed(() => !!this.state()?.compare && !this.comparisonUnavailable());

  /** What the chart shows: "compare" only while comparing, else it falls back to the plain bars. */
  protected readonly view = computed<ChartViewMode>(() => {
    const view = this.state()?.view ?? 'bars';
    return view === 'compare' && !this.comparing() ? 'bars' : view;
  });

  protected readonly availableViews = computed(() => this.views.filter((view) => view !== 'compare' || this.comparing()));

  private readonly compareQuery = computed<OverviewQuery | null>(
    () => {
      const state = this.state();
      const period = this.comparePeriod();
      if (!state || !period || !this.comparing()) {
        return null;
      }
      return { from: period.from, to: period.to, types: state.types, flows: state.flows, models: state.models };
    },
    { equal: sameJson },
  );

  private readonly compareSeriesQuery = computed<SeriesQuery | null>(
    () => {
      const query = this.compareQuery();
      const state = this.state();
      // Only the "A vs B" chart needs it.
      return query && state && this.view() === 'compare' ? { ...query, granularity: state.granularity, splitBy: state.splitBy } : null;
    },
    { equal: sameJson },
  );

  /** "Sep 12 – Oct 11" - what the KPI deltas are compared with. */
  protected readonly previousPeriodLabel = computed(() => {
    const period = this.comparePeriod();
    this.locale();
    return period ? this.rangeLabel(period.from, period.to) : '';
  });

  protected readonly kpiDeltas = computed<Record<KpiKey, KpiDelta> | null>(() => {
    const previous = this.previousTotals();
    const state = this.state();
    const period = this.comparePeriod();
    if (!previous || !state || !period || !this.overview() || this.overviewLoading()) {
      return null;
    }
    const current = this.totals();
    const locale = this.locale();
    this.translationsVersion();

    const percentFormat = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
    const daysCurrent = daysInRange(state.from, state.to);
    const daysPrevious = daysInRange(period.from, period.to);
    const lengthsDiffer = daysCurrent !== daysPrevious;

    const make = (key: KpiKey, format: (value: number) => string): KpiDelta => {
      const delta = compareValues(current[key], previous[key]);
      const previousText = format(previous[key]);

      let perDayInfo: KpiDelta['perDay'] = null;
      if (lengthsDiffer) {
        const currentAvg = perDay(current[key], daysCurrent);
        const previousAvg = perDay(previous[key], daysPrevious);
        const avgDelta = compareValues(currentAvg, previousAvg);
        perDayInfo = {
          current: format(currentAvg),
          previous: format(previousAvg),
          text: avgDelta.kind === 'change' ? percentFormat.format(avgDelta.fraction) : avgDelta.kind === 'new' ? this.t('usage.compare.new') : '',
        };
      }

      if (delta.kind === 'change') {
        return { kind: 'change', direction: delta.direction, text: percentFormat.format(delta.fraction), previous: previousText, perDay: perDayInfo };
      }
      return {
        kind: delta.kind,
        direction: 'flat',
        text: delta.kind === 'new' ? this.t('usage.compare.new') : '',
        previous: previousText,
        perDay: perDayInfo,
      };
    };

    // Per-day token counts are fractions - round them, a fractional token means nothing.
    const whole = (value: number) => this.compact(Math.round(value));
    return {
      cost: make('cost', (value) => this.cost(value)),
      requests: make('requests', (value) => this.integer(Math.round(value))),
      inputTokens: make('inputTokens', whole),
      outputTokens: make('outputTokens', whole),
    };
  });

  /** The two periods differ in length (days), so totals alone would flatter the longer one. */
  protected readonly lengthNote = computed(() => {
    const state = this.state();
    const period = this.comparePeriod();
    if (!state || !period || !this.comparing()) {
      return null;
    }
    const a = daysInRange(state.from, state.to);
    const b = daysInRange(period.from, period.to);
    return a === b ? null : { a, b };
  });

  /** What the detailed table loads: the period and filters (not the chart's step / split, so changing those doesn't refetch it). */
  protected readonly tableFilters = computed<LlmUsageFilters>(
    () => {
      const query = this.overviewQuery();
      return query ? toFilters(query) : {};
    },
    { equal: sameJson },
  );

  /** A server-side range error (HTTP 400) is shown as-is; anything else gets a generic message. */
  protected readonly errorMessage = computed(() => this.overviewError() ?? this.seriesError());

  protected readonly totals = computed<Totals>(() => {
    const row = this.overview()?.total[0];
    return row
      ? { cost: row.cost, requests: row.requests, inputTokens: row.inputTokens, outputTokens: row.outputTokens }
      : ZERO_TOTALS;
  });

  /** True once an overview has loaded and it came back with nothing in it. */
  protected readonly isEmpty = computed(() => {
    if (!this.overview() || this.overviewLoading()) {
      return false;
    }
    const totals = this.totals();
    return totals.requests === 0 && totals.cost === 0 && totals.inputTokens === 0 && totals.outputTokens === 0;
  });

  protected readonly byType = computed(() =>
    this.toBreakdown(this.overview()?.byType ?? [], 'type', this.previousOverview()?.byType ?? null),
  );
  protected readonly byModel = computed(() =>
    this.toBreakdown(this.overview()?.byModel ?? [], 'llmMod', this.previousOverview()?.byModel ?? null),
  );

  /** The loaded series rows laid out per bucket - the common input of both chart views. */
  private readonly seriesModel = computed(() => {
    const result = this.seriesResult();
    const filters = this.filters();
    if (!result || !filters) {
      return null;
    }

    const { query } = result;
    const model = buildChartModel(result.rows, {
      granularity: query.granularity,
      splitBy: query.splitBy,
      from: query.from,
      to: query.to,
      maxDate: filters.maxDate,
    });
    return { query, model, colorOptions: this.optionsFor(query.splitBy, filters) };
  });

  protected readonly chart = computed<ChartView | null>(() => {
    const loaded = this.seriesModel();
    if (!loaded) {
      return null;
    }

    const { query, model, colorOptions } = loaded;
    const locale = this.locale();
    const ongoingNote = this.t('usage.period.ongoing');
    const partialNote = this.t('usage.period.partial');

    return {
      labels: model.periods.map((period) => formatPeriodLabel(period, query.granularity, locale)),
      titles: model.periods.map((period) => formatPeriodTitle(period, query.granularity, locale)),
      notes: model.coverage.map((c) => (c.ongoing ? ongoingNote : c.partial ? partialNote : '')),
      faded: model.coverage.map((c) => c.partial),
      hasPartial: model.coverage.some((c) => c.partial),
      series: model.series.map((series) => ({
        label: series.key === TOTAL_SERIES_KEY ? this.t('usage.chart.total') : this.dimensionLabel(query.splitBy, series.key),
        color: this.colorFor(series.key, colorOptions),
        data: series.data,
      })),
    };
  });

  /** The doughnut view: the period's spend per entity of the split dimension (same colors as the bars). */
  protected readonly donutSlices = computed<DonutSlice[] | null>(() => {
    const loaded = this.seriesModel();
    if (!loaded) {
      return null;
    }

    const { query, model, colorOptions } = loaded;
    this.translationsVersion();
    return buildDonutSlices(
      model.series.map((series) => ({
        key: series.key,
        label: series.key === TOTAL_SERIES_KEY ? this.t('usage.chart.total') : this.dimensionLabel(query.splitBy, series.key),
        color: this.colorFor(series.key, colorOptions),
        value: series.total,
      })),
      {
        restLabel: (count) => this.translate.instant('usage.chart.others', { count }),
        restColor: DONUT_REST_COLOR,
      },
    );
  });

  /** The "A vs B" chart: both periods' total cost per bucket, lined up by position. */
  protected readonly compareChart = computed<CompareChartView | null>(() => {
    const own = this.seriesModel();
    const other = this.compareSeriesResult();
    const filters = this.filters();
    if (!own || !other || !filters) {
      return null;
    }

    const { query } = other;
    const otherModel = buildChartModel(other.rows, {
      granularity: query.granularity,
      splitBy: null,
      from: query.from,
      to: query.to,
      maxDate: filters.maxDate,
    });
    const model = buildCompareChartModel(own.model, otherModel);

    const locale = this.locale();
    const unit = own.query.granularity;
    const ongoingNote = this.t('usage.period.ongoing');
    const partialNote = this.t('usage.period.partial');
    const title = (period: string | null) => (period ? formatPeriodTitle(period, unit, locale) : '—');
    const range = (from: string, to: string) => this.rangeLabel(from, to);

    return {
      labels: Array.from({ length: model.size }, (_, index) => this.translate.instant(`usage.compare.unit.${unit}`, { n: index + 1 })),
      titles: Array.from({ length: model.size }, (_, index) => `${title(model.periodsA[index])}  vs  ${title(model.periodsB[index])}`),
      notes: Array.from({ length: model.size }, (_, index) => (model.ongoing[index] ? ongoingNote : model.partial[index] ? partialNote : '')),
      faded: model.partial,
      series: [
        { label: this.t('usage.compare.periodA', { range: range(own.query.from, own.query.to) }), color: COMPARE_COLOR_A, data: model.a },
        { label: this.t('usage.compare.periodB', { range: range(query.from, query.to) }), color: COMPARE_COLOR_B, data: model.b },
      ],
    };
  });

  protected readonly typeOptions = computed<MultiSelectOption[]>(() => {
    this.translationsVersion();
    return (this.filters()?.types ?? []).map((type) => ({ value: type, label: this.typeLabel(type) }));
  });

  protected readonly modelOptions = computed<MultiSelectOption[]>(() =>
    (this.filters()?.llmMods ?? []).map((model) => ({ value: model, label: model })),
  );

  protected readonly flowOptions = computed<MultiSelectOption[]>(() =>
    (this.filters()?.flows ?? []).map((flow) => ({ value: flow, label: flow })),
  );

  protected readonly formatChartValue = computed(() => {
    const locale = this.locale();
    return (value: number) => formatCost(value, locale);
  });

  protected readonly formatShare = computed(() => {
    const locale = this.locale();
    return (fraction: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(fraction);
  });

  protected readonly hasActiveFilters = computed(() => {
    const state = this.state();
    return !!state && (state.types.length > 0 || state.flows.length > 0 || state.models.length > 0);
  });

  /** The quick preset that exactly matches the current range, if any (for highlighting its button). */
  protected readonly activePreset = computed<UsagePreset | null>(() => {
    const state = this.state();
    const maxDate = this.filters()?.maxDate;
    if (!state || !maxDate) {
      return null;
    }
    return (
      this.presets.find((preset) => {
        const range = presetRange(preset, maxDate);
        return range.from === state.from && range.to === state.to;
      }) ?? null
    );
  });

  constructor() {
    // Overview block (KPIs + breakdowns): refetches only when the range or
    // a filter changes. The returned subscription is torn down on every
    // re-run, which cancels the superseded HTTP requests.
    effect((onCleanup) => {
      const query = this.overviewQuery();
      if (!query) {
        return;
      }

      const filters = toFilters(query);
      this.overviewLoading.set(true);
      this.overviewError.set(null);

      const subscription = forkJoin({
        total: this.usageService.getSummary({ ...filters, granularity: 'total' }),
        byType: this.usageService.getSummary({ ...filters, granularity: 'total', groupBy: ['type'] }),
        byModel: this.usageService.getSummary({ ...filters, granularity: 'total', groupBy: ['llmMod'] }),
      }).subscribe({
        next: (result) => {
          this.overview.set(result);
          this.overviewLoading.set(false);
        },
        error: (error) => {
          this.overviewError.set(this.messageOf(error));
          this.overviewLoading.set(false);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });

    // The compared period's overview (totals + breakdowns), for the KPI
    // deltas and the breakdown bars. Independent of the main overview, so a
    // failure here only hides the comparison.
    effect((onCleanup) => {
      const query = this.compareQuery();
      this.previousOverview.set(null);
      if (!query) {
        return;
      }

      const filters = toFilters(query);
      const subscription = forkJoin({
        total: this.usageService.getSummary({ ...filters, granularity: 'total' }),
        byType: this.usageService.getSummary({ ...filters, granularity: 'total', groupBy: ['type'] }),
        byModel: this.usageService.getSummary({ ...filters, granularity: 'total', groupBy: ['llmMod'] }),
      }).subscribe({
        next: (result) => this.previousOverview.set(result),
        error: () => this.previousOverview.set(null),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    // The compared period's chart series - only while the "A vs B" chart is showing.
    effect((onCleanup) => {
      const query = this.compareSeriesQuery();
      this.compareSeriesResult.set(null);
      this.compareSeriesFailed.set(false);
      if (!query) {
        this.compareSeriesLoading.set(false);
        return;
      }

      this.compareSeriesLoading.set(true);
      const subscription = this.usageService.getSummary({ ...toFilters(query), granularity: query.granularity }).subscribe({
        next: (rows) => {
          this.compareSeriesResult.set({ query, rows });
          this.compareSeriesLoading.set(false);
        },
        error: () => {
          this.compareSeriesFailed.set(true);
          this.compareSeriesLoading.set(false);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });

    // Chart: also refetches on granularity / split changes.
    effect((onCleanup) => {
      const query = this.seriesQuery();
      if (!query) {
        return;
      }

      this.seriesLoading.set(true);
      this.seriesError.set(null);

      const subscription = this.usageService
        .getSummary({ ...toFilters(query), granularity: query.granularity, groupBy: [query.splitBy] })
        .subscribe({
          next: (rows) => {
            this.seriesResult.set({ query, rows });
            this.seriesLoading.set(false);
          },
          error: (error) => {
            this.seriesError.set(this.messageOf(error));
            this.seriesLoading.set(false);
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.loadFilters();
  }

  protected loadFilters(): void {
    this.filtersLoading.set(true);
    this.filtersError.set(false);
    this.usageService.getFilters().subscribe({
      next: (filters) => {
        this.filters.set(filters);
        this.filtersLoading.set(false);
      },
      error: () => {
        this.filtersError.set(true);
        this.filtersLoading.set(false);
      },
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  // ---- filter handlers: each one just writes the new state to the URL ----

  protected selectPreset(preset: UsagePreset): void {
    const maxDate = this.filters()?.maxDate;
    if (maxDate) {
      this.applyRange(presetRange(preset, maxDate));
    }
  }

  /** Moving `from` past `to` drags `to` along (and vice versa below), so the range can never become invalid (which the backend would answer with a 400). */
  protected setFrom(value: string): void {
    const state = this.state();
    if (!state || !isValidIsoDate(value)) {
      return;
    }
    this.applyRange({ from: value, to: value > state.to ? value : state.to });
  }

  protected setTo(value: string): void {
    const state = this.state();
    if (!state || !isValidIsoDate(value)) {
      return;
    }
    this.applyRange({ to: value, from: value < state.from ? value : state.from });
  }

  protected setGranularity(granularity: BucketGranularity): void {
    this.apply({ granularity });
  }

  protected setSplit(splitBy: GroupByField): void {
    this.apply({ splitBy });
  }

  protected setView(view: ChartViewMode): void {
    this.apply({ view });
  }

  protected toggleType(type: string): void {
    this.apply({ types: this.toggled(this.state()?.types, type) });
  }

  protected toggleFlow(flow: string): void {
    this.apply({ flows: this.toggled(this.state()?.flows, flow) });
  }

  protected toggleModel(model: string): void {
    this.apply({ models: this.toggled(this.state()?.models, model) });
  }

  protected clearTypes(): void {
    this.apply({ types: [] });
  }

  protected clearModels(): void {
    this.apply({ models: [] });
  }

  protected clearFlows(): void {
    this.apply({ flows: [] });
  }

  protected toggleCompare(): void {
    const state = this.state();
    if (state) {
      this.apply({ compare: !state.compare });
    }
  }

  /** Moving one end of the comparison period past the other drags the other along, like the main range. */
  protected setCompareFrom(value: string): void {
    const period = this.comparePeriod();
    if (!period || !isValidIsoDate(value)) {
      return;
    }
    this.apply({ compareFrom: value, compareTo: value > period.to ? value : period.to });
  }

  protected setCompareTo(value: string): void {
    const period = this.comparePeriod();
    if (!period || !isValidIsoDate(value)) {
      return;
    }
    this.apply({ compareTo: value, compareFrom: value < period.from ? value : period.from });
  }

  /** Back to the automatic "previous period of the same length". */
  protected resetComparePeriod(): void {
    this.apply({ compareFrom: null, compareTo: null });
  }

  protected setPage(page: number): void {
    this.apply({ page });
  }

  protected setSort(sort: UsageTableSort): void {
    // A new sort starts from the first page.
    this.apply({ sortBy: sort.sortBy, order: sort.order, page: 1 });
  }

  protected resetFilters(): void {
    this.apply({ types: [], flows: [], models: [] });
  }

  // ---- display helpers ----

  protected cost(value: number): string {
    return formatCost(value, this.locale());
  }

  protected integer(value: number): string {
    return formatInteger(value, this.locale());
  }

  protected compact(value: number): string {
    return formatCompact(value, this.locale());
  }

  protected percent(fraction: number): string {
    return new Intl.NumberFormat(this.locale(), { style: 'percent', maximumFractionDigits: 1 }).format(fraction);
  }

  /** Human label for a flow type, falling back to the raw value - new types can appear on the backend without a frontend release. */
  protected readonly typeLabelFn = (type: string): string => this.typeLabel(type);

  protected typeLabel(type: string): string {
    this.translationsVersion();
    const key = `usage.types.${type}`;
    const label = this.translate.instant(key);
    return label === key ? type : label;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    this.translationsVersion();
    return this.translate.instant(key, params);
  }

  /** "Sep 1 – Sep 7, 2026" */
  private rangeLabel(from: string, to: string): string {
    const format = new Intl.DateTimeFormat(this.locale(), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const date = (iso: string) => format.format(new Date(`${iso}T00:00:00Z`));
    return from === to ? date(from) : `${date(from)} – ${date(to)}`;
  }

  private dimensionLabel(dimension: GroupByField, key: string): string {
    return dimension === 'type' ? this.typeLabel(key) : key;
  }

  private optionsFor(dimension: GroupByField, filters: LlmUsageFiltersResponse): string[] {
    switch (dimension) {
      case 'llmMod':
        return filters.llmMods;
      case 'type':
        return filters.types;
      case 'flow':
        return filters.flows;
    }
  }

  private colorFor(key: string, options: readonly string[]): string {
    let index = options.indexOf(key);
    if (index < 0) {
      // Not in the dictionary (a stale link, say) - a stable hash still gives it a consistent color.
      index = [...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
    }
    return SERIES_PALETTE[index % SERIES_PALETTE.length];
  }

  /** Breakdown rows for one dimension. While comparing, every entity of either period gets a row (one that only exists in the other period shows up with 0). */
  private toBreakdown(
    rows: readonly LlmUsageSummaryRow[],
    field: GroupByField,
    previousRows: readonly LlmUsageSummaryRow[] | null,
  ): BreakdownItem[] {
    const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
    const previousByKey = new Map<string, LlmUsageSummaryRow>();
    for (const row of previousRows ?? []) {
      previousByKey.set(rowKey(row, field), row);
    }
    const previousTotalCost = (previousRows ?? []).reduce((sum, row) => sum + row.cost, 0);
    const percentFormat = new Intl.NumberFormat(this.locale(), { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

    const own = new Map(rows.map((row) => [rowKey(row, field), row]));
    const keys = [...own.keys(), ...[...previousByKey.keys()].filter((key) => !own.has(key))];

    return keys
      .map((key) => {
        const row = own.get(key);
        const cost = row?.cost ?? 0;
        const requests = row?.requests ?? 0;

        let previous: BreakdownPrevious | null = null;
        if (previousRows) {
          const before = previousByKey.get(key);
          const beforeCost = before?.cost ?? 0;
          const delta = compareValues(cost, beforeCost);
          previous = {
            cost: beforeCost,
            share: previousTotalCost > 0 ? beforeCost / previousTotalCost : 0,
            changeText: delta.kind === 'change' ? percentFormat.format(delta.fraction) : delta.kind === 'new' ? this.t('usage.compare.new') : '',
            direction: delta.kind === 'change' ? delta.direction : 'flat',
          };
        }

        return {
          key,
          label: this.dimensionLabel(field, key),
          cost,
          requests,
          share: totalCost > 0 ? cost / totalCost : 0,
          noTokens: !!row && row.requests > 0 && row.cost === 0 && row.inputTokens === 0 && row.outputTokens === 0,
          previous,
        };
      })
      .sort((a, b) => b.cost - a.cost || (b.previous?.cost ?? 0) - (a.previous?.cost ?? 0) || b.requests - a.requests || a.key.localeCompare(b.key));
  }

  private toggled(current: readonly string[] | undefined, value: string): string[] {
    const list = current ?? [];
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  /** A new period also re-picks the chart's time step to suit its length (a month of days, a quarter of weeks, ...); the step can still be changed by hand afterwards. */
  private applyRange(range: { from: string; to: string }): void {
    this.apply({ ...range, granularity: suggestGranularity(range.from, range.to) });
  }

  private apply(patch: Partial<UsageState>): void {
    const state = this.state();
    if (!state) {
      return;
    }
    // The table's page only makes sense for the data it was loaded with: a new period / filter set starts at page 1.
    const dataChanged = ['from', 'to', 'types', 'flows', 'models'].some((key) => key in patch);
    const next = { ...state, ...patch, page: patch.page ?? (dataChanged ? 1 : state.page) };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: usageStateToQueryParams(next),
      // Filter tweaks shouldn't each become a back-button step.
      replaceUrl: true,
    });
  }

  private messageOf(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const message = error.error?.message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string' && message) {
        return message;
      }
    }
    return this.t('usage.error.generic');
  }
}
