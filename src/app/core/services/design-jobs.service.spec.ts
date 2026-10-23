import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { DesignJobRun, CreateDesignJobFormValue, JobRun } from '../models/job.model';
import { DESIGN_WEBHOOK_URLS, DesignJobsService } from './design-jobs.service';

const API = 'http://localhost:3000/jobs';
const LIVE_URL = 'https://n8n.example/webhook/design';
const TEST_URL = 'https://n8n.example/webhook-test/design';

const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = { on: vi.fn(), disconnect: vi.fn() };
  return { mockSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function makeJob(overrides: Partial<DesignJobRun> = {}): DesignJobRun {
  return {
    id: 'design-1',
    kind: 'design',
    steps: { step1: { status: 'pending' } },
    status: 'pending',
    runDate: '2026-10-14T12:30:00.000Z',
    createdAt: '2026-10-14T12:30:00.000Z',
    updatedAt: '2026-10-14T12:30:00.000Z',
    runnedById: 'user-1',
    llm: null,
    spend: {},
    tableUrl: null,
    taskDescription: 'Autumn promo banner, 1200x628',
    ...overrides,
  };
}

function makeFormValue(overrides: Partial<CreateDesignJobFormValue> = {}): CreateDesignJobFormValue {
  return { taskDescription: 'Autumn promo banner, 1200x628', isTesting: false, ...overrides };
}

function updatedHandler(): (job: JobRun | DesignJobRun) => void {
  const call = mockSocket.on.mock.calls.find(([event]) => event === 'job.updated');
  if (!call) {
    throw new Error('job.updated handler was never registered');
  }
  return call[1] as (job: JobRun | DesignJobRun) => void;
}

describe('DesignJobsService', () => {
  let httpMock: HttpTestingController;

  function setup(webhooks = { live: LIVE_URL, test: TEST_URL }): DesignJobsService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: DESIGN_WEBHOOK_URLS, useValue: webhooks }],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(DesignJobsService);
  }

  beforeEach(() => {
    ioMock.mockClear();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('loadJobs', () => {
    it('asks for kind=design only, with the pagination params', () => {
      const service = setup();
      service.loadJobs({ page: 2, limit: 5 });

      const req = httpMock.expectOne((r) => r.url === API);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('kind')).toBe('design');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('limit')).toBe('5');
      expect(service.loading()).toBe(true);

      req.flush({ items: [makeJob()], total: 11, page: 2, limit: 5 });

      expect(service.jobs()).toHaveLength(1);
      expect([service.total(), service.page(), service.limit()]).toEqual([11, 2, 5]);
      expect(service.loading()).toBe(false);
    });

    it('defaults to page 1 and 10 per page, and stops loading on an error', () => {
      const service = setup();
      service.loadJobs();

      const req = httpMock.expectOne((r) => r.url === API);
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('limit')).toBe('10');

      req.flush('boom', { status: 500, statusText: 'Server Error' });
      expect(service.loading()).toBe(false);
    });
  });

  describe('createJob', () => {
    it('posts only the trimmed task description to the backend', () => {
      const service = setup();
      service.createJob(makeFormValue({ taskDescription: '  Autumn promo banner  ' }));

      const req = httpMock.expectOne(`${API}/design`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ taskDescription: 'Autumn promo banner' });
      req.flush(makeJob());
      httpMock.expectOne(LIVE_URL).flush({});
    });

    it('adds the created job to the list and triggers n8n with the same body plus the new job id', () => {
      const service = setup();
      const onBackendSuccess = vi.fn();
      service.createJob(makeFormValue(), { onBackendSuccess });

      const backend = httpMock.expectOne(`${API}/design`);
      const backendBody = backend.request.body;
      backend.flush(makeJob({ id: 'new-id' }));

      expect(service.jobs().map((job) => job.id)).toEqual(['new-id']);
      expect(onBackendSuccess).toHaveBeenCalledTimes(1);

      const webhook = httpMock.expectOne(LIVE_URL);
      expect(webhook.request.body).toEqual({ ...backendBody, jobId: 'new-id' });
      webhook.flush({});
    });

    it('uses the test webhook when the testing toggle is on', () => {
      const service = setup();
      service.createJob(makeFormValue({ isTesting: true }));

      httpMock.expectOne(`${API}/design`).flush(makeJob());
      httpMock.expectOne(TEST_URL).flush({});
    });

    it('does not call the webhook, and reports the backend error, when the backend rejects the job', () => {
      const service = setup();
      const onBackendError = vi.fn();
      service.createJob(makeFormValue(), { onBackendError });

      httpMock.expectOne(`${API}/design`).flush({ statusCode: 400, message: ['taskDescription should not be empty'] }, { status: 400, statusText: 'Bad Request' });

      expect(onBackendError).toHaveBeenCalledTimes(1);
      expect(service.jobs()).toHaveLength(0);
      httpMock.expectNone(LIVE_URL);
    });

    it('keeps the created job and reports a failing webhook separately', () => {
      const service = setup();
      const onN8nError = vi.fn();
      service.createJob(makeFormValue(), { onN8nError });

      httpMock.expectOne(`${API}/design`).flush(makeJob());
      httpMock.expectOne(LIVE_URL).flush('boom', { status: 500, statusText: 'Server Error' });

      expect(onN8nError).toHaveBeenCalledTimes(1);
      expect(service.jobs()).toHaveLength(1);
    });

    it('says so, instead of silently doing nothing, when no webhook URL is configured', () => {
      const service = setup({ live: '', test: TEST_URL });
      const onN8nNotConfigured = vi.fn();
      service.createJob(makeFormValue(), { onN8nNotConfigured });

      httpMock.expectOne(`${API}/design`).flush(makeJob());

      expect(onN8nNotConfigured).toHaveBeenCalledTimes(1);
      expect(service.jobs()).toHaveLength(1);
    });
  });

  describe('websocket updates', () => {
    it('opens one authenticated connection to the jobs namespace', () => {
      localStorage.setItem('auth_token', 'tok');
      const service = setup();

      service.connectJobUpdates();
      service.connectJobUpdates();

      expect(ioMock).toHaveBeenCalledTimes(1);
      expect(ioMock.mock.calls[0]).toEqual([API, { auth: { token: expect.anything() } }]);
    });

    it('applies job.updated events of design jobs to the loaded page', () => {
      const service = setup();
      service.jobs.set([makeJob({ id: 'design-1', status: 'pending' })]);
      service.connectJobUpdates();

      updatedHandler()(makeJob({ id: 'design-1', status: 'success', tableUrl: 'https://sheet' }));

      expect(service.jobs()[0].status).toBe('success');
      expect(service.jobs()[0].tableUrl).toBe('https://sheet');
    });

    it('ignores other kinds of jobs and ids that are not on the page', () => {
      const service = setup();
      service.jobs.set([makeJob({ id: 'design-1', status: 'pending' })]);
      service.connectJobUpdates();

      updatedHandler()({ id: 'design-1', kind: 'communication', status: 'success' } as unknown as JobRun);
      updatedHandler()({ id: 'design-1', kind: 'seo', status: 'success' } as unknown as JobRun);
      updatedHandler()(makeJob({ id: 'other', status: 'success' }));

      expect(service.jobs()).toHaveLength(1);
      expect(service.jobs()[0].status).toBe('pending');
    });

    it('disconnects and allows reconnecting afterwards', () => {
      const service = setup();
      service.connectJobUpdates();
      service.disconnectJobUpdates();
      expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);

      service.connectJobUpdates();
      expect(ioMock).toHaveBeenCalledTimes(2);
    });
  });
});
