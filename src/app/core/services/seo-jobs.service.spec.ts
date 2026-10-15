import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { CreateSeoJobFormValue, JobRun, SeoJobRun } from '../models/job.model';
import { SEO_WEBHOOK_URLS, SeoJobsService } from './seo-jobs.service';

const API = 'http://localhost:3000/jobs';
const LIVE_URL = 'https://n8n.example/webhook/seo';
const TEST_URL = 'https://n8n.example/webhook-test/seo';

const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = { on: vi.fn(), disconnect: vi.fn() };
  return { mockSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function makeSeoJob(overrides: Partial<SeoJobRun> = {}): SeoJobRun {
  return {
    id: 'seo-1',
    kind: 'seo',
    steps: { step1: { status: 'pending' } },
    status: 'pending',
    runDate: '2026-10-14T12:30:00.000Z',
    createdAt: '2026-10-14T12:30:00.000Z',
    updatedAt: '2026-10-14T12:30:00.000Z',
    runnedById: 'user-1',
    llm: 'gpt_5_6_sol',
    spend: {},
    tableUrl: null,
    language: 'EN',
    prompt: 'EN prompt-1',
    pageTask: 'R048 · Кено',
    jobType: null,
    taskStatus: null,
    messageType: null,
    board: null,
    taskDescription: null,
    ruleIds: [],
    sm: null,
    glossaryId: null,
    ...overrides,
  };
}

function makeFormValue(overrides: Partial<CreateSeoJobFormValue> = {}): CreateSeoJobFormValue {
  return {
    language: 'EN',
    llm: 'gpt_5_6_sol',
    promptId: 'prompt-1',
    pageTask: 'R048 · Кено',
    toneOfVoiceRuleSetId: 'rule-tone',
    humanizerRuleSetId: 'rule-human',
    isTesting: false,
    ...overrides,
  };
}

function updatedHandler(): (job: JobRun | SeoJobRun) => void {
  const call = mockSocket.on.mock.calls.find(([event]) => event === 'job.updated');
  if (!call) {
    throw new Error('job.updated handler was never registered');
  }
  return call[1] as (job: JobRun | SeoJobRun) => void;
}

describe('SeoJobsService', () => {
  let httpMock: HttpTestingController;

  function setup(webhooks = { live: LIVE_URL, test: TEST_URL }): SeoJobsService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SEO_WEBHOOK_URLS, useValue: webhooks }],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(SeoJobsService);
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
    it('asks for kind=seo only, with the pagination params, and never sends jobType', () => {
      const service = setup();
      service.loadJobs({ page: 2, limit: 5 });

      const req = httpMock.expectOne((r) => r.url === API);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('kind')).toBe('seo');
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('limit')).toBe('5');
      expect(req.request.params.has('jobType')).toBe(false);
      expect(service.loading()).toBe(true);

      req.flush({ items: [makeSeoJob()], total: 11, page: 2, limit: 5 });

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
    it('posts exactly the six SEO fields - trimmed, with the prompt built as "<LANGUAGE> <id>" and one pending step', () => {
      const service = setup();
      service.createJob(makeFormValue({ language: ' EN ', llm: ' gpt_5_6_sol ', pageTask: '  R048 · Кено  ', promptId: ' prompt-1 ', toneOfVoiceRuleSetId: ' rule-tone ', humanizerRuleSetId: ' rule-tone ' }));

      const req = httpMock.expectOne(`${API}/seo`);
      expect(req.request.method).toBe('POST');
      // toEqual on the whole body: the backend rejects any extra field (kind, runDate, runnedById, communication fields...).
      expect(req.request.body).toEqual({
        steps: { step1: { status: 'pending' } },
        language: 'EN',
        llm: 'gpt_5_6_sol',
        prompt: 'EN prompt-1',
        pageTask: 'R048 · Кено',
        ruleIds: ['rule-tone'],
      });
      req.flush(makeSeoJob());
      httpMock.expectOne(LIVE_URL).flush({});
    });

    it('sends only the picked roles: ruleIds drops an empty one, the webhook sends it as an empty string', () => {
      const service = setup();
      service.createJob(makeFormValue({ toneOfVoiceRuleSetId: '', humanizerRuleSetId: 'rule-human' }));

      const req = httpMock.expectOne(`${API}/seo`);
      expect(req.request.body.ruleIds).toEqual(['rule-human']);
      req.flush(makeSeoJob());
      const webhook = httpMock.expectOne(LIVE_URL);
      expect(webhook.request.body).toMatchObject({ toneOfVoice: '', humanizer: 'rule-human' });
      webhook.flush({});
    });

    it('adds the created job to the list and then triggers the SEO webhook with the new job id', () => {
      const service = setup();
      const onBackendSuccess = vi.fn();
      service.createJob(makeFormValue(), { onBackendSuccess });

      httpMock.expectOne(`${API}/seo`).flush(makeSeoJob({ id: 'new-id' }));

      expect(service.jobs().map((job) => job.id)).toEqual(['new-id']);
      expect(onBackendSuccess).toHaveBeenCalledTimes(1);

      const webhook = httpMock.expectOne(LIVE_URL);
      expect(webhook.request.body).toEqual({
        jobId: 'new-id',
        language: 'EN',
        llm: 'gpt_5_6_sol',
        prompt: 'EN prompt-1',
        pageTask: 'R048 · Кено',
        toneOfVoice: 'rule-tone',
        humanizer: 'rule-human',
      });
      // The rules go to n8n by role, never as the backend's `ruleIds` array.
      expect(webhook.request.body).not.toHaveProperty('ruleIds');
      webhook.flush({});
    });

    it('uses the test webhook when the testing toggle is on', () => {
      const service = setup();
      service.createJob(makeFormValue({ isTesting: true }));

      httpMock.expectOne(`${API}/seo`).flush(makeSeoJob());
      httpMock.expectOne(TEST_URL).flush({});
    });

    it('does not call the webhook, and reports the backend error, when the backend rejects the job', () => {
      const service = setup();
      const onBackendError = vi.fn();
      service.createJob(makeFormValue(), { onBackendError });

      httpMock.expectOne(`${API}/seo`).flush({ statusCode: 400, message: ['language must be 2-5 latin letters'] }, { status: 400, statusText: 'Bad Request' });

      expect(onBackendError).toHaveBeenCalledTimes(1);
      expect(service.jobs()).toHaveLength(0);
      httpMock.expectNone(LIVE_URL);
    });

    it('keeps the created job and reports a failing webhook separately', () => {
      const service = setup();
      const onN8nError = vi.fn();
      service.createJob(makeFormValue(), { onN8nError });

      httpMock.expectOne(`${API}/seo`).flush(makeSeoJob());
      httpMock.expectOne(LIVE_URL).flush('boom', { status: 500, statusText: 'Server Error' });

      expect(onN8nError).toHaveBeenCalledTimes(1);
      expect(service.jobs()).toHaveLength(1);
    });

    it('says so, instead of silently doing nothing, when no webhook URL is configured', () => {
      const service = setup({ live: '', test: TEST_URL });
      const onN8nNotConfigured = vi.fn();
      service.createJob(makeFormValue(), { onN8nNotConfigured });

      httpMock.expectOne(`${API}/seo`).flush(makeSeoJob());

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

    it('applies job.updated events of SEO jobs to the loaded page', () => {
      const service = setup();
      service.jobs.set([makeSeoJob({ id: 'seo-1', status: 'pending' })]);
      service.connectJobUpdates();

      updatedHandler()(makeSeoJob({ id: 'seo-1', status: 'success', tableUrl: 'https://sheet' }));

      expect(service.jobs()[0].status).toBe('success');
      expect(service.jobs()[0].tableUrl).toBe('https://sheet');
    });

    it('ignores communication jobs (and events without a kind) and ids that are not on the page', () => {
      const service = setup();
      service.jobs.set([makeSeoJob({ id: 'seo-1', status: 'pending' })]);
      service.connectJobUpdates();

      updatedHandler()({ id: 'seo-1', kind: 'communication', status: 'success' } as unknown as JobRun);
      updatedHandler()({ id: 'seo-1', status: 'success' } as unknown as JobRun);
      updatedHandler()(makeSeoJob({ id: 'other', status: 'success' }));

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
