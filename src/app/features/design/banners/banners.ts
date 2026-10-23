import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Banner, bannerStatusView, BannerStatusView, formatFileSize } from '../../../core/models/banner.model';
import { BannersService } from '../../../core/services/banners.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

/**
 * The Design section's "Banners" page: a gallery of the banners n8n has
 * generated, newest first - each card is the picture (loaded lazily), its
 * Figma name, a status badge, the date, the file size and the job it
 * belongs to. The page number lives in the URL (`?page=`).
 *
 * The pictures come from temporary links (`imageUrl`, ~10 minutes): when
 * one stops loading the list is quietly requested again - once - for fresh
 * links; a picture that still fails after that (or a banner whose
 * `imageUrl` is `null`) shows a placeholder with a "Refresh" button.
 * Filters, the full-size view and deleting come next.
 */
@Component({
  selector: 'app-banners',
  imports: [TranslatePipe, DatePipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent],
  templateUrl: './banners.html',
  styleUrl: './banners.css',
})
export class BannersComponent {
  protected readonly bannersService = inject(BannersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private currentPage = 1;
  /** A picture failing to load makes the list reload once; this stops a still-broken one from looping. */
  private refreshedAfterImageError = false;
  /** Banners whose picture failed even with fresh links - shown as a placeholder. */
  private readonly brokenIds = signal<ReadonlySet<string>>(new Set());

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.bannersService.total() / this.bannersService.limit())),
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const page = Number(params.get('page'));
      this.currentPage = Number.isInteger(page) && page >= 1 ? page : 1;
      this.reload();
    });

    // `?page=` beyond the last page (e.g. after the banners were cleaned up): move to the last one that exists.
    effect(() => {
      const service = this.bannersService;
      if (!service.loading() && !service.failed() && service.banners().length === 0 && service.total() > 0 && this.currentPage > 1) {
        this.goToPage(this.totalPages(), true);
      }
    });
  }

  /** Loads the current page with a loading state, forgetting earlier picture failures - on entering, on a page change and on "Refresh". */
  protected reload(): void {
    this.refreshedAfterImageError = false;
    this.brokenIds.set(new Set());
    this.bannersService.load({ page: this.currentPage });
  }

  protected goToPage(page: number, replaceUrl = false): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  protected onImageError(id: string): void {
    if (this.bannersService.refreshing()) {
      // Many pictures expire together and fail one after another: they're all waiting for the links already being fetched.
      return;
    }
    if (!this.refreshedAfterImageError) {
      // The links probably expired: fetch fresh ones without flashing the list.
      this.refreshedAfterImageError = true;
      this.bannersService.load({ page: this.currentPage }, { silent: true });
      return;
    }
    this.brokenIds.update((ids) => new Set(ids).add(id));
  }

  protected showImage(banner: Banner): boolean {
    return !!banner.imageUrl && !this.brokenIds().has(banner.id);
  }

  protected statusView(status: string): BannerStatusView {
    return bannerStatusView(status);
  }

  protected fileSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  /** The start of the job's id - enough to tell jobs apart; the whole id is in the tooltip. */
  protected shortId(id: string): string {
    return id.slice(0, 8);
  }
}
