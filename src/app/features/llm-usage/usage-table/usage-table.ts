import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LlmUsageFilters, LlmUsageRow, LlmUsageSortBy } from '../../../core/models/llm-usage.model';
import { LlmUsageService } from '../../../core/services/llm-usage.service';
import { PaginatorComponent } from '../../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { formatCost, formatInteger } from '../usage-format';
import { SortOrder } from '../usage-state';

/** Rows per page of the detailed table. */
export const USAGE_TABLE_PAGE_SIZE = 25;

export interface UsageTableSort {
  sortBy: LlmUsageSortBy;
  order: SortOrder;
}

interface Column {
  key: string;
  /** Set for the columns the backend can sort by. */
  sortBy?: LlmUsageSortBy;
  numeric: boolean;
}

const COLUMNS: readonly Column[] = [
  { key: 'date', sortBy: 'date', numeric: false },
  { key: 'flow', numeric: false },
  { key: 'type', numeric: false },
  { key: 'model', numeric: false },
  { key: 'requests', sortBy: 'requests', numeric: true },
  { key: 'inputTokens', sortBy: 'inputTokens', numeric: true },
  { key: 'outputTokens', sortBy: 'outputTokens', numeric: true },
  { key: 'cacheRead', numeric: true },
  { key: 'cacheWrite', numeric: true },
  { key: 'cost', sortBy: 'cost', numeric: true },
];

const sameJson = <T>(a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The dashboard's detailed table: the raw daily rows (`GET /llm-usage`)
 * for the current period and filters, sorted and paginated by the
 * backend. It owns its own fetching - the parent only hands over the
 * filters and the page / sort state (which live in the URL) and reacts to
 * `pageChange` / `sortChange`. A superseded request is cancelled, so a
 * slow response never overwrites a newer one.
 */
@Component({
  selector: 'app-usage-table',
  imports: [TranslatePipe, SpinnerComponent, PaginatorComponent],
  templateUrl: './usage-table.html',
  styleUrl: './usage-table.css',
})
export class UsageTableComponent {
  private readonly usageService = inject(LlmUsageService);
  private readonly translate = inject(TranslateService);

  readonly filters = input.required<LlmUsageFilters>();
  readonly page = input.required<number>();
  readonly sortBy = input.required<LlmUsageSortBy>();
  readonly order = input.required<SortOrder>();
  readonly locale = input('en-US');
  /** Human label of a flow type (falls back to the raw value - supplied by the dashboard, which owns the type labels). */
  readonly typeLabel = input<(type: string) => string>((type) => type);

  readonly pageChange = output<number>();
  readonly sortChange = output<UsageTableSort>();

  protected readonly columns = COLUMNS;

  protected readonly rows = signal<LlmUsageRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** True once a first response arrived - until then the spinner replaces the table; afterwards the old rows stay (dimmed) while the next page loads. */
  protected readonly loaded = signal(false);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / USAGE_TABLE_PAGE_SIZE)));

  private readonly query = computed(
    () => ({
      ...this.filters(),
      page: this.page(),
      limit: USAGE_TABLE_PAGE_SIZE,
      sortBy: this.sortBy(),
      order: this.order(),
    }),
    { equal: sameJson },
  );

  constructor() {
    effect((onCleanup) => {
      const query = this.query();
      this.loading.set(true);
      this.error.set(null);

      const subscription = this.usageService.getList(query).subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.total.set(result.total);
          this.loading.set(false);
          this.loaded.set(true);

          // A stale link (or a filter that shrank the data) can point past the last page: go to the last one.
          const lastPage = Math.max(1, Math.ceil(result.total / USAGE_TABLE_PAGE_SIZE));
          if (result.items.length === 0 && result.total > 0 && query.page > lastPage) {
            this.pageChange.emit(lastPage);
          }
        },
        error: (error) => {
          this.error.set(this.messageOf(error));
          this.loading.set(false);
          this.loaded.set(true);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected isSorted(column: Column): boolean {
    return !!column.sortBy && column.sortBy === this.sortBy();
  }

  protected ariaSort(column: Column): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortBy) {
      return null;
    }
    return this.isSorted(column) ? (this.order() === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  /** Clicking the active column flips its direction; any other column starts with the biggest / newest first. */
  protected sortOn(column: Column): void {
    if (!column.sortBy) {
      return;
    }
    const order: SortOrder = this.isSorted(column) ? (this.order() === 'desc' ? 'asc' : 'desc') : 'desc';
    this.sortChange.emit({ sortBy: column.sortBy, order });
  }

  protected integer(value: number): string {
    return formatInteger(value, this.locale());
  }

  /** The detailed table keeps 6 decimals - single requests cost fractions of a cent. */
  protected cost(value: number): string {
    return formatCost(value, this.locale(), 6);
  }

  /** Requests were made but no tokens / cost were reported (some models aren't metered) - shown as-is, with a hint. */
  protected isUnmetered(row: LlmUsageRow): boolean {
    return row.requests > 0 && row.cost === 0 && row.inputTokens === 0 && row.outputTokens === 0;
  }

  private messageOf(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const message = error.error?.message;
      if (Array.isArray(message)) {
        return message.join('; ');
      }
      if (typeof message === 'string' && message) {
        return message;
      }
    }
    return this.translate.instant('usage.error.generic');
  }
}
