import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { CreateJobFormValue, JobRun } from '../models/job.model';
import { JobsService } from './jobs.service';

const N8N_URL = 'https://royaleteam.app.n8n.cloud/webhook-test/6b74d4ba-f397-4534-83ef-7bffe54d1a6f';

const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = { on: vi.fn(), disconnect: vi.fn() };
  return { mockSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function makeRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: '1',
    steps: { step1: { status: 'success' } },
    jobType: 'email',
    taskStatus: 'new',
    messageType: 'email',
    board: 'ONBOARDING',
    taskDescription: 'id 2',
    status: 'success',
    runDate: null,
    createdAt: '2026-09-10T17:05:31.419Z',
    updatedAt: '2026-09-10T17:06:19.640Z',
    runnedById: 'user-1',
    ruleIds: [],
    ...overrides,
  };
}

function makeFormValue(overrides: Partial<CreateJobFormValue> = {}): CreateJobFormValue {
  return {
    jobType: 'sms',
    taskStatus: 'new',
    messageType: 'email',
    board: 'ONBOARDING',
    taskDescription: 'id 2',
    mainRuleSetId: 'rule-1',
    toneOfVoiceRuleSetId: 'rule-2',
    humanizerRuleSetId: 'rule-3',
    promptId: 'prompt-1',
    glossaryId: null,
    llm: 'claude_sonnet_5',
    ...overrides,
  };
}

/** Grabs the handler registered for `job.updated` via `socket.on(...)`. */
function updatedHandler(): (job: JobRun) => void {
  const call = mockSocket.on.mock.calls.find(([event]) => event === 'job.updated');
  if (!call) {
    throw new Error('job.updated handler was never registered');
  }
  return call[1] as (job: JobRun) => void;
}

describe('JobsService', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    ioMock.mockClear();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('fetches job runs from the backend', () => {
    const service = TestBed.inject(JobsService);
    service.loadJobRuns();

    httpMock.expectOne('http://localhost:3000/jobs').flush([makeRun()]);

    expect(service.jobRuns().length).toBe(1);
  });

  it('opens a socket to the jobs namespace with the current auth token', () => {
    localStorage.setItem('auth_token', 'abc123');
    const service = TestBed.inject(JobsService);

    service.connectJobUpdates();

    expect(ioMock).toHaveBeenCalledWith('http://localhost:3000/jobs', { auth: { token: 'abc123' } });
    expect(mockSocket.on).toHaveBeenCalledWith('job.updated', expect.any(Function));
  });

  it('does not open a second connection while already connected', () => {
    const service = TestBed.inject(JobsService);

    service.connectJobUpdates();
    service.connectJobUpdates();

    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('updates the matching job run when a job.updated event arrives', () => {
    const service = TestBed.inject(JobsService);
    service.jobRuns.set([makeRun({ id: '1', status: 'pending' })]);
    service.connectJobUpdates();

    updatedHandler()(makeRun({ id: '1', status: 'success' }));

    expect(service.jobRuns().length).toBe(1);
    expect(service.jobRuns()[0].status).toBe('success');
  });

  it('prepends a new job run when job.updated references an id not yet in the list', () => {
    const service = TestBed.inject(JobsService);
    service.jobRuns.set([makeRun({ id: '1' })]);
    service.connectJobUpdates();

    updatedHandler()(makeRun({ id: '2' }));

    expect(service.jobRuns().length).toBe(2);
    expect(service.jobRuns()[0].id).toBe('2');
  });

  it('disconnects the socket and allows reconnecting afterwards', () => {
    const service = TestBed.inject(JobsService);
    service.connectJobUpdates();

    service.disconnectJobUpdates();
    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);

    service.connectJobUpdates();
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  describe('job creation', () => {
    it('builds the backend payload with a pending first step and the three rule roles flattened into ruleIds', () => {
      const service = TestBed.inject(JobsService);

      const payload = service.buildBackendPayload(makeFormValue());

      expect(payload).toEqual({
        steps: { step1: { status: 'pending' } },
        jobType: 'sms',
        taskStatus: 'new',
        messageType: 'email',
        board: 'ONBOARDING',
        taskDescription: 'id 2',
        ruleIds: ['rule-1', 'rule-2', 'rule-3'],
        sm: 'prompt-1',
        llm: 'claude_sonnet_5',
      });
    });

    it('drops rule roles that were not picked from the backend payload', () => {
      const service = TestBed.inject(JobsService);

      const payload = service.buildBackendPayload(
        makeFormValue({ toneOfVoiceRuleSetId: null, humanizerRuleSetId: null }),
      );

      expect(payload.ruleIds).toEqual(['rule-1']);
    });

    it('builds the n8n payload with the rule roles as named fields instead of ruleIds, and no jobType', () => {
      const service = TestBed.inject(JobsService);

      const payload = service.buildN8nPayload(makeFormValue(), 'job-1');

      expect(payload).toEqual({
        taskStatus: 'new',
        messageType: 'email',
        board: 'ONBOARDING',
        taskDescription: 'id 2',
        mainRuleSet: 'rule-1',
        toneOfVoice: 'rule-2',
        humanizer: 'rule-3',
        sm: 'prompt-1',
        llm: 'claude_sonnet_5',
        jobId: 'job-1',
      });
      expect(payload).not.toHaveProperty('jobType');
    });

    it('defaults unpicked rule roles to an empty string in the n8n payload', () => {
      const service = TestBed.inject(JobsService);

      const payload = service.buildN8nPayload(
        makeFormValue({ toneOfVoiceRuleSetId: null, humanizerRuleSetId: null }),
        'job-1',
      );

      expect(payload.toneOfVoice).toBe('');
      expect(payload.humanizer).toBe('');
    });

    it('sends the selected prompt id as `sm`, defaulting to an empty string when none is picked', () => {
      const service = TestBed.inject(JobsService);

      expect(service.buildN8nPayload(makeFormValue({ promptId: 'prompt-2' }), 'job-1').sm).toBe('prompt-2');
      expect(service.buildN8nPayload(makeFormValue({ promptId: null }), 'job-1').sm).toBe('');
    });

    it('sends the selected model as `llm`, defaulting to an empty string when none is picked', () => {
      const service = TestBed.inject(JobsService);

      expect(service.buildN8nPayload(makeFormValue({ llm: 'gpt_6_astra' }), 'job-1').llm).toBe('gpt_6_astra');
      expect(service.buildN8nPayload(makeFormValue({ llm: null }), 'job-1').llm).toBe('');
      expect(service.buildBackendPayload(makeFormValue({ llm: 'gpt_6_sol' })).llm).toBe('gpt_6_sol');
      expect(service.buildBackendPayload(makeFormValue({ llm: null })).llm).toBe('');
    });

    it('builds a differently-shaped n8n payload for a localization job, with glossaries alongside an empty mainRuleSet', () => {
      const service = TestBed.inject(JobsService);

      const payload = service.buildN8nPayload(
        makeFormValue({ taskStatus: 'localization', mainRuleSetId: null, glossaryId: 'glossary-1' }),
        'job-1',
      );

      expect(payload).toEqual({
        taskStatus: 'localization',
        messageType: 'email',
        board: 'ONBOARDING',
        taskDescription: 'id 2',
        mainRuleSet: '',
        toneOfVoice: 'rule-2',
        humanizer: 'rule-3',
        glossaries: 'glossary-1',
        sm: 'prompt-1',
        llm: 'claude_sonnet_5',
        jobId: 'job-1',
      });
    });

    it('defaults an unpicked glossary to an empty string in the localization n8n payload', () => {
      const service = TestBed.inject(JobsService);

      const payload = service.buildN8nPayload(
        makeFormValue({ taskStatus: 'localization', mainRuleSetId: null, glossaryId: null }),
        'job-1',
      );

      expect(payload).toMatchObject({ glossaries: '' });
    });

    it('posts both bodies, adds the created run to jobRuns, and reports backend success', () => {
      const service = TestBed.inject(JobsService);
      const onBackendSuccess = vi.fn();
      const onN8nError = vi.fn();

      service.createJob(makeFormValue(), { onBackendSuccess, onN8nError });

      const backendReq = httpMock.expectOne('http://localhost:3000/jobs');
      expect(backendReq.request.method).toBe('POST');
      expect(backendReq.request.body.ruleIds).toEqual(['rule-1', 'rule-2', 'rule-3']);
      const created = makeRun({ id: 'new-1', status: 'pending' });
      backendReq.flush(created);

      const n8nReq = httpMock.expectOne(N8N_URL);
      expect(n8nReq.request.method).toBe('POST');
      expect(n8nReq.request.body.mainRuleSet).toBe('rule-1');
      expect(n8nReq.request.body.jobId).toBe('new-1');
      n8nReq.flush({});

      expect(service.jobRuns()[0]).toEqual(created);
      expect(onBackendSuccess).toHaveBeenCalledWith(created);
      expect(onN8nError).not.toHaveBeenCalled();
    });

    it('reports an n8n failure independently, without discarding the already-created job run', () => {
      const service = TestBed.inject(JobsService);
      const onBackendSuccess = vi.fn();
      const onN8nError = vi.fn();

      service.createJob(makeFormValue(), { onBackendSuccess, onN8nError });

      httpMock.expectOne('http://localhost:3000/jobs').flush(makeRun({ id: 'new-1' }));
      httpMock.expectOne(N8N_URL).flush('n8n down', { status: 500, statusText: 'Error' });

      expect(onBackendSuccess).toHaveBeenCalled();
      expect(onN8nError).toHaveBeenCalled();
      expect(service.jobRuns().length).toBe(1);
    });

    it('reports a backend failure via onBackendError, without ever calling n8n', () => {
      const service = TestBed.inject(JobsService);
      const onBackendError = vi.fn();

      service.createJob(makeFormValue(), { onBackendError });

      httpMock.expectOne('http://localhost:3000/jobs').flush('db down', { status: 500, statusText: 'Error' });

      expect(onBackendError).toHaveBeenCalled();
      expect(service.jobRuns().length).toBe(0);
    });
  });
});
