import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import type { ChartConfiguration } from 'chart.js';
import { vi } from 'vitest';
import type { LlmUsageFiltersResponse, LlmUsageSummaryRow } from '../../core/models/llm-usage.model';
import { AuthService } from '../../core/services/auth.service';
import { CHART_FACTORY } from './cost-chart/cost-chart';
import { DONUT_FACTORY } from './cost-donut/cost-donut';
import { LlmUsageComponent } from './llm-usage';

const API = 'http://localhost:3000/llm-usage';

const FILTERS: LlmUsageFiltersResponse = {
  flows: ['FLOW_A', 'FLOW_B'],
  types: ['email_localization', 'new_email_generation'],
  llmMods: ['claude-sonnet-5', 'gpt-6-astra'],
  minDate: '2026-09-01',
  maxDate: '2026-10-11',
};

function row(overrides: Partial<LlmUsageSummaryRow>): LlmUsageSummaryRow {
  return {
    period: null,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    ...overrides,
  };
}

type Kind = 'total' | 'byType' | 'byModel' | 'series';

/** Which of the page's four summary requests this is. */
function kindOf(req: TestRequest): Kind {
  const params = req.request.params;
  if (params.get('granularity') !== 'total') {
    return 'series';
  }
  const groupBy = params.getAll('groupBy') ?? [];
  if (groupBy.length === 0) {
    return 'total';
  }
  return groupBy[0] === 'type' ? 'byType' : 'byModel';
}

describe('LlmUsageComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  let authStub: { logout: ReturnType<typeof vi.fn> };
  let chartConfigs: ChartConfiguration<'bar'>[];
  let donutConfigs: ChartConfiguration<'doughnut'>[];
  /** What the previous-period request (the KPI comparison) is answered with. */
  let previousResponse: LlmUsageSummaryRow[];
  /** Every previous-period request seen so far (they're answered on sight, see `summaryRequests`). */
  let previousRequests: TestRequest[];
  /** Per-kind answers for the previous-period requests (falls back to `previousResponse`). */
  let previousByKind: Partial<Record<Kind, LlmUsageSummaryRow[]>>;

  beforeEach(async () => {
    chartConfigs = [];
    donutConfigs = [];
    previousResponse = [];
    previousRequests = [];
    previousByKind = {};
    authStub = { logout: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LlmUsageComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub },
        {
          provide: CHART_FACTORY,
          useValue: (_canvas: HTMLCanvasElement, config: ChartConfiguration<'bar'>) => {
            chartConfigs.push(config);
            return { destroy: () => undefined };
          },
        },
        {
          provide: DONUT_FACTORY,
          useValue: (_canvas: HTMLCanvasElement, config: ChartConfiguration<'doughnut'>) => {
            donutConfigs.push(config);
            return { destroy: () => undefined };
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    // The detailed table's requests aren't what most of these tests are about: answer whatever is still open.
    for (const req of listRequests()) {
      if (!req.cancelled) {
        req.flush({ items: [], total: 0, page: 1, limit: 25 });
      }
    }
    httpMock.verify();
  });

  const listRequests = () => httpMock.match((r) => r.url === API);

  /**
   * The page's summary requests, minus the KPI comparison's: that one asks
   * for the period right before the selected one, so it always ends before
   * the others start. It's answered on the spot (with `previousResponse`)
   * and collected in `previousRequests`. (Only works for a batch that also
   * contains a current-period request - tests that toggle just the
   * comparison use `httpMock` directly.)
   */
  const summaryRequests = (): TestRequest[] => {
    const all = httpMock.match((r) => r.url === `${API}/summary`);
    const latestFrom = all.map((req) => req.request.params.get('from') ?? '').sort().at(-1) ?? '';
    const current: TestRequest[] = [];
    for (const req of all) {
      if ((req.request.params.get('to') ?? '') < latestFrom) {
        previousRequests.push(req);
        if (!req.cancelled) {
          req.flush(previousByKind[kindOf(req)] ?? previousResponse);
        }
      } else {
        current.push(req);
      }
    }
    return current;
  };
  const element = (fixture: ComponentFixture<LlmUsageComponent>) => fixture.nativeElement as HTMLElement;

  function buttonByText(fixture: ComponentFixture<LlmUsageComponent>, text: string, optional?: false): HTMLButtonElement;
  function buttonByText(fixture: ComponentFixture<LlmUsageComponent>, text: string, optional: true): HTMLButtonElement | undefined;
  function buttonByText(fixture: ComponentFixture<LlmUsageComponent>, text: string, optional = false): HTMLButtonElement | undefined {
    const found = Array.from(element(fixture).querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
    if (!found && optional) {
      return undefined;
    }
    if (!found) {
      throw new Error(`No button with text "${text}"`);
    }
    return found as HTMLButtonElement;
  }

  /** Opens the dropdown filter with this (translation-key) label and ticks/unticks one of its options. */
  function pick(fixture: ComponentFixture<LlmUsageComponent>, select: string, option: string): void {
    const host = Array.from(element(fixture).querySelectorAll('app-multi-select')).find(
      (el) => el.querySelector('.ms__label')?.textContent?.trim() === select,
    );
    if (!host) {
      throw new Error(`No dropdown "${select}"`);
    }
    if (!host.querySelector('.ms__panel')) {
      (host.querySelector('.ms__button') as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    const label = Array.from(host.querySelectorAll('.ms__option')).find((el) => el.textContent?.trim() === option);
    if (!label) {
      throw new Error(`No option "${option}" in "${select}"`);
    }
    (label.querySelector('input') as HTMLInputElement).click();
  }

  /** Renders the page, answers /filters and returns the four summary requests it then fires. */
  function load(
    fixture: ComponentFixture<LlmUsageComponent>,
    filters: LlmUsageFiltersResponse = FILTERS,
  ): Record<Kind, TestRequest> {
    fixture.detectChanges();
    httpMock.expectOne(`${API}/filters`).flush(filters);
    fixture.detectChanges();

    const requests = summaryRequests();
    expect(requests).toHaveLength(4);
    return Object.fromEntries(requests.map((req) => [kindOf(req), req])) as Record<Kind, TestRequest>;
  }

  function respond(
    requests: Record<Kind, TestRequest>,
    data: Partial<Record<Kind, LlmUsageSummaryRow[]>> = {},
  ): void {
    for (const kind of ['total', 'byType', 'byModel', 'series'] as const) {
      requests[kind].flush(data[kind] ?? []);
    }
  }

  const NON_EMPTY: Partial<Record<Kind, LlmUsageSummaryRow[]>> = {
    total: [row({ requests: 1234, inputTokens: 1_200_000, outputTokens: 61_000, cost: 12.5 })],
    byType: [
      row({ type: 'email_localization', requests: 400, cost: 4 }),
      row({ type: 'new_email_generation', requests: 834, cost: 8.5 }),
    ],
    byModel: [
      row({ llmMod: 'gpt-6-astra', requests: 40 }),
      row({ llmMod: 'claude-sonnet-5', requests: 1194, cost: 12.5 }),
    ],
    series: [
      row({ period: '2026-10-09', llmMod: 'claude-sonnet-5', cost: 5 }),
      row({ period: '2026-10-11', llmMod: 'claude-sonnet-5', cost: 7.5 }),
    ],
  };

  async function settle(fixture: ComponentFixture<LlmUsageComponent>): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('loads the filter dictionary, then the overview and the chart for the last 30 days ending on maxDate', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    const requests = load(fixture);

    for (const req of Object.values(requests)) {
      expect(req.request.params.get('from')).toBe('2026-09-12');
      expect(req.request.params.get('to')).toBe('2026-10-11');
      expect(req.request.params.has('type')).toBe(false);
      expect(req.request.params.has('flow')).toBe(false);
      expect(req.request.params.has('llmMod')).toBe(false);
      expect(req.request.params.has('date')).toBe(false);
    }
    expect(requests.series.request.params.get('granularity')).toBe('day');
    expect(requests.series.request.params.getAll('groupBy')).toEqual(['llmMod']);
    expect(requests.total.request.params.has('groupBy')).toBe(false);
    expect(requests.byType.request.params.getAll('groupBy')).toEqual(['type']);
    expect(requests.byModel.request.params.getAll('groupBy')).toEqual(['llmMod']);
  });

  it('shows the KPI totals for the period', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    const values = Array.from(element(fixture).querySelectorAll('.kpi__value')).map((v) => v.textContent?.trim());
    expect(values).toEqual(['$12.50', '1.2K', '1.2M', '61K']);
    // The exact figure is still reachable behind the abbreviation.
    expect(element(fixture).querySelectorAll('.kpi__value')[1].getAttribute('title')).toBe('1,234');
  });

  it('breaks spend down by type and by model, biggest first with each one\'s share', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    const [typeCard, modelCard] = Array.from(element(fixture).querySelectorAll('.breakdowns .card'));
    const labels = (card: Element) => Array.from(card.querySelectorAll('.bar-row__label')).map((l) => l.textContent?.trim());

    // typeLabel falls back to the raw value when there's no translation for it.
    expect(labels(typeCard)).toEqual(['new_email_generation', 'email_localization']);
    expect(labels(modelCard)).toEqual(['claude-sonnet-5', 'gpt-6-astra']);

    const shares = Array.from(typeCard.querySelectorAll('.bar-row__share')).map((s) => s.textContent?.trim());
    expect(shares).toEqual(['68%', '32%']);
  });

  it('explains a model that made requests but reported no tokens or cost, instead of showing it as free', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    const modelCard = element(fixture).querySelectorAll('.breakdowns .card')[1];
    const rows = Array.from(modelCard.querySelectorAll('.bar-row'));

    expect(rows[0].querySelector('.bar-row__note')).toBeNull();
    // The note text is a translation key here: the test harness has no translation loader.
    expect(rows[1].querySelector('.bar-row__note')?.textContent).toContain('usage.breakdown.noTokens');
  });

  it('draws the chart with every day of the range, zeros included', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    await settle(fixture);

    const config = chartConfigs.at(-1)!;
    expect(config.data.labels).toHaveLength(30);
    expect(config.data.labels?.[0]).toBe('Sep 12');
    expect(config.data.labels?.[29]).toBe('Oct 11');
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].label).toBe('claude-sonnet-5');
    const data = config.data.datasets[0].data as number[];
    expect(data[27]).toBe(5); // Oct 9
    expect(data[28]).toBe(0); // Oct 10 - the backend omits empty days
    expect(data[29]).toBe(7.5); // Oct 11
  });

  it('shows an empty state instead of blank tiles when there is nothing in the period', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), { total: [row({})] });
    fixture.detectChanges();

    expect(element(fixture).querySelector('app-empty-state')).toBeTruthy();
    expect(element(fixture).querySelector('.kpis')).toBeNull();
    expect(element(fixture).querySelector('app-cost-chart')).toBeNull();
  });

  it('shows a "no data at all" state, and fires no summary requests, when the database is empty', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${API}/filters`).flush({ flows: [], types: [], llmMods: [], minDate: null, maxDate: null });
    fixture.detectChanges();

    expect(summaryRequests()).toHaveLength(0);
    expect(element(fixture).querySelector('app-empty-state')).toBeTruthy();
    expect(element(fixture).querySelector('.panel')).toBeNull();
  });

  it('switching the time step refetches only the chart, not the totals or breakdowns', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    buttonByText(fixture, 'usage.granularity.week').click();
    await settle(fixture);

    const requests = summaryRequests();
    expect(requests).toHaveLength(1);
    expect(kindOf(requests[0])).toBe('series');
    expect(requests[0].request.params.get('granularity')).toBe('week');
    // ...for the same range and filters as before.
    expect(requests[0].request.params.get('from')).toBe('2026-09-12');
    expect(requests[0].request.params.get('to')).toBe('2026-10-11');
    requests[0].flush([]);
  });

  it('marks a period that starts before the range as partial, but not a week that ends exactly on the last loaded day', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    await settle(fixture);

    buttonByText(fixture, 'usage.granularity.week').click();
    await settle(fixture);
    summaryRequests()[0].flush([row({ period: '2026-10-05', llmMod: 'claude-sonnet-5', cost: 3 })]);
    await settle(fixture);

    const config = chartConfigs.at(-1)!;
    const background = config.data.datasets[0].backgroundColor as (ctx: { dataIndex: number }) => string;
    // The range starts on Sat Sep 12, so its first week (Mon Sep 7) is cut off...
    expect(config.data.labels).toHaveLength(5);
    expect(config.data.labels?.[0]).toBe('Sep 7');
    expect(background({ dataIndex: 0 })).toContain('rgba');
    expect(background({ dataIndex: 2 })).toBe('#ff6b4a');
    // ...while the last one (Oct 5 - Sun Oct 11) ends exactly on maxDate, so it's complete.
    expect(background({ dataIndex: 4 })).toBe('#ff6b4a');
    expect(element(fixture).querySelector('.card__note')).toBeTruthy();
  });

  it('marks the current month as still in progress', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    await settle(fixture);

    buttonByText(fixture, 'usage.granularity.month').click();
    await settle(fixture);
    summaryRequests()[0].flush([row({ period: '2026-10-01', llmMod: 'claude-sonnet-5', cost: 3 })]);
    await settle(fixture);

    const config = chartConfigs.at(-1)!;
    const background = config.data.datasets[0].backgroundColor as (ctx: { dataIndex: number }) => string;
    expect(config.data.labels).toEqual(['Sep 2026', 'Oct 2026']);
    expect(background({ dataIndex: 1 })).toContain('rgba'); // Oct runs to the 31st, data stops at the 11th
    const notes = (config.options!.plugins!.tooltip!.callbacks!.afterTitle as (i: never[]) => string)([
      { dataIndex: 1 },
    ] as never[]);
    expect(notes).toBe('usage.period.ongoing');
  });

  it('applies a quick preset and cancels the requests it supersedes', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    const initial = load(fixture); // deliberately not answered yet

    buttonByText(fixture, 'usage.presets.last7').click();
    await settle(fixture);

    for (const req of Object.values(initial)) {
      expect(req.cancelled).toBe(true);
    }
    const requests = summaryRequests();
    expect(requests).toHaveLength(4);
    for (const req of requests) {
      expect(req.request.params.get('from')).toBe('2026-10-05');
      expect(req.request.params.get('to')).toBe('2026-10-11');
    }
  });

  it('highlights the preset that matches the current range', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    expect(buttonByText(fixture, 'usage.presets.last30').classList).toContain('chip--active');
    expect(buttonByText(fixture, 'usage.presets.last7').classList).not.toContain('chip--active');
  });

  it('filters by type, sending each selected value as its own param, and shows how many are picked', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    pick(fixture, 'usage.filters.type', 'new_email_generation');
    await settle(fixture);
    pick(fixture, 'usage.filters.type', 'email_localization');
    await settle(fixture);

    const requests = summaryRequests();
    const last = requests.slice(-4);
    for (const req of last) {
      expect(req.request.params.getAll('type')).toEqual(['new_email_generation', 'email_localization']);
    }
    const typeSelect = Array.from(element(fixture).querySelectorAll('app-multi-select'))[0];
    expect(typeSelect.querySelector('.ms__count')?.textContent?.trim()).toBe('2');
    expect(typeSelect.querySelector('.ms__button')?.classList).toContain('ms__button--active');
  });

  it('clears one dropdown filter without touching the others', async () => {
    await router.navigate([], { queryParams: { type: ['email_localization'], model: ['gpt-6-astra'] } });
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    (element(fixture).querySelector('app-multi-select .ms__button') as HTMLButtonElement).click();
    fixture.detectChanges();
    (element(fixture).querySelector('.ms__clear') as HTMLButtonElement).click();
    await settle(fixture);
    summaryRequests();

    const tree = router.parseUrl(router.url);
    expect(tree.queryParams['type']).toBeUndefined();
    expect(tree.queryParams['model']).toBe('gpt-6-astra');
  });

  it('puts the filter state in the URL, so a link restores it', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    buttonByText(fixture, 'usage.presets.last7').click();
    await settle(fixture);
    pick(fixture, 'usage.filters.model', 'claude-sonnet-5');
    await settle(fixture);
    summaryRequests();

    const tree = router.parseUrl(router.url);
    expect(tree.queryParams['from']).toBe('2026-10-05');
    expect(tree.queryParams['to']).toBe('2026-10-11');
    expect(tree.queryParams['step']).toBe('day');
    expect(tree.queryParams['model']).toBe('claude-sonnet-5');
  });

  it('re-picks the time step to suit the length of a newly chosen period', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    const [fromInput] = Array.from(element(fixture).querySelectorAll<HTMLInputElement>('input[type="date"]'));
    fromInput.value = '2026-09-01'; // 41 days: too many bars for days
    fromInput.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(summaryRequests().slice(-4).find((req) => kindOf(req) === 'series')?.request.params.get('granularity')).toBe('week');
    expect(router.parseUrl(router.url).queryParams['step']).toBe('week');

    // ...and a quick preset goes back to days; the step can still be overridden by hand afterwards.
    buttonByText(fixture, 'usage.presets.last7').click();
    await settle(fixture);
    expect(router.parseUrl(router.url).queryParams['step']).toBe('day');
    summaryRequests();
  });

  it('switches the chart to a doughnut of shares without refetching, and keeps the choice in the URL', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    expect(element(fixture).querySelector('app-cost-chart')).toBeTruthy();
    expect(element(fixture).querySelector('app-cost-donut')).toBeNull();

    const donutButton = element(fixture).querySelector('button[aria-label="usage.view.donut"]') as HTMLButtonElement;
    donutButton.click();
    await settle(fixture);

    expect(summaryRequests()).toHaveLength(0);
    expect(router.parseUrl(router.url).queryParams['view']).toBe('donut');
    expect(element(fixture).querySelector('app-cost-chart')).toBeNull();
    expect(element(fixture).querySelector('app-cost-donut')).toBeTruthy();
    expect(donutConfigs.at(-1)?.data.labels).toEqual(['claude-sonnet-5']);
    expect(donutConfigs.at(-1)?.data.datasets[0].data).toEqual([12.5]);

    // The time step means nothing for a doughnut, so its control goes away.
    expect(element(fixture).textContent).not.toContain('usage.granularity.week');

    (element(fixture).querySelector('button[aria-label="usage.view.bars"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(router.parseUrl(router.url).queryParams['view']).toBeUndefined();
    expect(element(fixture).querySelector('app-cost-chart')).toBeTruthy();
  });

  it('opens straight into the doughnut from a shared link and says so when there is no spend to split', async () => {
    await router.navigate([], { queryParams: { view: 'donut' } });
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), {
      ...NON_EMPTY,
      series: [row({ period: '2026-10-09', llmMod: 'gpt-6-astra', cost: 0, requests: 3 })],
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element(fixture).querySelector('app-cost-donut')).toBeNull();
    expect(element(fixture).textContent).toContain('usage.chart.noSpend');
  });

  it('restores the state from the URL on load', async () => {
    await router.navigate([], {
      queryParams: { from: '2026-10-01', to: '2026-10-05', step: 'month', by: 'type', type: ['email_localization'] },
    });
    const fixture = TestBed.createComponent(LlmUsageComponent);
    const requests = load(fixture);

    expect(requests.series.request.params.get('from')).toBe('2026-10-01');
    expect(requests.series.request.params.get('to')).toBe('2026-10-05');
    expect(requests.series.request.params.get('granularity')).toBe('month');
    expect(requests.series.request.params.getAll('groupBy')).toEqual(['type']);
    expect(requests.total.request.params.getAll('type')).toEqual(['email_localization']);
  });

  it('accepts a custom date range, dragging the other end along so the range can not invert', async () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    const [fromInput, toInput] = Array.from(element(fixture).querySelectorAll<HTMLInputElement>('input[type="date"]'));
    fromInput.value = '2026-10-08';
    fromInput.dispatchEvent(new Event('change'));
    await settle(fixture);

    let latest = summaryRequests().slice(-4);
    expect(latest[0].request.params.get('from')).toBe('2026-10-08');
    expect(latest[0].request.params.get('to')).toBe('2026-10-11');

    toInput.value = '2026-10-02';
    toInput.dispatchEvent(new Event('change'));
    await settle(fixture);

    latest = summaryRequests().slice(-4);
    expect(latest[0].request.params.get('from')).toBe('2026-10-02');
    expect(latest[0].request.params.get('to')).toBe('2026-10-02');
  });

  it('limits the date pickers to the days that have data', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    respond(load(fixture), NON_EMPTY);
    fixture.detectChanges();

    for (const input of Array.from(element(fixture).querySelectorAll<HTMLInputElement>('input[type="date"]'))) {
      expect(input.min).toBe('2026-09-01');
      expect(input.max).toBe('2026-10-11');
    }
  });

  it('shows the server\'s message when it rejects the range (400)', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    const requests = load(fixture);

    requests.total.flush({ statusCode: 400, message: 'from must not be after to' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(element(fixture).querySelector('.alert')?.textContent).toContain('from must not be after to');
    // The other overview requests were dropped along with the failed one; the chart's is independent.
    expect(requests.byType.cancelled).toBe(true);
    requests.series.flush([]);
  });

  it('shows a generic message when a non-400 error comes back', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    const requests = load(fixture);

    requests.series.flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element(fixture).querySelector('.alert')?.textContent).toContain('usage.error.generic');
    requests.total.flush([]);
    requests.byType.flush([]);
    requests.byModel.flush([]);
  });

  it('offers a retry when the filter dictionary fails to load', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    fixture.detectChanges();
    httpMock.expectOne(`${API}/filters`).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(element(fixture).querySelector('.alert')).toBeTruthy();

    buttonByText(fixture, 'usage.error.retry').click();
    httpMock.expectOne(`${API}/filters`).flush(FILTERS);
    fixture.detectChanges();

    expect(summaryRequests()).toHaveLength(4);
    expect(element(fixture).querySelector('.alert')).toBeNull();
  });

  describe('comparison with the previous period', () => {
    it('asks for the period of the same length right before the selected one', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      load(fixture);

      // The compared period's overview: totals plus the by-type and by-model breakdowns.
      expect(previousRequests).toHaveLength(3);
      for (const req of previousRequests) {
        const params = req.request.params;
        expect([params.get('from'), params.get('to'), params.get('granularity')]).toEqual(['2026-08-13', '2026-09-11', 'total']);
      }
      expect(previousRequests.map(kindOf).sort()).toEqual(['byModel', 'byType', 'total']);
    });

    it('carries the filters over to the previous period', async () => {
      await router.navigate([], { queryParams: { type: ['email_localization'], model: ['gpt-6-astra'] } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      load(fixture);

      for (const req of previousRequests) {
        expect(req.request.params.getAll('type')).toEqual(['email_localization']);
        expect(req.request.params.getAll('llmMod')).toEqual(['gpt-6-astra']);
      }
    });

    it('shows how each KPI changed, with the previous value in the tooltip', () => {
      previousResponse = [row({ requests: 1234, inputTokens: 2_400_000, outputTokens: 61_000, cost: 10 })];
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      const deltas = Array.from(element(fixture).querySelectorAll<HTMLElement>('.kpi__delta'));
      expect(deltas.map((d) => d.textContent?.replace(/[▲▼\s]+/g, ''))).toEqual(['+25%', '0%', '-50%', '0%']);
      expect(deltas[0].classList).toContain('kpi__delta--up');
      expect(deltas[0].classList).toContain('kpi__delta--cost');
      expect(deltas[2].classList).toContain('kpi__delta--down');
      expect(deltas[1].classList).toContain('kpi__delta--flat');
    });

    it('says "new" when the previous period had nothing', () => {
      previousResponse = [];
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      const deltas = Array.from(element(fixture).querySelectorAll('.kpi__delta')).map((d) => d.textContent?.trim());
      expect(deltas).toEqual(['usage.compare.new', 'usage.compare.new', 'usage.compare.new', 'usage.compare.new']);
    });

    it('keeps the page working when the comparison request fails', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      fixture.detectChanges();
      httpMock.expectOne(`${API}/filters`).flush(FILTERS);
      fixture.detectChanges();

      const all = httpMock.match((r) => r.url === `${API}/summary`);
      const previous = all.filter((req) => req.request.params.get('to') === '2026-09-11');
      previous[0].flush('boom', { status: 500, statusText: 'Server Error' }); // the other two are dropped with it
      for (const req of all.filter((r) => !previous.includes(r))) {
        req.flush(NON_EMPTY[kindOf(req)] ?? []);
      }
      fixture.detectChanges();

      expect(element(fixture).querySelector('.alert')).toBeNull();
      expect(element(fixture).querySelector('.kpi__delta')).toBeNull();
      expect(element(fixture).querySelector('.kpi__value')?.textContent?.trim()).toBe('$12.50');
    });

    it('does not ask for a comparison when it is switched off in the URL', async () => {
      await router.navigate([], { queryParams: { cmp: '0' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(previousRequests).toHaveLength(0);
      expect(element(fixture).querySelector('.kpi__delta')).toBeNull();
      expect(buttonByText(fixture, 'usage.compare.on')).toBeTruthy();
    });

    it('can be toggled, which refetches only the comparison and is kept in the URL', async () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      buttonByText(fixture, 'usage.compare.off').click();
      await settle(fixture);
      expect(router.parseUrl(router.url).queryParams['cmp']).toBe('0');
      expect(summaryRequests()).toHaveLength(0);
      expect(element(fixture).querySelector('.kpi__delta')).toBeNull();

      buttonByText(fixture, 'usage.compare.on').click();
      await settle(fixture);
      expect(router.parseUrl(router.url).queryParams['cmp']).toBeUndefined();
      const requests = httpMock.match((r) => r.url === `${API}/summary`);
      expect(requests).toHaveLength(3);
      for (const req of requests) {
        expect(req.request.params.get('to')).toBe('2026-09-11');
        req.flush([]);
      }
    });

    it('says so, and sends no request, when the previous period lies before the first day of data', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture, { ...FILTERS, minDate: '2026-09-12' }), NON_EMPTY);
      fixture.detectChanges();

      expect(previousRequests).toHaveLength(0);
      expect(element(fixture).querySelector('.compare-bar__note')?.textContent).toContain('usage.compare.unavailable');
      expect(element(fixture).querySelector('.kpi__delta')).toBeNull();
    });
  });

  describe('detailed table', () => {
    function listFor(fixture: ComponentFixture<LlmUsageComponent>) {
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();
      const requests = listRequests();
      expect(requests).toHaveLength(1);
      return requests[0];
    }

    it('loads the daily rows for the same period and filters, newest first, 25 per page', async () => {
      await router.navigate([], { queryParams: { type: ['email_localization'] } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      const params = listFor(fixture).request.params;

      expect(params.get('from')).toBe('2026-09-12');
      expect(params.get('to')).toBe('2026-10-11');
      expect(params.getAll('type')).toEqual(['email_localization']);
      expect([params.get('page'), params.get('limit'), params.get('sortBy'), params.get('order')]).toEqual(['1', '25', 'date', 'desc']);
    });

    it('opens on the page and sort order given in the URL', async () => {
      await router.navigate([], { queryParams: { page: '3', sort: 'cost', order: 'asc' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      const params = listFor(fixture).request.params;

      expect([params.get('page'), params.get('sortBy'), params.get('order')]).toEqual(['3', 'cost', 'asc']);
    });

    it('is not refetched when only the chart changes', async () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      listFor(fixture).flush({ items: [], total: 0, page: 1, limit: 25 });

      buttonByText(fixture, 'usage.granularity.week').click();
      await settle(fixture);
      summaryRequests().forEach((req) => req.flush([]));

      expect(listRequests()).toHaveLength(0);
    });

    it('writes page and sort into the URL, and a new sort or filter goes back to the first page', async () => {
      await router.navigate([], { queryParams: { page: '2' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      listFor(fixture).flush({ items: [], total: 0, page: 2, limit: 25 });

      const table = fixture.debugElement.query((el) => el.name === 'app-usage-table').componentInstance;
      table.sortChange.emit({ sortBy: 'requests', order: 'asc' });
      await settle(fixture);
      let query = router.parseUrl(router.url).queryParams;
      expect([query['sort'], query['order'], query['page']]).toEqual(['requests', 'asc', undefined]);
      listRequests().forEach((req) => req.flush({ items: [], total: 0, page: 1, limit: 25 }));

      table.pageChange.emit(4);
      await settle(fixture);
      expect(router.parseUrl(router.url).queryParams['page']).toBe('4');
      listRequests().forEach((req) => req.flush({ items: [], total: 0, page: 4, limit: 25 }));

      pick(fixture, 'usage.filters.model', 'claude-sonnet-5');
      await settle(fixture);
      summaryRequests().forEach((req) => req.flush([]));
      query = router.parseUrl(router.url).queryParams;
      expect(query['page']).toBeUndefined();
      expect(query['sort']).toBe('requests');
    });

    it('is not shown when there is no data for the period', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), { total: [row({})] });
      fixture.detectChanges();

      expect(element(fixture).querySelector('app-usage-table')).toBeNull();
      expect(listRequests()).toHaveLength(0);
    });
  });

  describe('comparing two hand-picked periods', () => {
    const CUSTOM = { cfrom: '2026-09-01', cto: '2026-09-07' };

    const compareInputs = (fixture: ComponentFixture<LlmUsageComponent>) =>
      Array.from(element(fixture).querySelectorAll<HTMLInputElement>('.compare-bar input[type="date"]'));

    it('asks for the picked period instead of the automatic previous one', async () => {
      await router.navigate([], { queryParams: CUSTOM });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(previousRequests).toHaveLength(3);
      for (const req of previousRequests) {
        expect([req.request.params.get('from'), req.request.params.get('to')]).toEqual(['2026-09-01', '2026-09-07']);
      }
      expect(compareInputs(fixture).map((input) => input.value)).toEqual(['2026-09-01', '2026-09-07']);
    });

    it('shows the automatic period in the date fields until one is picked', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(compareInputs(fixture).map((input) => input.value)).toEqual(['2026-08-13', '2026-09-11']);
      expect(element(fixture).querySelector('.compare-bar__hint')).toBeTruthy();
      expect(buttonByText(fixture, 'usage.compare.reset', true)).toBeUndefined();
    });

    it('writes a picked period to the URL and refetches only the comparison', async () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      listRequests().forEach((req) => req.flush({ items: [], total: 0, page: 1, limit: 25 }));
      const [from] = compareInputs(fixture);
      from.value = '2026-09-01';
      from.dispatchEvent(new Event('change'));
      await settle(fixture);

      const query = router.parseUrl(router.url).queryParams;
      // The other end stays where it was (Sep 11), so the period is Sep 1 - Sep 11.
      expect([query['cfrom'], query['cto']]).toEqual(['2026-09-01', '2026-09-11']);
      const requests = httpMock.match((r) => r.url === `${API}/summary`);
      expect(requests).toHaveLength(3);
      for (const req of requests) {
        expect([req.request.params.get('from'), req.request.params.get('to')]).toEqual(['2026-09-01', '2026-09-11']);
        req.flush([]);
      }
      expect(listRequests()).toHaveLength(0);
    });

    it('drags the other end along so the period can not invert', async () => {
      await router.navigate([], { queryParams: CUSTOM });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      const [, to] = compareInputs(fixture);
      to.value = '2026-08-20';
      to.dispatchEvent(new Event('change'));
      await settle(fixture);
      httpMock.match((r) => r.url === `${API}/summary`).forEach((req) => req.flush([]));

      const query = router.parseUrl(router.url).queryParams;
      expect([query['cfrom'], query['cto']]).toEqual(['2026-08-20', '2026-08-20']);
    });

    it('goes back to the automatic previous period', async () => {
      await router.navigate([], { queryParams: CUSTOM });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      buttonByText(fixture, 'usage.compare.reset').click();
      await settle(fixture);

      const query = router.parseUrl(router.url).queryParams;
      expect([query['cfrom'], query['cto']]).toEqual([undefined, undefined]);
      const requests = httpMock.match((r) => r.url === `${API}/summary`);
      expect(requests.map((req) => req.request.params.get('from'))).toEqual(['2026-08-13', '2026-08-13', '2026-08-13']);
      requests.forEach((req) => req.flush([]));
    });

    it('does not apply the "no earlier data" rule to a period the user picked', async () => {
      await router.navigate([], { queryParams: { cfrom: '2026-08-01', cto: '2026-08-07' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(previousRequests).toHaveLength(3);
      expect(element(fixture).querySelector('.compare-bar__note')?.textContent ?? '').not.toContain('usage.compare.unavailable');
    });

    it('keeps the picked period in the URL while comparing is switched off, and restores it when it is switched back on', async () => {
      await router.navigate([], { queryParams: CUSTOM });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      buttonByText(fixture, 'usage.compare.off').click();
      await settle(fixture);
      expect(router.parseUrl(router.url).queryParams['cfrom']).toBe('2026-09-01');

      buttonByText(fixture, 'usage.compare.on').click();
      await settle(fixture);
      const requests = httpMock.match((r) => r.url === `${API}/summary`);
      expect(requests.map((req) => req.request.params.get('from'))).toEqual(['2026-09-01', '2026-09-01', '2026-09-01']);
      requests.forEach((req) => req.flush([]));
    });

    it('warns about differing lengths and adds per-day averages to the tiles', async () => {
      await router.navigate([], { queryParams: CUSTOM }); // 7 days against the default 30
      previousByKind = { total: [row({ requests: 700, inputTokens: 700_000, outputTokens: 70_000, cost: 14 })] };
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(element(fixture).querySelector('.compare-bar__note--warn')?.textContent).toContain('usage.compare.lengthNote');
      const averages = Array.from(element(fixture).querySelectorAll('.kpi__avg'));
      expect(averages).toHaveLength(4);
      // Spend: $12.50 over 30 days = $0.42/day, against $14 over 7 days = $2/day.
      expect(averages[0].querySelector('.kpi__avg-change')?.textContent?.trim()).toBe('-79.2%');
      // ...while the totals alone say -10.7%.
      expect(element(fixture).querySelector('.kpi__delta')?.textContent).toContain('-10.7%');
    });

    it('shows no per-day line and no warning when both periods are equally long', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      previousByKind = { total: [row({ requests: 1, cost: 1 })] };
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(element(fixture).querySelector('.kpi__avg')).toBeNull();
      expect(element(fixture).querySelector('.compare-bar__note--warn')).toBeNull();
    });

    it('lines the breakdowns up with the other period, including entries that only exist on one side', () => {
      previousByKind = {
        total: [row({ requests: 10, cost: 3 })],
        byType: [row({ type: 'email_localization', requests: 5, cost: 2 }), row({ type: 'sms_localization', requests: 5, cost: 1 })],
      };
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      const typeCard = element(fixture).querySelectorAll('.breakdowns .card')[0];
      const labels = Array.from(typeCard.querySelectorAll('.bar-row__label')).map((l) => l.textContent?.trim());
      expect(labels).toEqual(['new_email_generation', 'email_localization', 'sms_localization']);

      const changes = Array.from(typeCard.querySelectorAll('.bar-row')).map((rowEl) => rowEl.querySelector('.bar-row__change')?.textContent?.trim());
      expect(changes).toEqual(['usage.compare.new', '+100%', '-100%']);
      expect(typeCard.querySelectorAll('.bar-row__fill--prev')).toHaveLength(3);
      // The other period's shares: 2 of 3 and 1 of 3.
      const widths = Array.from(typeCard.querySelectorAll<HTMLElement>('.bar-row__fill--prev')).map((el) => Math.round(parseFloat(el.style.width)));
      expect(widths).toEqual([0, 67, 33]);
    });

    it('shows no comparison figures in the breakdowns when comparing is off', async () => {
      await router.navigate([], { queryParams: { cmp: '0' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      expect(element(fixture).querySelector('.bar-row__prev')).toBeNull();
    });
  });

  describe('"A vs B" chart', () => {
    const compareButton = (fixture: ComponentFixture<LlmUsageComponent>) =>
      element(fixture).querySelector('button[aria-label="usage.view.compare"]') as HTMLButtonElement | null;

    it('is offered only while comparing', async () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();
      expect(compareButton(fixture)).toBeTruthy();

      buttonByText(fixture, 'usage.compare.off').click();
      await settle(fixture);
      expect(compareButton(fixture)).toBeNull();
    });

    it('is not offered when there is nothing earlier to compare with', () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture, { ...FILTERS, minDate: '2026-09-12' }), NON_EMPTY);
      fixture.detectChanges();

      expect(compareButton(fixture)).toBeNull();
    });

    it('loads the other period per bucket and draws both side by side, without a split control', async () => {
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      fixture.detectChanges();

      compareButton(fixture)!.click();
      await settle(fixture);

      expect(router.parseUrl(router.url).queryParams['view']).toBe('compare');
      const requests = summaryRequests();
      expect(requests).toHaveLength(1);
      const params = requests[0].request.params;
      expect([params.get('from'), params.get('to'), params.get('granularity')]).toEqual(['2026-08-13', '2026-09-11', 'day']);
      expect(params.has('groupBy')).toBe(false);
      requests[0].flush([row({ period: '2026-08-14', cost: 4 })]);
      await settle(fixture);

      const config = chartConfigs.at(-1)!;
      expect(config.data.datasets).toHaveLength(2);
      expect(config.data.labels).toHaveLength(30);
      const [a, b] = config.data.datasets.map((dataset) => dataset.data as number[]);
      expect(a[27]).toBe(5); // Oct 9 is day 28 of the selected period
      expect(b[1]).toBe(4); // Aug 14 is day 2 of the period compared with
      expect(config.options?.scales?.['x']).toMatchObject({ stacked: false });
      expect(element(fixture).textContent).not.toContain('usage.chart.splitBy');
      expect(element(fixture).textContent).toContain('usage.chart.compareNote');
    });

    it('opens from a shared link, and falls back to the plain bars when comparing is off', async () => {
      await router.navigate([], { queryParams: { view: 'compare', cmp: '0' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      respond(load(fixture), NON_EMPTY);
      await settle(fixture);

      expect(summaryRequests()).toHaveLength(0);
      expect(chartConfigs.at(-1)!.options?.scales?.['x']).toMatchObject({ stacked: true });
      expect(element(fixture).textContent).toContain('usage.chart.splitBy');
    });

    it('says so when the other period\'s data can not be loaded', async () => {
      await router.navigate([], { queryParams: { view: 'compare' } });
      const fixture = TestBed.createComponent(LlmUsageComponent);
      fixture.detectChanges();
      httpMock.expectOne(`${API}/filters`).flush(FILTERS);
      fixture.detectChanges();

      // The other period's chart request: per bucket (no "total"), no split, for the period compared with.
      const all = httpMock.match((r) => r.url === `${API}/summary`);
      const otherSeries = all.find((req) => req.request.params.get('granularity') === 'day' && !req.request.params.has('groupBy'))!;
      expect(otherSeries.request.params.get('from')).toBe('2026-08-13');
      otherSeries.flush('boom', { status: 500, statusText: 'Server Error' });
      for (const req of all.filter((r) => r !== otherSeries)) {
        req.flush(NON_EMPTY[kindOf(req)] ?? []);
      }
      await settle(fixture);

      expect(element(fixture).textContent).toContain('usage.compare.chartError');
    });
  });

  it('logs out and returns to the login page', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    load(fixture);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    (element(fixture).querySelector('.logout-btn') as HTMLButtonElement).click();

    expect(authStub.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
