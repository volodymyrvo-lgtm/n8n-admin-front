import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '@env';
import { SKIP_ERROR_TOAST } from '../interceptors/error-toast.interceptor';
import { AnyJobRun, JobError, JobLookup, PaginatedJobErrors } from '../models/job-error.model';

const JOB_ERRORS_URL = `${environment.apiBaseUrl}/job-errors`;
const JOBS_URL = `${environment.apiBaseUrl}/jobs`;

export const DEFAULT_JOB_ERRORS_LIMIT = 10;

/**
 * The error logs (`GET /job-errors`) - failures n8n reported for jobs -
 * and, for each log, the details of the job it belongs to
 * (`GET /jobs/:id`, one request per distinct job on the current page).
 */
@Injectable({ providedIn: 'root' })
export class JobErrorsService {
  private readonly http = inject(HttpClient);

  readonly errors = signal<JobError[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = signal(DEFAULT_JOB_ERRORS_LIMIT);
  readonly loading = signal(false);
  /** True when the last page request failed - lets the page offer a retry. */
  readonly failed = signal(false);

  /** Job details by job id. Kept across pages, so paging back doesn't refetch. */
  readonly jobs = signal<Record<string, JobLookup>>({});

  /** One page of logs (newest first, as the backend returns them); then fetches the jobs they belong to. */
  loadErrors(query: { page?: number; limit?: number } = {}): void {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_JOB_ERRORS_LIMIT;

    this.loading.set(true);
    this.failed.set(false);
    this.http
      .get<PaginatedJobErrors>(JOB_ERRORS_URL, { params: new HttpParams().set('page', page).set('limit', limit) })
      .subscribe({
        next: (result) => {
          this.errors.set(result.items);
          this.total.set(result.total);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.loading.set(false);
          for (const jobId of new Set(result.items.map((item) => item.jobId))) {
            this.loadJob(jobId);
          }
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  /** Fetches a job's details unless they're already loaded, gone (404) or on their way; a failed fetch is retried on the next call. */
  loadJob(jobId: string): void {
    const current = this.jobs()[jobId];
    if (current && current.state !== 'error') {
      return;
    }

    this.setLookup(jobId, { state: 'loading' });
    // A job that was deleted (404) or can't be read is shown on its log's card - no toast per card.
    this.http
      .get<AnyJobRun>(`${JOBS_URL}/${jobId}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) })
      .subscribe({
        next: (job) => this.setLookup(jobId, { state: 'ready', job }),
        error: (error: HttpErrorResponse) => this.setLookup(jobId, error.status === 404 ? { state: 'missing' } : { state: 'error' }),
      });
  }

  private setLookup(jobId: string, lookup: JobLookup): void {
    this.jobs.update((jobs) => ({ ...jobs, [jobId]: lookup }));
  }
}
