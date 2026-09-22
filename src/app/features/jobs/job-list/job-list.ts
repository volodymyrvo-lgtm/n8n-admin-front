import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { JobRun, JobRunStatus, JobSteps, StepStatus } from '../../../core/models/job.model';
import { JobsService } from '../../../core/services/jobs.service';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { UsersService } from '../../../core/services/users.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

interface StepEntry {
  key: string;
  status: StepStatus;
}

@Component({
  selector: 'app-job-list',
  imports: [RouterLink, TranslatePipe, DatePipe, EmptyStateComponent, SpinnerComponent],
  templateUrl: './job-list.html',
  styleUrl: './job-list.css',
})
export class JobListComponent implements OnInit, OnDestroy {
  protected readonly jobsService = inject(JobsService);
  protected readonly usersService = inject(UsersService);
  protected readonly ruleSetsService = inject(RuleSetsService);

  protected readonly selectedJobTypes = signal<string[]>([]);
  protected readonly selectedUserId = signal<string | null>(null);
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  /** Distinct job types actually present in the loaded runs - drives the type filter chips. */
  protected readonly jobTypeOptions = computed(() => {
    const types = new Set<string>();
    for (const run of this.jobsService.jobRuns()) {
      types.add(run.jobType);
    }
    return Array.from(types);
  });

  /** Distinct users who have run a job - drives the "run by" filter chips. */
  protected readonly runnerOptions = computed(() => {
    const ids = new Set<string>();
    for (const run of this.jobsService.jobRuns()) {
      ids.add(run.runnedById);
    }
    return Array.from(ids);
  });

  protected readonly filteredJobRuns = computed(() => {
    const jobTypes = this.selectedJobTypes();
    const userId = this.selectedUserId();
    return this.jobsService.jobRuns().filter((run) => {
      if (jobTypes.length > 0 && !jobTypes.includes(run.jobType)) {
        return false;
      }
      return !(userId && run.runnedById !== userId);
    });
  });

  ngOnInit(): void {
    this.jobsService.loadJobRuns();
    this.usersService.loadUsers();
    this.ruleSetsService.loadRuleSets();
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
  }

  protected clearJobTypeFilter(): void {
    this.selectedJobTypes.set([]);
  }

  protected toggleUserFilter(userId: string): void {
    this.selectedUserId.update((current) => (current === userId ? null : userId));
  }

  protected clearUserFilter(): void {
    this.selectedUserId.set(null);
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

  protected cardStatusClass(status: JobRunStatus): string {
    return `job-card--${status}`;
  }
}
