import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { environment } from '@env';
import {
  CreateJobBackendPayload,
  CreateJobFormValue,
  CreateJobN8nLocalizationPayload,
  CreateJobN8nPayload,
  JobRun,
  PaginatedJobRuns,
} from '../models/job.model';
import { AuthService } from './auth.service';

const JOBS_URL = `${environment.apiBaseUrl}/jobs`;

/** Default page size for `loadJobRuns()` - matches what the backend defaults to when `limit` is omitted, kept explicit here so JobListComponent's page-count math always has a real number to divide by. */
const DEFAULT_JOB_RUNS_LIMIT = 20;

/**
 * Query params for `loadJobRuns()`. `jobTypes` supports the type filter's
 * multi-select chips (sent as a single comma-separated `jobType` param -
 * see the backend's pagination contract); `runnedById` is the single-select
 * "run by" filter. Both are optional - an empty/omitted filter means "all".
 */
export interface JobRunsQuery {
  page?: number;
  limit?: number;
  jobTypes?: string[];
  runnedById?: string | null;
}

// See .env.example / scripts/generate-env.js - these are the n8n
// webhooks that actually run a job, sourced from N8N_WEBHOOK_URL /
// TEST_N8N_WEBHOOK_URL so the real values never live in source control.
// Which one a given job posts to is picked per-request in createJob(),
// based on that job's `isTesting` flag (see AddJobComponent's toggle).
const N8N_WEBHOOK_URL = environment.n8nWebhookUrl;
const TEST_N8N_WEBHOOK_URL = environment.testN8nWebhookUrl;

export interface CreateJobCallbacks {
  /** Called once the job run has been created on our backend and added to `jobRuns`. */
  onBackendSuccess?: (created: JobRun) => void;
  onBackendError?: () => void;
  /** Called if the separate, best-effort n8n trigger request fails. */
  onN8nError?: () => void;
}

/**
 * In-memory job store.
 */
@Injectable({ providedIn: 'root' })
export class JobsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;

  /**
   * The currently loaded *page* of job runs, as shown on the jobs page -
   * unlike RuleSetsService/PromptsService, this is never "all of them":
   * job runs grow without bound, so the backend paginates GET /jobs and
   * this only ever holds one page at a time (see `jobRunsTotal`/
   * `jobRunsPage`/`jobRunsLimit` for what JobListComponent needs to
   * render a pager around it).
   */
  readonly jobRuns = signal<JobRun[]>([]);
  readonly jobRunsLoading = signal<boolean>(false);
  readonly jobRunsTotal = signal<number>(0);
  readonly jobRunsPage = signal<number>(1);
  readonly jobRunsLimit = signal<number>(DEFAULT_JOB_RUNS_LIMIT);

  /**
   * Fetches one page of job runs. Re-call this (e.g. from
   * JobListComponent's filter/page handlers) with the new `page`/
   * `jobTypes`/`runnedById` whenever the user changes a filter or
   * navigates a page - each call replaces `jobRuns` with that page's
   * results, it doesn't accumulate across calls.
   */
  loadJobRuns(query: JobRunsQuery = {}): void {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_JOB_RUNS_LIMIT;

    let params = new HttpParams().set('page', page).set('limit', limit);
    if (query.jobTypes && query.jobTypes.length > 0) {
      params = params.set('jobType', query.jobTypes.join(','));
    }
    if (query.runnedById) {
      params = params.set('runnedById', query.runnedById);
    }

    this.jobRunsLoading.set(true);
    this.http.get<PaginatedJobRuns>(JOBS_URL, { params }).subscribe({
      next: (result) => {
        this.jobRuns.set(result.items);
        this.jobRunsTotal.set(result.total);
        this.jobRunsPage.set(result.page);
        this.jobRunsLimit.set(result.limit);
        this.jobRunsLoading.set(false);
      },
      error: () => this.jobRunsLoading.set(false),
    });
  }

  /**
   * Builds the body our own backend expects to create a job run record:
   * a single "pending" step to start with, the three chosen rule sets
   * (main / tone of voice / humanizer) flattened into one `ruleIds`
   * array (dropping any role that wasn't picked), and the selected
   * prompt's id as `sm` - the backend validates this as a UUID, so an
   * unpicked prompt is sent as `''` rather than omitted, and will be
   * rejected the same way a missing one would be (the form requires it).
   */
  buildBackendPayload(value: CreateJobFormValue): CreateJobBackendPayload {
    return {
      steps: { step1: { status: 'pending' } },
      jobType: value.jobType,
      taskStatus: value.taskStatus,
      messageType: value.messageType,
      board: value.board,
      taskDescription: value.taskDescription,
      ruleIds: [value.mainRuleSetId, value.toneOfVoiceRuleSetId, value.humanizerRuleSetId].filter(
        (id): id is string => !!id,
      ),
      sm: value.promptId ?? '',
      llm: value.llm ?? '',
    };
  }

  /**
   * Builds the body the n8n webhook expects to actually run the job -
   * a localization job posts an entirely different shape (see
   * CreateJobN8nLocalizationPayload) than a "new"/"update" job (see
   * CreateJobN8nPayload): no `jobType`/`ruleIds`/`taskStatus`/
   * `messageType`/`board` in either case, but the rule set/glossary
   * roles as their own named fields instead (empty string when a role
   * wasn't picked). `jobId` is the id our backend assigned the job run
   * when it was created - the caller only has this after that POST
   * resolves, which is why this can't be built at the same time as the
   * backend payload.
   */
  buildN8nPayload(
    value: CreateJobFormValue,
    jobId: string,
  ): CreateJobN8nPayload | CreateJobN8nLocalizationPayload {
    if (value.taskStatus === 'localization') {
      return {
        taskStatus: value.taskStatus,
        messageType: value.messageType,
        board: value.board,
        taskDescription: value.taskDescription,
        mainRuleSet: value.mainRuleSetId ?? '',
        toneOfVoice: value.toneOfVoiceRuleSetId ?? '',
        humanizer: value.humanizerRuleSetId ?? '',
        glossaries: value.glossaryId ?? '',
        sm: value.promptId ?? '',
        llm: value.llm ?? '',
        jobId,
      };
    }

    return {
      taskStatus: value.taskStatus,
      messageType: value.messageType,
      board: value.board,
      taskDescription: value.taskDescription,
      mainRuleSet: value.mainRuleSetId ?? '',
      toneOfVoice: value.toneOfVoiceRuleSetId ?? '',
      humanizer: value.humanizerRuleSetId ?? '',
      sm: value.promptId ?? '',
      llm: value.llm ?? '',
      jobId,
    };
  }

  /**
   * Creates a job: POSTs the DB-shaped payload to our backend first (so
   * it's tracked and shows up in `jobRuns`), then - only once that
   * succeeds and we have the new job's id - POSTs the n8n-shaped payload
   * (which carries that id as `jobId`) to the webhook that actually runs
   * it. The n8n request is best-effort: a failure there is reported via
   * `onN8nError` but doesn't undo the job record already created.
   */
  createJob(value: CreateJobFormValue, callbacks?: CreateJobCallbacks): void {
    const backendPayload = this.buildBackendPayload(value);

    this.http.post<JobRun>(JOBS_URL, backendPayload).subscribe({
      next: (created) => {
        // AddJobComponent navigates to /jobs right after this resolves, which
        // remounts JobListComponent and reloads page 1 from scratch - this
        // unshift just makes the freshly-created run visible immediately to
        // any caller that doesn't navigate away (and to tests), even though
        // it can transiently make `jobRuns` one longer than `jobRunsLimit`.
        this.jobRuns.update((runs) => [created, ...runs]);
        callbacks?.onBackendSuccess?.(created);

        const n8nPayload = this.buildN8nPayload(value, created.id);
        const n8nUrl = value.isTesting ? TEST_N8N_WEBHOOK_URL : N8N_WEBHOOK_URL;
        this.http.post(n8nUrl, n8nPayload).subscribe({
          error: () => callbacks?.onN8nError?.(),
        });
      },
      error: () => callbacks?.onBackendError?.(),
    });
  }

  /**
   * Opens a websocket connection to the jobs namespace, authenticated with
   * the current session's token, and applies `job.updated` events to
   * `jobRuns` live as they arrive - keeps the jobs page in sync without
   * polling. Safe to call more than once; only the first call (per
   * `disconnectJobUpdates()` cycle) opens a connection. Pair with
   * `disconnectJobUpdates()` (e.g. the jobs page's `ngOnDestroy`) so the
   * socket doesn't outlive the view that needs it.
   */
  connectJobUpdates(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(JOBS_URL, {
      auth: { token: this.authService.getToken() },
    });

    this.socket.on('job.updated', (job: JobRun) => {
      this.applyJobUpdate(job);
    });
  }

  disconnectJobUpdates(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /**
   * Only updates a job run already showing on the current page, in
   * place - unlike before pagination existed, an update for an id we
   * don't have is dropped rather than prepended, since we can no longer
   * tell whether that job actually belongs on this page (it may belong
   * on a different page, or be excluded by the active filters).
   */
  private applyJobUpdate(job: JobRun): void {
    this.jobRuns.update((runs) => {
      const index = runs.findIndex((run) => run.id === job.id);
      if (index === -1) {
        return runs;
      }
      const next = runs.slice();
      next[index] = job;
      return next;
    });
  }
}
