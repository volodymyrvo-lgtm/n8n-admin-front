import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AnyJobRun, JobError, JobLookup, parseJobError, ParsedJobError } from '../../core/models/job-error.model';
import { AuthService } from '../../core/services/auth.service';
import { DEFAULT_JOB_ERRORS_LIMIT, JobErrorsService } from '../../core/services/job-errors.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher';
import { PaginatorComponent } from '../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

/** One labelled value in a card's "job" section (`labelKey` is an i18n key). */
interface JobField {
  labelKey: string;
  value: string;
}

/**
 * The error logs page (`/job-errors`): the failures n8n reported for jobs
 * (`GET /job-errors`), newest first, as expandable cards. A card's header
 * is the failing workflow and node; its body shows the error parsed into
 * its parts and the details of the job it belongs to (`GET /jobs/:id`) -
 * Content and SEO jobs alike. A standalone page (own top bar), like the
 * dashboard.
 */
@Component({
  selector: 'app-job-errors',
  imports: [TranslatePipe, DatePipe, RouterLink, EmptyStateComponent, SpinnerComponent, PaginatorComponent, LanguageSwitcherComponent],
  templateUrl: './job-errors.html',
  styleUrls: ['./job-errors.css', '../jobs/job-list/job-list.css'],
})
export class JobErrorsComponent implements OnInit {
  protected readonly errorsService = inject(JobErrorsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.errorsService.total() / (this.errorsService.limit() || DEFAULT_JOB_ERRORS_LIMIT))),
  );

  /** Each log with its error already parsed - once per load, not on every change detection. */
  protected readonly entries = computed(() =>
    this.errorsService.errors().map((log) => ({ log, parsed: parseJobError(log.error) })),
  );

  ngOnInit(): void {
    this.errorsService.loadErrors({ page: 1 });
  }

  protected goToPage(page: number): void {
    this.errorsService.loadErrors({ page });
  }

  protected reload(): void {
    this.errorsService.loadErrors({ page: this.errorsService.page() });
  }

  protected isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  protected toggleExpanded(id: string): void {
    this.expandedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected lookup(jobId: string): JobLookup | undefined {
    return this.errorsService.jobs()[jobId];
  }

  protected retryJob(jobId: string): void {
    this.errorsService.loadJob(jobId);
  }

  /** The job's details once they've loaded, else null. */
  protected readyJob(jobId: string): AnyJobRun | null {
    const lookup = this.lookup(jobId);
    return lookup?.state === 'ready' ? lookup.job : null;
  }

  /** The card's second line: the failed node and the message (or the first extra values, for an error with no message). */
  protected subtitle(parsed: ParsedJobError): string {
    const detail =
      parsed.message ??
      parsed.extra
        .slice(0, 3)
        .map((field) => `${field.key}: ${field.value}`)
        .join(', ');
    return [parsed.failedNode, detail].filter((part) => !!part).join(' · ');
  }

  /** The job's own fields for the card, by family. */
  protected jobFields(job: AnyJobRun): JobField[] {
    const fields: { labelKey: string; value: string | null }[] =
      job.kind === 'seo'
        ? [
            { labelKey: 'jobErrors.language', value: job.language },
            { labelKey: 'jobErrors.pageTask', value: job.pageTask },
            { labelKey: 'jobErrors.llm', value: job.llm },
            { labelKey: 'jobErrors.prompt', value: job.prompt },
          ]
        : [
            { labelKey: 'jobErrors.jobType', value: job.jobType },
            { labelKey: 'jobErrors.taskStatus', value: job.taskStatus },
            { labelKey: 'jobErrors.messageType', value: job.messageType },
            { labelKey: 'jobErrors.board', value: job.board },
            { labelKey: 'jobErrors.llm', value: job.llm },
          ];
    return fields.flatMap((field) => (field.value ? [{ labelKey: field.labelKey, value: field.value }] : []));
  }

  protected taskDescription(job: AnyJobRun): string {
    return job.kind === 'seo' ? '' : job.taskDescription;
  }

  protected copyRaw(log: JobError): void {
    const text = typeof log.error === 'string' ? log.error : JSON.stringify(log.error, null, 2);
    navigator.clipboard
      ?.writeText(text)
      .then(() => this.toast.info(this.translate.instant('common.copied')))
      .catch(() => undefined);
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
