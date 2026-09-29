import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Prev/next pager shown under a list or table. Works the same whether the
 * pages come from the backend (e.g. JobsService, which only ever holds one
 * page of job runs at a time) or from slicing an already-fully-loaded
 * array on the frontend (e.g. RuleSetsComponent/PromptsComponent) - either
 * way this component only cares about the current page and how many pages
 * there are, and leaves fetching/slicing to whoever owns the data.
 *
 * Renders nothing when there's only one page, so pages that happen to fit
 * on a single page don't grow an empty control.
 */
@Component({
  selector: 'app-paginator',
  imports: [TranslatePipe],
  templateUrl: './paginator.html',
  styleUrl: './paginator.css',
})
export class PaginatorComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageChange = output<number>();

  protected goPrev(): void {
    if (this.page() > 1) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  protected goNext(): void {
    if (this.page() < this.totalPages()) {
      this.pageChange.emit(this.page() + 1);
    }
  }
}
