import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { JOB_TYPE_OPTIONS, JobRun, JobRunStatus, JobSteps, StepStatus } from '../../../core/models/job.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { JobsService } from '../../../core/services/jobs.service';
import { PromptsService } from '../../../core/services/prompts.service';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { UsersService } from '../../../core/services/users.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

interface StepEntry {
  key: string;
  status: StepStatus;
}

@Component({
  selector: 'app-job-list',
  imports: [RouterLink, TranslatePipe, DatePipe, CurrencyPipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent],
  templateUrl: './job-list.html',
  styleUrl: './job-list.css',
})
export class JobListComponent implements OnInit, OnDestroy {
  protected readonly jobsService = inject(JobsService);
  protected readonly usersService = inject(UsersService);
  protected readonly ruleSetsService = inject(RuleSetsService);
  protected readonly promptsService = inject(PromptsService);
  protected readonly glossariesService = inject(GlossariesService);

  protected readonly selectedJobTypes = signal<string[]>([]);
  protected readonly selectedUserId = signal<string | null>(null);
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  /**
   * The full known set of job types, for the type filter chips. Jobs are
   * paginated on the backend now (see JobsService.loadJobRuns) - `jobRuns`
   * only ever holds one page, so the chips can no longer be derived from
   * "types actually present in the loaded runs" the way they used to be.
   */
  protected readonly jobTypeOptions = JOB_TYPE_OPTIONS;

  /**
   * Every user, as candidates for the "run by" filter - same reasoning as
   * `jobTypeOptions` above: with only one page loaded at a time, we can't
   * derive "users who have actually run a job" from it any more.
   */
  protected readonly runnerOptions = computed(() => this.usersService.users().map((user) => user.id));

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.jobsService.jobRunsTotal() / this.jobsService.jobRunsLimit())),
  );

  ngOnInit(): void {
    this.refresh(1);
    this.usersService.loadUsers();
    this.ruleSetsService.loadRuleSets();
    this.promptsService.loadPrompts();
    this.glossariesService.loadGlossaries();
    this.jobsService.connectJobUpdates();
  }

  ngOnDestroy(): void {
    this.jobsService.disconnectJobUpdates();
  }

  protected trackJobRun(_index: number, run: JobRun): string {
    return run.id;
  }

  protected toggleJobTypeFilter(jobType: string): void {
    this.selectedJobTypes.update((current) =>
      current.includes(jobType) ? current.filter((type) => type !== jobType) : [...current, jobType],
    );
    this.refresh(1);
  }

  protected clearJobTypeFilter(): void {
    this.selectedJobTypes.set([]);
    this.refresh(1);
  }

  protected toggleUserFilter(userId: string): void {
    this.selectedUserId.update((current) => (current === userId ? null : userId));
    this.refresh(1);
  }

  protected clearUserFilter(): void {
    this.selectedUserId.set(null);
    this.refresh(1);
  }

  protected goToPage(page: number): void {
    this.refresh(page);
  }

  /** (Re)fetches job runs for the given page from the backend, using the current filter selections - called on init, on every filter change (reset to page 1) and on every page navigation. */
  private refresh(page: number): void {
    this.jobsService.loadJobRuns({
      page,
      limit: 10,
      jobTypes: this.selectedJobTypes(),
      runnedById: this.selectedUserId(),
    });
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

  protected runnerName(userId: string): string {
    return this.usersService.users().find((user) => user.id === userId)?.username ?? userId;
  }

  protected ruleSetName(ruleId: string): string {
    return this.ruleSetsService.ruleSets().find((ruleSet) => ruleSet.id === ruleId)?.ruleName ?? ruleId;
  }

  protected promptName(promptId: string): string {
    return this.promptsService.prompts().find((prompt) => prompt.id === promptId)?.name ?? promptId;
  }

  protected glossaryName(glossaryId: string): string {
    return this.glossariesService.glossaries().find((glossary) => glossary.id === glossaryId)?.glossaryName ?? glossaryId;
  }

  /** Per-key spend rows for the card's spend breakdown, e.g. { gpt_6_astra: 0.34 } -> [{ key: 'gpt_6_astra', value: 0.34 }]. */
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
