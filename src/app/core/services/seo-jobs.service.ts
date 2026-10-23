import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { environment } from '@env';
import {
  DesignJobRun,
  buildSeoPrompt,
  CreateSeoJobBackendPayload,
  CreateSeoJobFormValue,
  CreateSeoJobN8nPayload,
  JobRun,
  PaginatedSeoJobRuns,
  SeoJobRun,
} from '../models/job.model';
import { AuthService } from './auth.service';

const JOBS_URL = `${environment.apiBaseUrl}/jobs`;
const SEO_JOBS_URL = `${JOBS_URL}/seo`;

/** Page size the SEO list asks the backend for. */
const DEFAULT_SEO_JOBS_LIMIT = 10;

/** The n8n webhooks that start an SEO job (see .env.example); `test` is used when the form's testing toggle is on. */
export interface SeoWebhookUrls {
  live: string;
  test: string;
}

/** Where the SEO webhooks come from - the generated environment by default, swappable in tests. */
export const SEO_WEBHOOK_URLS = new InjectionToken<SeoWebhookUrls>('SEO_WEBHOOK_URLS', {
  providedIn: 'root',
  factory: () => ({ live: environment.seoN8nWebhookUrl, test: environment.testSeoN8nWebhookUrl }),
});

export interface SeoJobsQuery {
  page?: number;
  limit?: number;
}

export interface CreateSeoJobCallbacks {
  /** The job record was created on our backend and added to `jobs`. */
  onBackendSuccess?: (created: SeoJobRun) => void;
  /** `POST /jobs/seo` failed (a validation 400 etc. - the error toast shows the server's message). */
  onBackendError?: () => void;
  /** The record exists, but the separate n8n trigger request failed. */
  onN8nError?: () => void;
  /** The record exists, but no SEO webhook URL is configured (SEO_N8N_WEBHOOK_URL / TEST_SEO_N8N_WEBHOOK_URL), so nothing was triggered. */
  onN8nNotConfigured?: () => void;
}

/**
 * SEO jobs (generation of SEO pages): the same `/jobs` resource as the
 * communication ones, told apart by `kind` - this service only ever asks
 * for and shows `kind=seo`, and ignores websocket updates of any other
 * kind (JobsService does the opposite).
 *
 * Creating one is two steps, like a communication job: `POST /jobs/seo`
 * on our backend first (so it's tracked and listed), then - once the
 * backend has assigned the id - a best-effort POST to the SEO n8n
 * webhook that actually runs it.
 */
@Injectable({ providedIn: 'root' })
export class SeoJobsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly webhooks = inject(SEO_WEBHOOK_URLS);
  private socket: Socket | null = null;

  /** The loaded page of SEO jobs, newest first as the backend returns them. */
  readonly jobs = signal<SeoJobRun[]>([]);
  readonly loading = signal<boolean>(false);
  readonly total = signal<number>(0);
  readonly page = signal<number>(1);
  readonly limit = signal<number>(DEFAULT_SEO_JOBS_LIMIT);

  loadJobs(query: SeoJobsQuery = {}): void {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_SEO_JOBS_LIMIT;
    // `kind=seo` always; `jobType` is deliberately never sent - it filters communication jobs only and would empty the list.
    const params = new HttpParams().set('kind', 'seo').set('page', page).set('limit', limit);

    this.loading.set(true);
    this.http.get<PaginatedSeoJobRuns>(JOBS_URL, { params }).subscribe({
      next: (result) => {
        this.jobs.set(result.items);
        this.total.set(result.total);
        this.page.set(result.page);
        this.limit.set(result.limit);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * The body of `POST /jobs/seo`: one pending step to start with, the
   * four form fields (trimmed, as the backend would do anyway), the
   * `prompt` string built from the language and the chosen prompt's id,
   * and the picked SEO rules (tone of voice / humanizer) flattened into
   * one `ruleIds` array - dropping a role that wasn't picked, and
   * de-duplicated (the backend wants unique ids).
   * Nothing else - the backend rejects `kind`, `runDate`, `runnedById`
   * and any communication field.
   */
  buildBackendPayload(value: CreateSeoJobFormValue): CreateSeoJobBackendPayload {
    const language = value.language.trim();
    return {
      steps: { step1: { status: 'pending' } },
      language,
      llm: value.llm.trim(),
      prompt: buildSeoPrompt(language, value.promptId.trim()),
      pageTask: value.pageTask.trim(),
      ruleIds: [...new Set([value.toneOfVoiceRuleSetId, value.humanizerRuleSetId].map((id) => id.trim()).filter((id) => !!id))],
    };
  }

  /**
   * The body for the SEO webhook, built separately from the backend one: the
   * same four values (trimmed) plus the id the backend gave the job, and the
   * rule sets by role (`toneOfVoice` / `humanizer`, `''` when not picked) as on
   * the communication webhook.
   */
  buildN8nPayload(value: CreateSeoJobFormValue, jobId: string): CreateSeoJobN8nPayload {
    const backendPayload = this.buildBackendPayload(value);
    return {
      jobId,
      language: backendPayload.language,
      llm: backendPayload.llm,
      prompt: backendPayload.prompt,
      pageTask: backendPayload.pageTask,
      toneOfVoice: value.toneOfVoiceRuleSetId.trim(),
      humanizer: value.humanizerRuleSetId.trim(),
    };
  }

  createJob(value: CreateSeoJobFormValue, callbacks?: CreateSeoJobCallbacks): void {
    const backendPayload = this.buildBackendPayload(value);

    this.http.post<SeoJobRun>(SEO_JOBS_URL, backendPayload).subscribe({
      next: (created) => {
        // Visible right away for a caller that stays on the list (the form navigates away and the list reloads page 1 anyway).
        this.jobs.update((jobs) => [created, ...jobs]);
        callbacks?.onBackendSuccess?.(created);

        const url = value.isTesting ? this.webhooks.test : this.webhooks.live;
        if (!url) {
          callbacks?.onN8nNotConfigured?.();
          return;
        }
        this.http.post(url, this.buildN8nPayload(value, created.id)).subscribe({
          error: () => callbacks?.onN8nError?.(),
        });
      },
      error: () => callbacks?.onBackendError?.(),
    });
  }

  /**
   * Opens the jobs websocket and applies `job.updated` events to `jobs`
   * live. The event is sent for every job of every kind, so anything that
   * isn't `kind === 'seo'` is ignored. Pair with `disconnectJobUpdates()`
   * when the page goes away.
   */
  connectJobUpdates(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(JOBS_URL, {
      auth: { token: this.authService.getToken() },
    });

    this.socket.on('job.updated', (job: JobRun | SeoJobRun | DesignJobRun) => {
      if (job.kind !== 'seo') {
        return;
      }
      this.applyJobUpdate(job);
    });
  }

  disconnectJobUpdates(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Updates a job already on the current page in place; one that isn't shown is dropped (it may belong to another page). */
  private applyJobUpdate(job: SeoJobRun): void {
    this.jobs.update((jobs) => {
      const index = jobs.findIndex((item) => item.id === job.id);
      if (index === -1) {
        return jobs;
      }
      const next = jobs.slice();
      next[index] = job;
      return next;
    });
  }
}
