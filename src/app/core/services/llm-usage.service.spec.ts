import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LlmUsageService } from './llm-usage.service';

const API = 'http://localhost:3000/llm-usage';

describe('LlmUsageService', () => {
  let service: LlmUsageService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LlmUsageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the filter dictionary', () => {
    const response = { flows: ['f'], types: ['t'], llmMods: ['m'], minDate: '2026-09-01', maxDate: '2026-10-11' };
    let received: unknown;
    service.getFilters().subscribe((value) => (received = value));

    const req = httpMock.expectOne(`${API}/filters`);
    expect(req.request.method).toBe('GET');
    req.flush(response);

    expect(received).toEqual(response);
  });

  it('sends the range, granularity and grouping to /summary', () => {
    service
      .getSummary({ granularity: 'week', groupBy: ['type', 'llmMod'], from: '2026-10-01', to: '2026-10-31' })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === `${API}/summary`);
    expect(req.request.params.get('granularity')).toBe('week');
    expect(req.request.params.getAll('groupBy')).toEqual(['type', 'llmMod']);
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('to')).toBe('2026-10-31');
    expect(req.request.params.has('date')).toBe(false);
    req.flush([]);
  });

  it('sends each list filter value as its own repeated param, not comma-joined', () => {
    service
      .getSummary({
        from: '2026-10-01',
        to: '2026-10-31',
        type: ['email_localization', 'other'],
        flow: ['NEWCRM_PPL_AZ/RU_EMAIL_Localization'],
        llmMod: ['claude-sonnet-5', 'gpt-6-astra'],
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === `${API}/summary`);
    expect(req.request.params.getAll('type')).toEqual(['email_localization', 'other']);
    expect(req.request.params.getAll('flow')).toEqual(['NEWCRM_PPL_AZ/RU_EMAIL_Localization']);
    expect(req.request.params.getAll('llmMod')).toEqual(['claude-sonnet-5', 'gpt-6-astra']);
    expect(req.request.urlWithParams).not.toContain(',');
    req.flush([]);
  });

  it('omits params that are not set', () => {
    service.getSummary({ granularity: 'total', type: [] }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${API}/summary`);
    expect(req.request.params.keys()).toEqual(['granularity']);
    req.flush([]);
  });

  it('returns the rows /summary responds with', () => {
    const rows = [
      {
        period: '2026-10-05',
        llmMod: 'claude-sonnet-5',
        requests: 31,
        inputTokens: 540000,
        outputTokens: 61000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 1.84,
      },
    ];
    let received: unknown;
    service.getSummary({ granularity: 'day' }).subscribe((value) => (received = value));

    httpMock.expectOne((r) => r.url === `${API}/summary`).flush(rows);

    expect(received).toEqual(rows);
  });

  it('requests a page of the flat list with sorting', () => {
    service
      .getList({ from: '2026-10-01', to: '2026-10-31', page: 2, limit: 50, sortBy: 'cost', order: 'desc' })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('sortBy')).toBe('cost');
    expect(req.request.params.get('order')).toBe('desc');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    req.flush({ items: [], total: 0, page: 2, limit: 50 });
  });
});
