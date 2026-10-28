import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '@env';
import {
  Banner,
  BannersQuery,
  BulkDeleteBannersRequest,
  BulkDeleteBannersResponse,
  DeleteAllBannersResponse,
  PaginatedBanners,
  SendBannersRequest,
} from '../models/banner.model';

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
  /** True while a deletion (all, or the selected ones) runs - it can take a few seconds. */
  readonly deleting = signal<boolean>(false);
  /** True while a send (all, or the selected ones) runs. */
  readonly sending = signal<boolean>(false);
  /** True while a picture replacement is uploading. */
  readonly replacing = signal<boolean>(false);
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

  /**
   * `DELETE /banners` - removes ALL banners (and their files), whatever
   * filters the page has. Admin only; the backend checks too (`403`). It
   * works in batches, so a failure midway leaves some banners already gone:
   * the caller should reload the list either way, and a repeat call
   * finishes the job.
   */
  deleteAll(callbacks?: { onSuccess?: (deletedCount: number) => void; onError?: () => void }): void {
    if (this.deleting() || this.sending() || this.replacing()) {
      return;
    }
    this.deleting.set(true);

    this.http.delete<DeleteAllBannersResponse>(BANNERS_URL).subscribe({
      next: (result) => {
        this.deleting.set(false);
        callbacks?.onSuccess?.(result.deletedCount);
      },
      error: () => {
        this.deleting.set(false);
        callbacks?.onError?.();
      },
    });
  }

  /**
   * `POST /banners/bulk-delete` with `{ ids }` - removes just those banners
   * (and their files). Admin only (`403` otherwise). Reports how many were
   * deleted: the count the backend answers with, or - if it sends none - the
   * number of ids that were asked for. On a failure some of them may already
   * be gone, so the caller should reload the list either way.
   */
  deleteMany(ids: readonly string[], callbacks?: { onSuccess?: (deletedCount: number) => void; onError?: () => void }): void {
    if (this.deleting() || this.sending() || this.replacing() || ids.length === 0) {
      return;
    }
    this.deleting.set(true);

    const body: BulkDeleteBannersRequest = { ids: [...ids] };
    this.http.post<BulkDeleteBannersResponse | null>(`${BANNERS_URL}/bulk-delete`, body).subscribe({
      next: (result) => {
        this.deleting.set(false);
        callbacks?.onSuccess?.(result?.deletedCount ?? ids.length);
      },
      error: () => {
        this.deleting.set(false);
        callbacks?.onError?.();
      },
    });
  }

  /**
   * `POST /banners/send` - sends banners to a customer folder.
   *
   * - `ids` given: just those banners; omitted: every banner that isn't
   *   `sent` yet (an empty list is NOT "all" - it sends nothing).
   * - `parentId` given: into that folder; omitted/`null`: the root folder.
   *
   * With neither the body is `{}`. Some banners may be sent even if the
   * request fails, so the caller should reload the list either way.
   */
  send(options: { ids?: readonly string[]; parentId?: number | null } = {}, callbacks?: { onSuccess?: () => void; onError?: () => void }): void {
    if (this.sending() || this.deleting() || this.replacing() || (options.ids !== undefined && options.ids.length === 0)) {
      return;
    }
    this.sending.set(true);

    const body: SendBannersRequest = {};
    if (options.ids !== undefined) {
      body.ids = [...options.ids];
    }
    if (options.parentId !== undefined && options.parentId !== null) {
      body.parentId = options.parentId;
    }
    this.http.post<unknown>(`${BANNERS_URL}/send`, body).subscribe({
      next: () => {
        this.sending.set(false);
        callbacks?.onSuccess?.();
      },
      error: () => {
        this.sending.set(false);
        callbacks?.onError?.();
      },
    });
  }

  /**
   * `PUT /banners/:id/image` - replaces one banner's picture (and, if given,
   * its name). Admin only (`403` otherwise). The body is `multipart/form-data`
   * built from a `FormData`: `file` (a PNG up to 10 MB) and, only when the
   * name changes, `figmaImageName`. No `Content-Type` is set on purpose - the
   * browser adds it with the multipart boundary, and a hand-written one would
   * break the request.
   */
  replaceImage(
    id: string,
    file: File,
    figmaImageName: string | undefined,
    callbacks?: { onSuccess?: () => void; onError?: () => void },
  ): void {
    if (this.replacing() || this.deleting() || this.sending()) {
      return;
    }
    this.replacing.set(true);

    const body = new FormData();
    body.append('file', file);
    if (figmaImageName !== undefined) {
      body.append('figmaImageName', figmaImageName);
    }
    this.http.put<unknown>(`${BANNERS_URL}/${encodeURIComponent(id)}/image`, body).subscribe({
      next: () => {
        this.replacing.set(false);
        callbacks?.onSuccess?.();
      },
      error: () => {
        this.replacing.set(false);
        callbacks?.onError?.();
      },
    });
  }
}
