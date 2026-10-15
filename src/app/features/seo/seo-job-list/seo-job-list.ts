import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { JobRunStatus, JobSteps, parseSeoPrompt, SeoJobRun, StepStatus } from '../../../core/models/job.model';
import { PromptsService } from '../../../core/services/prompts.service';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { SeoJobsService } from '../../../core/services/seo-jobs.service';
import { UsersService } from '../../../core/services/users.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

/** Jobs per page - same as the communication jobs list. */
const PAGE_SIZE = 10;

interface StepEntry {
  key: string;
  status: StepStatus;
}

/**
 * All SEO jobs (`GET /jobs?kind=seo`), newest first, as expandable cards
 * like the communication jobs page - the card's header is the page task,
 * its body the rest of the job's fields. Rows update live through the
 * jobs websocket (SeoJobsService ignores every other kind of job).
 */
@Component({
  selector: 'app-seo-job-list',
  imports: [RouterLink, TranslatePipe, DatePipe, CurrencyPipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent],
  templateUrl: './seo-job-list.html',
  // The cards look exactly like the communication ones: same stylesheet.
  styleUrl: '../../jobs/job-list/job-list.css',
})
export class SeoJobListComponent implements OnInit, OnDestroy {
  protected readonly seoJobsService = inject(SeoJobsService);
  private readonly usersService = inject(UsersService);
  private readonly promptsService = inject(PromptsService);
  private readonly ruleSetsService = inject(RuleSetsService);

  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.seoJobsService.total() / this.seoJobsService.limit())),
  );

  ngOnInit(): void {
    this.seoJobsService.loadJobs({ page: 1, limit: PAGE_SIZE });
    // For the "run by" and prompt names on the cards.
    this.usersService.loadUsers();
    this.promptsService.loadPrompts('seo');
    this.ruleSetsService.loadRuleSets('seo');
    this.seoJobsService.connectJobUpdates();
  }

  ngOnDestroy(): void {
    this.seoJobsService.disconnectJobUpdates();
  }

  protected goToPage(page: number): void {
    this.seoJobsService.loadJobs({ page, limit: PAGE_SIZE });
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

  protected stepEntries(steps: JobSteps): StepEntry[] {
    return Object.entries(steps).map(([key, step]) => ({ key, status: step.status }));
  }

  protected runnerName(userId: string | null): string {
    if (!userId) {
      return '—';
    }
    return this.usersService.users().find((user) => user.id === userId)?.username ?? userId;
  }

  /** The job's `prompt` (`"<LANGUAGE> <promptId>"`) shown as the prompt's name; the raw string if the prompt can't be found or the format is unexpected. */
  protected promptLabel(job: SeoJobRun): string {
    const parsed = parseSeoPrompt(job.prompt);
    const name = parsed ? this.promptsService.seoPrompts().find((prompt) => prompt.id === parsed.promptId)?.name : undefined;
    return name ?? job.prompt;
  }

  /** A rule's name for the card; the raw id if the rule isn't loaded (e.g. it was deleted). */
  protected ruleSetName(ruleId: string): string {
    return this.ruleSetsService.seoRuleSets().find((rule) => rule.id === ruleId)?.ruleName ?? ruleId;
  }

  protected spendEntries(spend: Record<string, number>): { key: string; value: number }[] {
    return Object.entries(spend).map(([key, value]) => ({ key, value }));
  }

  protected spendTotal(spend: Record<string, number>): number {
    return Object.values(spend).reduce((sum, value) => sum + value, 0);
  }

  protected cardStatusClass(status: JobRunStatus): string {
    return `job-card--${status}`;
  }
}
