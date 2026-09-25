import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { environment } from '@env';
import {
  CreateJobBackendPayload,
  CreateJobFormValue,
  CreateJobN8nLocalizationPayload,
  CreateJobN8nPayload,
  JobRun,
} from '../models/job.model';
import { AuthService } from './auth.service';

const JOBS_URL = `${environment.apiBaseUrl}/jobs`;

// See .env.example / scripts/generate-env.js - this is the n8n webhook
// that actually runs a job, sourced from N8N_WEBHOOK_URL so the real
// value never lives in source control.
const N8N_WEBHOOK_URL = environment.n8nWebhookUrl;

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

  /** Job run history, as shown on the jobs page. */
  readonly jobRuns = signal<JobRun[]>([]);
  readonly jobRunsLoading = signal<boolean>(false);

  loadJobRuns(): void {
    this.jobRunsLoading.set(true);
    this.http
      .get<JobRun[]>(JOBS_URL)
      .subscribe({
        next: (result) => {
          this.jobRuns.set(result);
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
        this.jobRuns.update((runs) => [created, ...runs]);
        callbacks?.onBackendSuccess?.(created);

        const n8nPayload = this.buildN8nPayload(value, created.id);
        this.http.post(N8N_WEBHOOK_URL, n8nPayload).subscribe({
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

  private applyJobUpdate(job: JobRun): void {
    this.jobRuns.update((runs) => {
      const index = runs.findIndex((run) => run.id === job.id);
      if (index === -1) {
        return [job, ...runs];
      }
      const next = runs.slice();
      next[index] = job;
      return next;
    });
  }
}
