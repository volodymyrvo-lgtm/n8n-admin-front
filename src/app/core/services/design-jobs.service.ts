import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { environment } from '@env';
import {
  DesignJobRun,
  CreateDesignJobFormValue,
  CreateDesignJobN8nPayload,
  CreateDesignJobPayload,
  JobRun,
  PaginatedDesignJobRuns,
  SeoJobRun,
} from '../models/job.model';
import { AuthService } from './auth.service';

const JOBS_URL = `${environment.apiBaseUrl}/jobs`;
const DESIGN_JOBS_URL = `${JOBS_URL}/design`;

/** Page size the design list asks the backend for. */
const DEFAULT_DESIGN_JOBS_LIMIT = 10;

/** The n8n webhooks that start a design job (see .env.example); `test` is used when the form's testing toggle is on. */
export interface DesignWebhookUrls {
  live: string;
  test: string;
}

/** Where the design webhooks come from - the generated environment by default, swappable in tests. */
export const DESIGN_WEBHOOK_URLS = new InjectionToken<DesignWebhookUrls>('DESIGN_WEBHOOK_URLS', {
  providedIn: 'root',
  factory: () => ({ live: environment.designN8nWebhookUrl, test: environment.testDesignN8nWebhookUrl }),
});

export interface DesignJobsQuery {
  page?: number;
  limit?: number;
}

export interface CreateDesignJobCallbacks {
  /** The job record was created on our backend and added to `jobs`. */
  onBackendSuccess?: (created: DesignJobRun) => void;
  /** `POST /jobs/design` failed (a validation 400 etc. - the error toast shows the server's message). */
  onBackendError?: () => void;
  /** The record exists, but the separate n8n trigger request failed. */
  onN8nError?: () => void;
  /** The record exists, but no webhook URL is configured (BANNERS_N8N_WEBHOOK_URL / BANNERS_TEST_N8N_WEBHOOK_URL), so nothing was triggered. */
  onN8nNotConfigured?: () => void;
}

/**
 * Design jobs: the same `/jobs` resource as the communication and
 * SEO ones, told apart by `kind` - this service only ever asks for and shows
 * `kind=design`, and ignores websocket updates of any other kind.
 *
 * A design job is just a task description, and the body is the same for both
 * sides: `POST /jobs/design` on our backend first (so the job is tracked and
 * listed), then - once the backend has assigned the id - a best-effort POST of
 * that same body (plus the `jobId`) to the n8n webhook that actually runs it.
 */
@Injectable({ providedIn: 'root' })
export class DesignJobsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly webhooks = inject(DESIGN_WEBHOOK_URLS);
  private socket: Socket | null = null;

  /** The loaded page of design jobs, newest first as the backend returns them. */
  readonly jobs = signal<DesignJobRun[]>([]);
  readonly loading = signal<boolean>(false);
  readonly total = signal<number>(0);
  readonly page = signal<number>(1);
  readonly limit = signal<number>(DEFAULT_DESIGN_JOBS_LIMIT);

  loadJobs(query: DesignJobsQuery = {}): void {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_DESIGN_JOBS_LIMIT;
    const params = new HttpParams().set('kind', 'design').set('page', page).set('limit', limit);

    this.loading.set(true);
    this.http.get<PaginatedDesignJobRuns>(JOBS_URL, { params }).subscribe({
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

  /** The body sent to both our backend and n8n: the trimmed task description, nothing else. */
  buildPayload(value: CreateDesignJobFormValue): CreateDesignJobPayload {
    return { taskDescription: value.taskDescription.trim() };
  }

  /** The webhook's body: the same one, plus the id the backend gave the job. */
  buildN8nPayload(value: CreateDesignJobFormValue, jobId: string): CreateDesignJobN8nPayload {
    return { ...this.buildPayload(value), jobId };
  }

  createJob(value: CreateDesignJobFormValue, callbacks?: CreateDesignJobCallbacks): void {
    this.http.post<DesignJobRun>(DESIGN_JOBS_URL, this.buildPayload(value)).subscribe({
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
   * isn't `kind === 'design'` is ignored. Pair with `disconnectJobUpdates()`
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
      if (job.kind !== 'design') {
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
  private applyJobUpdate(job: DesignJobRun): void {
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
