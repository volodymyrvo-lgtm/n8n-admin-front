import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import type { LlmUsageRow, PaginatedLlmUsage } from '../../../core/models/llm-usage.model';
import { UsageTableComponent, UsageTableSort } from './usage-table';

const API = 'http://localhost:3000/llm-usage';

function usageRow(overrides: Partial<LlmUsageRow> = {}): LlmUsageRow {
  return {
    id: 'r1',
    date: '2026-10-11',
    flow: 'NEW_CRM_PPLEN_Email_Generation',
    type: 'new_email_generation',
    llmMod: 'claude-sonnet-5',
    requests: 4,
    inputTokens: 76836,
    outputTokens: 10893,
    cacheReadTokens: 1500,
    cacheWriteTokens: 20,
    cost: 0.262602,
    ...overrides,
  };
}

function page(items: LlmUsageRow[], total = items.length, pageNo = 1): PaginatedLlmUsage {
  return { items, total, page: pageNo, limit: 25 };
}

describe('UsageTableComponent', () => {
  let httpMock: HttpTestingController;
  let fixture: ComponentFixture<UsageTableComponent>;
  let pages: number[];
  let sorts: UsageTableSort[];

  beforeEach(async () => {
    pages = [];
    sorts = [];
    await TestBed.configureTestingModule({
      imports: [UsageTableComponent],
      providers: [provideTranslateService(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const el = () => fixture.nativeElement as HTMLElement;
  const requests = (): TestRequest[] => httpMock.match((r) => r.url === API);

  function create(inputs: Partial<{ page: number; sortBy: string; order: string; filters: object }> = {}): void {
    fixture = TestBed.createComponent(UsageTableComponent);
    fixture.componentRef.setInput('filters', inputs.filters ?? { from: '2026-10-01', to: '2026-10-11', type: ['a', 'b'] });
    fixture.componentRef.setInput('page', inputs.page ?? 1);
    fixture.componentRef.setInput('sortBy', inputs.sortBy ?? 'date');
    fixture.componentRef.setInput('order', inputs.order ?? 'desc');
    fixture.componentInstance.pageChange.subscribe((p) => pages.push(p));
    fixture.componentInstance.sortChange.subscribe((s) => sorts.push(s));
    fixture.detectChanges();
  }

  function load(result: PaginatedLlmUsage): void {
    const [req] = requests();
    req.flush(result);
    fixture.detectChanges();
  }

  it('asks the backend for the filtered, sorted, paginated rows', () => {
    create({ page: 2, sortBy: 'cost', order: 'asc' });

    const [req] = requests();
    const params = req.request.params;
    expect(params.get('from')).toBe('2026-10-01');
    expect(params.get('to')).toBe('2026-10-11');
    expect(params.getAll('type')).toEqual(['a', 'b']);
    expect([params.get('page'), params.get('limit'), params.get('sortBy'), params.get('order')]).toEqual(['2', '25', 'cost', 'asc']);
    req.flush(page([]));
  });

  it('shows a spinner until the first response arrives', () => {
    create();
    expect(el().querySelector('app-spinner')).toBeTruthy();
    expect(el().querySelector('table')).toBeNull();
    load(page([usageRow()]));
    expect(el().querySelector('app-spinner')).toBeNull();
  });

  it('renders one row per daily record with all ten columns', () => {
    create();
    load(page([usageRow(), usageRow({ id: 'r2', date: '2026-10-10', llmMod: 'gpt-6-astra' })]));

    expect(el().querySelectorAll('thead th')).toHaveLength(10);
    const rows = el().querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => td.textContent?.trim());
    expect(cells).toEqual([
      '2026-10-11',
      'NEW_CRM_PPLEN_Email_Generation',
      'new_email_generation',
      'claude-sonnet-5',
      '4',
      '76,836',
      '10,893',
      '1,500',
      '20',
      '$0.262602',
    ]);
  });

  it('keeps tiny costs visible instead of rounding them to zero', () => {
    create();
    load(page([usageRow({ cost: 0.000042 })]));
    expect(el().querySelector('.usage-table__cost')?.textContent?.trim()).toBe('$0.000042');
  });

  it('marks rows that made requests but reported no tokens or cost', () => {
    create();
    load(
      page([
        usageRow({ id: 'metered' }),
        usageRow({ id: 'free', llmMod: 'gpt-6-astra', inputTokens: 0, outputTokens: 0, cost: 0 }),
      ]),
    );

    const costs = Array.from(el().querySelectorAll('.usage-table__cost'));
    expect(costs[0].classList).not.toContain('usage-table__cost--unmetered');
    expect(costs[1].classList).toContain('usage-table__cost--unmetered');
    expect(costs[1].getAttribute('title')).toBe('usage.table.unmetered');
  });

  it('uses the supplied label for the type column', () => {
    create();
    fixture.componentRef.setInput('typeLabel', (type: string) => `label:${type}`);
    load(page([usageRow()]));
    expect(el().querySelectorAll('tbody td')[2].textContent?.trim()).toBe('label:new_email_generation');
  });

  it('shows an empty message when the period has no rows', () => {
    create();
    load(page([]));
    expect(el().querySelector('.usage-table__empty')).toBeTruthy();
    expect(el().querySelector('table')).toBeNull();
  });

  describe('sorting', () => {
    it('makes only the columns the backend can sort by clickable, and marks the active one', () => {
      create({ sortBy: 'cost', order: 'asc' });
      load(page([usageRow()]));

      const sortable = Array.from(el().querySelectorAll('thead th')).filter((th) => th.querySelector('button'));
      expect(sortable.map((th) => th.textContent?.trim())).toEqual([
        'usage.table.columns.date',
        'usage.table.columns.requests',
        'usage.table.columns.inputTokens',
        'usage.table.columns.outputTokens',
        'usage.table.columns.cost',
      ]);
      const aria = Array.from(el().querySelectorAll('thead th')).map((th) => th.getAttribute('aria-sort'));
      expect(aria).toEqual(['none', null, null, null, 'none', 'none', 'none', null, null, 'ascending']);
    });

    it('flips the direction when the active column is clicked again', () => {
      create({ sortBy: 'date', order: 'desc' });
      load(page([usageRow()]));

      (el().querySelector('thead th button') as HTMLButtonElement).click();
      expect(sorts).toEqual([{ sortBy: 'date', order: 'asc' }]);
    });

    it('starts a newly clicked column from the biggest value', () => {
      create({ sortBy: 'date', order: 'asc' });
      load(page([usageRow()]));

      const costButton = Array.from(el().querySelectorAll('thead th button')).find((b) => b.textContent?.includes('cost')) as HTMLButtonElement;
      costButton.click();
      expect(sorts).toEqual([{ sortBy: 'cost', order: 'desc' }]);
    });

    it('refetches when the sort changes', () => {
      create();
      load(page([usageRow()]));

      fixture.componentRef.setInput('sortBy', 'requests');
      fixture.detectChanges();

      const [req] = requests();
      expect(req.request.params.get('sortBy')).toBe('requests');
      req.flush(page([usageRow()]));
    });
  });

  describe('pagination', () => {
    it('shows the row count and a paginator for more than one page', () => {
      create();
      load(page([usageRow()], 60));

      expect(el().querySelector('.usage-table__count')?.textContent).toContain('usage.table.rows');
      expect(el().querySelector('app-paginator .paginator')).toBeTruthy();
    });

    it('emits the new page when the paginator is used', () => {
      create({ page: 2 });
      load(page([usageRow()], 60, 2));

      (el().querySelectorAll('app-paginator .icon-btn')[1] as HTMLButtonElement).click();
      expect(pages).toEqual([3]);
    });

    it('does not show a paginator for a single page', () => {
      create();
      load(page([usageRow()], 10));
      expect(el().querySelector('app-paginator .paginator')).toBeNull();
    });

    it('jumps back to the last page when the requested one is past the end', () => {
      create({ page: 9 });
      load(page([], 60, 9));
      expect(pages).toEqual([3]);
    });
  });

  describe('errors and stale requests', () => {
    it('shows the backend message for a 400', () => {
      create();
      const [req] = requests();
      req.flush({ statusCode: 400, message: ['page must not be less than 1'] }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      expect(el().querySelector('.alert')?.textContent).toContain('page must not be less than 1');
    });

    it('shows a generic message for other errors', () => {
      create();
      requests()[0].flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(el().querySelector('.alert')?.textContent).toContain('usage.error.generic');
    });

    it('cancels the request a newer one supersedes', () => {
      create({ page: 1 });
      const [first] = requests();

      fixture.componentRef.setInput('page', 2);
      fixture.detectChanges();

      expect(first.cancelled).toBe(true);
      requests()[0].flush(page([usageRow()], 60, 2));
    });

    it('does not refetch for an identical filter object', () => {
      create();
      load(page([usageRow()]));

      fixture.componentRef.setInput('filters', { from: '2026-10-01', to: '2026-10-11', type: ['a', 'b'] });
      fixture.detectChanges();

      expect(requests()).toHaveLength(0);
    });
  });
});
