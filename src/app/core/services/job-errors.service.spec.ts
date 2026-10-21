import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { errorToastInterceptor } from '../interceptors/error-toast.interceptor';
import { JobErrorsService } from './job-errors.service';
import { ToastService } from './toast.service';

const API = 'http://localhost:3000';

const LOGS = {
  items: [
    { id: 'e1', jobId: 'j1', error: { message: 'boom' }, createdAt: '2026-10-21T19:28:24.813Z' },
    { id: 'e2', jobId: 'j1', error: { key: 'v' }, createdAt: '2026-10-21T18:47:38.822Z' },
    { id: 'e3', jobId: 'j2', error: 'x', createdAt: '2026-10-21T17:00:00.000Z' },
  ],
  total: 23,
  page: 1,
  limit: 10,
};

describe('JobErrorsService', () => {
  let service: JobErrorsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideHttpClient(withInterceptors([errorToastInterceptor])), provideHttpClientTesting()],
    });
    service = TestBed.inject(JobErrorsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests one page of logs and stores the items and paging', () => {
    service.loadErrors({ page: 2 });
    expect(service.loading()).toBe(true);

    const req = httpMock.expectOne((r) => r.url === `${API}/job-errors`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush({ ...LOGS, page: 2 });

    expect(service.errors().map((log) => log.id)).toEqual(['e1', 'e2', 'e3']);
    expect([service.total(), service.page(), service.limit(), service.loading()]).toEqual([23, 2, 10, false]);
    httpMock.expectOne(`${API}/jobs/j1`).flush({});
    httpMock.expectOne(`${API}/jobs/j2`).flush({});
  });

  it('fetches each distinct job once, from GET /jobs/:id, and keeps what it got', () => {
    service.loadErrors();
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush(LOGS);

    const j1 = httpMock.expectOne(`${API}/jobs/j1`);
    expect(service.jobs()['j1']).toEqual({ state: 'loading' });
    j1.flush({ id: 'j1', kind: 'seo', status: 'failed' });
    httpMock.expectOne(`${API}/jobs/j2`).flush({ id: 'j2', kind: 'communication', status: 'success' });

    expect(service.jobs()['j1']).toEqual({ state: 'ready', job: expect.objectContaining({ id: 'j1', kind: 'seo' }) });

    // Going to another page that mentions j1 again doesn't refetch it.
    service.loadErrors({ page: 2 });
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush(LOGS);
    httpMock.expectNone(`${API}/jobs/j1`);
  });

  it('marks a deleted job as missing (404) without a toast, and a failing one as an error that can be retried', () => {
    const toast = TestBed.inject(ToastService);
    service.loadErrors();
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush(LOGS);

    httpMock.expectOne(`${API}/jobs/j1`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(`${API}/jobs/j2`).flush('oops', { status: 500, statusText: 'Server Error' });

    expect(service.jobs()['j1']).toEqual({ state: 'missing' });
    expect(service.jobs()['j2']).toEqual({ state: 'error' });
    expect(toast.toasts().length).toBe(0);

    service.loadJob('j1');
    httpMock.expectNone(`${API}/jobs/j1`);
    service.loadJob('j2');
    httpMock.expectOne(`${API}/jobs/j2`).flush({ id: 'j2', kind: 'seo', status: 'pending' });
    expect(service.jobs()['j2'].state).toBe('ready');
  });

  it('flags a failed page request so the page can offer a retry', () => {
    service.loadErrors();
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush('x', { status: 500, statusText: 'Server Error' });

    expect(service.failed()).toBe(true);
    expect(service.loading()).toBe(false);
    // ...and the page request itself still toasts, unlike the per-job lookups.
    expect(TestBed.inject(ToastService).toasts().length).toBe(1);
  });
});
