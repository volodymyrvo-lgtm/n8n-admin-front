import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { JobRunStatus, JobSteps, StepStatus } from '../../../core/models/job.model';
import { DesignJobsService } from '../../../core/services/design-jobs.service';
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
 * All design jobs (`GET /jobs?kind=design`), newest first, as expandable
 * cards like the other jobs pages - the card's header is the task
 * description, its body the rest of the job's fields. Rows update live
 * through the jobs websocket (DesignJobsService ignores every other kind
 * of job).
 */
@Component({
  selector: 'app-design-job-list',
  imports: [RouterLink, TranslatePipe, DatePipe, CurrencyPipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent],
  templateUrl: './design-job-list.html',
  // The cards look exactly like the communication ones: same stylesheet, plus the description block.
  styleUrls: ['../../jobs/job-list/job-list.css', './design-job-list.css'],
})
export class DesignJobListComponent implements OnInit, OnDestroy {
  protected readonly designJobsService = inject(DesignJobsService);
  private readonly usersService = inject(UsersService);

  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.designJobsService.total() / this.designJobsService.limit())),
  );

  ngOnInit(): void {
    this.designJobsService.loadJobs({ page: 1, limit: PAGE_SIZE });
    // For the "run by" names on the cards.
    this.usersService.loadUsers();
    this.designJobsService.connectJobUpdates();
  }

  ngOnDestroy(): void {
    this.designJobsService.disconnectJobUpdates();
  }

  protected goToPage(page: number): void {
    this.designJobsService.loadJobs({ page, limit: PAGE_SIZE });
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
