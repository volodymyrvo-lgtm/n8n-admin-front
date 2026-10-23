import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '@env';
import { Banner, BannersQuery, PaginatedBanners } from '../models/banner.model';

const BANNERS_URL = `${environment.apiBaseUrl}/banners`;

/** Banners per page - the backend's default; kept low because every card loads a picture of up to a few hundred KB. */
export const DEFAULT_BANNERS_LIMIT = 20;

/**
 * The design banners (`GET /banners`): a page of them at a time, newest
 * first, each with a temporary `imageUrl` for its picture.
 *
 * `imageUrl`s expire after about 10 minutes, so a page is never worth
 * caching - the page component simply asks again (`load`) when a picture
 * stops loading.
 */
@Injectable({ providedIn: 'root' })
export class BannersService {
  private readonly http = inject(HttpClient);
  private request: Subscription | null = null;

  readonly banners = signal<Banner[]>([]);
  readonly total = signal<number>(0);
  readonly page = signal<number>(1);
  readonly limit = signal<number>(DEFAULT_BANNERS_LIMIT);
  /** True while a visible load runs (a `silent` one doesn't set it, so the list doesn't flash). */
  readonly loading = signal<boolean>(false);
  /** True while a `silent` load runs - the list is on screen, only its picture links are being renewed. */
  readonly refreshing = signal<boolean>(false);
  /** The last load failed (the error toast already said why); cleared by the next load. */
  readonly failed = signal<boolean>(false);

  /**
   * Loads a page. A newer call cancels one still running, so a quick
   * succession of page changes can't end with the older answer on screen.
   * `silent` skips the loading state - used to quietly refresh the picture
   * links under a list the user is already looking at.
   */
  load(query: BannersQuery = {}, options: { silent?: boolean } = {}): void {
    const params = new HttpParams()
      .set('page', query.page ?? 1)
      .set('limit', query.limit ?? DEFAULT_BANNERS_LIMIT);

    this.request?.unsubscribe();
    this.loading.set(!options.silent);
    this.refreshing.set(!!options.silent);
    this.failed.set(false);

    this.request = this.http.get<PaginatedBanners>(BANNERS_URL, { params }).subscribe({
      next: (result) => {
        this.banners.set(result.items);
        this.total.set(result.total);
        this.page.set(result.page);
        this.limit.set(result.limit);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }
}
