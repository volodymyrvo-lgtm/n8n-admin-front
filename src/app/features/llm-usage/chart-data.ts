import type { GroupByField, LlmUsageSummaryRow } from '../../core/models/llm-usage.model';
import { BucketCoverage, BucketGranularity, bucketCoverage, bucketStarts } from './date-utils';

/** Key of the single series used when the chart isn't split by any dimension. */
export const TOTAL_SERIES_KEY = '__total__';

export interface ChartSeriesData {
  key: string;
  /** Cost per bucket, aligned with `ChartModel.periods`. */
  data: number[];
  total: number;
}

export interface ChartModel {
  /** Start date of every bucket in the range, empty ones included. */
  periods: string[];
  /** One entry per `periods` item. */
  coverage: BucketCoverage[];
  /** Biggest spender first (so it sits at the bottom of the stack). */
  series: ChartSeriesData[];
}

export interface ChartModelOptions {
  granularity: BucketGranularity;
  /** The dimension the rows were grouped by, or null for a single overall series. */
  splitBy: GroupByField | null;
  from: string;
  to: string;
  maxDate: string | null;
}

/**
 * Turns `GET /llm-usage/summary` rows into a chart-ready model: lays out
 * every bucket in the range (the backend omits buckets without data, so
 * they're filled in here as zeros) and sums cost per bucket per series.
 */
export function buildChartModel(rows: readonly LlmUsageSummaryRow[], options: ChartModelOptions): ChartModel {
  const periods = bucketStarts(options.from, options.to, options.granularity);
  const indexByPeriod = new Map(periods.map((period, index) => [period, index]));

  const byKey = new Map<string, number[]>();
  const seriesFor = (key: string): number[] => {
    let data = byKey.get(key);
    if (!data) {
      data = periods.map(() => 0);
      byKey.set(key, data);
    }
    return data;
  };

  for (const row of rows) {
    if (row.period === null) {
      continue;
    }
    const index = indexByPeriod.get(row.period);
    if (index === undefined) {
      continue;
    }
    const key = options.splitBy ? (row[options.splitBy] ?? '—') : TOTAL_SERIES_KEY;
    seriesFor(key)[index] += row.cost;
  }

  if (!options.splitBy) {
    seriesFor(TOTAL_SERIES_KEY);
  }

  const series = [...byKey.entries()]
    .map(([key, data]) => ({ key, data, total: data.reduce((sum, value) => sum + value, 0) }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  return {
    periods,
    coverage: periods.map((period) => bucketCoverage(period, options.granularity, options.from, options.to, options.maxDate)),
    series,
  };
}

/** Two periods laid side by side: bucket 1 of A against bucket 1 of B, and so on. */
export interface CompareChartModel {
  /** Number of buckets of the longer period. */
  size: number;
  /** Total cost per bucket index; `null` past the end of the shorter period. */
  a: (number | null)[];
  b: (number | null)[];
  /** Bucket start dates by index (`null` past the end), for the tooltips. */
  periodsA: (string | null)[];
  periodsB: (string | null)[];
  /** Either side's bucket at this index is cut off or still in progress, so the two aren't strictly comparable. */
  partial: boolean[];
  /** Either side's bucket at this index is still in progress (data up to yesterday only). */
  ongoing: boolean[];
}

function totalsPerBucket(model: ChartModel): number[] {
  return model.periods.map((_, index) => model.series.reduce((sum, series) => sum + (series.data[index] ?? 0), 0));
}

/**
 * Lines two periods' per-bucket totals up by position, so "day 3 of period
 * A" sits next to "day 3 of period B" whatever the actual dates are. The
 * periods can differ in length: the shorter one just has no bars at the end.
 */
export function buildCompareChartModel(a: ChartModel, b: ChartModel): CompareChartModel {
  const size = Math.max(a.periods.length, b.periods.length);
  const totalsA = totalsPerBucket(a);
  const totalsB = totalsPerBucket(b);
  const at = <T>(items: readonly T[], index: number): T | null => (index < items.length ? items[index] : null);
  const indexes = Array.from({ length: size }, (_, index) => index);

  return {
    size,
    a: indexes.map((i) => at(totalsA, i)),
    b: indexes.map((i) => at(totalsB, i)),
    periodsA: indexes.map((i) => at(a.periods, i)),
    periodsB: indexes.map((i) => at(b.periods, i)),
    partial: indexes.map((i) => (a.coverage[i]?.partial ?? false) || (b.coverage[i]?.partial ?? false)),
    ongoing: indexes.map((i) => (a.coverage[i]?.ongoing ?? false) || (b.coverage[i]?.ongoing ?? false)),
  };
}

export interface DonutSliceInput {
  key: string;
  label: string;
  /** `#rrggbb`. */
  color: string;
  value: number;
}

export interface DonutSlice extends DonutSliceInput {
  /** Fraction (0..1) of the donut's total. */
  share: number;
  /** The slice that stands in for everything beyond the biggest ones. */
  isRest: boolean;
}

/** A donut reads at a glance only up to about six slices; past that the smallest ones blur together. */
export const MAX_DONUT_SLICES = 6;

export interface DonutOptions {
  maxSlices?: number;
  /** Label of the "everything else" slice, given how many entries it folds together. */
  restLabel: (count: number) => string;
  restColor: string;
}

/**
 * Turns per-entity totals into donut slices: the biggest first, entries
 * without spend dropped, and - when there are more than `maxSlices` -
 * the smallest ones folded into a single neutral "rest" slice so the
 * ring stays legible. Colors follow the entity (they're passed in), so a
 * slice keeps its color between the bar and donut views.
 */
export function buildDonutSlices(items: readonly DonutSliceInput[], options: DonutOptions): DonutSlice[] {
  const maxSlices = options.maxSlices ?? MAX_DONUT_SLICES;
  const positive = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return [];
  }

  const share = (value: number) => value / total;
  if (positive.length <= maxSlices) {
    return positive.map((item) => ({ ...item, share: share(item.value), isRest: false }));
  }

  const shown = positive.slice(0, maxSlices - 1);
  const rest = positive.slice(maxSlices - 1);
  const restValue = rest.reduce((sum, item) => sum + item.value, 0);
  return [
    ...shown.map((item) => ({ ...item, share: share(item.value), isRest: false })),
    {
      key: '__rest__',
      label: options.restLabel(rest.length),
      color: options.restColor,
      value: restValue,
      share: share(restValue),
      isRest: true,
    },
  ];
}
