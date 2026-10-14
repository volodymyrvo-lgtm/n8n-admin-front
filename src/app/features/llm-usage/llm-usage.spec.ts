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

  beforeEach(async () => {
    chartConfigs = [];
    donutConfigs = [];
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

  afterEach(() => httpMock.verify());

  const summaryRequests = () => httpMock.match((r) => r.url === `${API}/summary`);
  const element = (fixture: ComponentFixture<LlmUsageComponent>) => fixture.nativeElement as HTMLElement;

  function buttonByText(fixture: ComponentFixture<LlmUsageComponent>, text: string): HTMLButtonElement {
    const found = Array.from(element(fixture).querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
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

  it('logs out and returns to the login page', () => {
    const fixture = TestBed.createComponent(LlmUsageComponent);
    load(fixture);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    (element(fixture).querySelector('.logout-btn') as HTMLButtonElement).click();

    expect(authStub.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
