import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Banner, bannerStatusView, BannerStatusView, formatFileSize } from '../../../core/models/banner.model';
import { folderPath } from '../../../core/models/customer-folder.model';
import { AuthService } from '../../../core/services/auth.service';
import { BannersService } from '../../../core/services/banners.service';
import { CustomerFoldersService } from '../../../core/services/customer-folders.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';
import { PaginatorComponent } from '../../../shared/components/paginator/paginator';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { BannerFoldersComponent } from './banner-folders/banner-folders';
import { BannerReplaceDialogComponent, BannerReplacement } from './banner-replace-dialog/banner-replace-dialog';

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
 *
 * Admins can also cancel banners: tick some (a checkbox on each card, or
 * "select all" for the page) and "Cancel selected" sends their ids to
 * `POST /banners/bulk-delete`, after a confirmation; or "Cancel all"
 * (`DELETE /banners`) removes every banner and file, and there the word
 * DELETE has to be typed to confirm. The selection is per page: it is
 * dropped for banners that leave the page.
 *
 * Admins can replace one banner's picture (and rename it) from its card:
 * "Replace" opens a dialog with a PNG picker (up to 10 MB) and the name,
 * uploaded with `PUT /banners/:id/image`.
 *
 * Admins and users can also send banners to the chosen destination folder
 * (or the root when none is chosen): "Send all" (everything not sent yet) or
 * "Send selected" (`POST /banners/send`), each after a confirmation.
 *
 * Beside the gallery sits the customer's folder tree (`BannerFoldersComponent`):
 * the folder chosen there is the destination for sending banners and
 * lives in the URL (`?folder=`); it doesn't filter the gallery. Filters, the full-size view and deleting one banner come next.
 */
@Component({
  selector: 'app-banners',
  imports: [TranslatePipe, DatePipe, EmptyStateComponent, SpinnerComponent, PaginatorComponent, ConfirmDialogComponent, BannerFoldersComponent, BannerReplaceDialogComponent],
  templateUrl: './banners.html',
  styleUrl: './banners.css',
})
export class BannersComponent {
  protected readonly bannersService = inject(BannersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  private readonly foldersService = inject(CustomerFoldersService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  /** The word to type to confirm "Cancel all". */
  protected readonly cancelAllWord = 'DELETE';
  protected readonly confirmingCancelAll = signal(false);
  protected readonly confirmingCancelSelected = signal(false);
  /** The banner whose picture is being replaced (the dialog is open for it). */
  protected readonly replacingBanner = signal<Banner | null>(null);
  /** What the open "send" confirmation is about: every unsent banner, or the ticked ones. */
  protected readonly confirmingSend = signal<'all' | 'selected' | null>(null);

  /** Ids of the banners ticked for "Cancel selected" - only ever ones on the current page. */
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selectedIds().size);
  protected readonly allSelected = computed(() => {
    const banners = this.bannersService.banners();
    return banners.length > 0 && banners.every((banner) => this.selectedIds().has(banner.id));
  });

  /** The destination folder chosen in the folder tree (`?folder=`); it doesn't filter the banners. */
  protected readonly selectedFolderId = signal<number | null>(null);

  /** Admins and users can send banners (readers only look); deleting them stays admin-only. */
  protected readonly canSend = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role === 'admin' || role === 'user';
  });

  /** The chosen folder from the root down, once the folder list knows it - empty for the root, or while the id can't be resolved. */
  private readonly destinationPath = computed(() => folderPath(this.selectedFolderId(), this.foldersService.folders()));
  /** A folder is chosen (`?folder=`) but not (yet) found in the loaded list: sending now would silently go to the root instead. */
  protected readonly destinationUnknown = computed(() => this.selectedFolderId() !== null && this.destinationPath().length === 0);
  protected readonly sendBlocked = computed(
    () => this.destinationUnknown() || this.bannersService.sending() || this.bannersService.deleting() || this.bannersService.replacing(),
  );

  private currentPage = 1;
  private pageLoaded = false;
  /** A picture failing to load makes the list reload once; this stops a still-broken one from looping. */
  private refreshedAfterImageError = false;
  /** Banners whose picture failed even with fresh links - shown as a placeholder. */
  private readonly brokenIds = signal<ReadonlySet<string>>(new Set());

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.bannersService.total() / this.bannersService.limit())),
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const folder = Number(params.get('folder'));
      this.selectedFolderId.set(params.get('folder') !== null && Number.isInteger(folder) && folder >= 0 ? folder : null);

      // Choosing a folder changes the URL too, but the banners shown don't depend on it - only a page change reloads.
      const page = Number(params.get('page'));
      const nextPage = Number.isInteger(page) && page >= 1 ? page : 1;
      if (this.pageLoaded && nextPage === this.currentPage) {
        return;
      }
      this.pageLoaded = true;
      this.currentPage = nextPage;
      this.reload();
    });

    // A selection can't outlive its banners (a reload, another page, a deletion): drop ids that are no longer on the page.
    effect(() => {
      const onPage = new Set(this.bannersService.banners().map((banner) => banner.id));
      const current = untracked(() => this.selectedIds());
      const kept = [...current].filter((id) => onPage.has(id));
      if (kept.length !== current.size) {
        this.selectedIds.set(new Set(kept));
      }
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

  protected selectFolder(id: number | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { folder: id },
      queryParamsHandling: 'merge',
    });
  }

  protected isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  protected toggleSelected(id: string): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  /** Ticks every banner on the page, or - if they all are ticked already - clears the selection. */
  protected toggleAllSelected(): void {
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.bannersService.banners().map((banner) => banner.id)));
  }

  /** Where banners would go: the chosen folder's path, or the root. */
  protected destinationLabel(): string {
    const path = this.destinationPath();
    return path.length > 0 ? path.map((folder) => folder.name).join(' / ') : this.translate.instant('banners.send.root');
  }

  protected askReplace(banner: Banner): void {
    // Defense in depth - the button is only rendered for admins, and the backend answers 403 to anyone else.
    if (this.authService.isAdmin()) {
      this.replacingBanner.set(banner);
    }
  }

  protected closeReplace(): void {
    this.replacingBanner.set(null);
  }

  /** `PUT /banners/:id/image`: the new PNG and - only if it changed - the new name. */
  protected replace(replacement: BannerReplacement): void {
    const banner = this.replacingBanner();
    if (!banner || !this.authService.isAdmin()) {
      return;
    }
    this.bannersService.replaceImage(banner.id, replacement.file, replacement.figmaImageName, {
      onSuccess: () => {
        this.replacingBanner.set(null);
        this.toast.success(this.translate.instant('banners.toast.replaced', { name: replacement.figmaImageName ?? banner.figmaImageName }));
        // Fresh picture link (and name) without flashing the list.
        this.refreshedAfterImageError = false;
        this.brokenIds.set(new Set());
        this.bannersService.load({ page: this.currentPage }, { silent: true });
      },
      // The error toast already says why (not a PNG, too big, 403...); the dialog stays open so the file can be changed or retried.
      onError: () => undefined,
    });
  }

  protected askSend(mode: 'all' | 'selected'): void {
    if (!this.canSend() || this.sendBlocked() || (mode === 'selected' && this.selectedCount() === 0)) {
      return;
    }
    this.confirmingSend.set(mode);
  }

  protected closeSend(): void {
    this.confirmingSend.set(null);
  }

  /** `POST /banners/send`: `{}` for all unsent banners, `{ ids }` for the ticked ones - plus `parentId` when a folder is chosen. */
  protected send(): void {
    const mode = this.confirmingSend();
    if (!mode || !this.canSend() || this.sendBlocked()) {
      return;
    }
    const ids = mode === 'selected' ? [...this.selectedIds()] : undefined;
    const parentId = this.destinationPath().at(-1)?.id ?? null;
    this.bannersService.send(
      { ids, parentId },
      {
        onSuccess: () => {
          this.confirmingSend.set(null);
          if (mode === 'selected') {
            this.selectedIds.set(new Set());
          }
          this.toast.success(
            mode === 'selected'
              ? this.translate.instant('banners.toast.sentSelected', { count: ids?.length, destination: this.destinationLabel() })
              : this.translate.instant('banners.toast.sentAll', { destination: this.destinationLabel() }),
          );
          // Statuses change as they go out: show the current ones.
          this.reload();
        },
        // The error toast already says why; some banners may have gone out anyway, so show what is left.
        onError: () => {
          this.confirmingSend.set(null);
          this.reload();
        },
      },
    );
  }

  protected askCancelSelected(): void {
    if (this.authService.isAdmin() && this.selectedCount() > 0) {
      this.confirmingCancelSelected.set(true);
    }
  }

  protected closeCancelSelected(): void {
    this.confirmingCancelSelected.set(false);
  }

  protected cancelSelected(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.bannersService.deleteMany([...this.selectedIds()], {
      onSuccess: (deletedCount) => {
        this.confirmingCancelSelected.set(false);
        this.selectedIds.set(new Set());
        this.toast.success(this.translate.instant('banners.toast.cancelledSelected', { count: deletedCount }));
        // Reload this page; if it is now empty the "beyond the last page" effect moves to the last one.
        this.reload();
      },
      // The error toast already says why; some of them may be gone, so show what is left (the ticks that survive stay ticked).
      onError: () => {
        this.confirmingCancelSelected.set(false);
        this.reload();
      },
    });
  }

  protected askCancelAll(): void {
    // Defense in depth - the button is only rendered for admins, and the backend answers 403 to anyone else.
    if (this.authService.isAdmin()) {
      this.confirmingCancelAll.set(true);
    }
  }

  protected closeCancelAll(): void {
    this.confirmingCancelAll.set(false);
  }

  protected cancelAll(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.bannersService.deleteAll({
      onSuccess: (deletedCount) => {
        this.confirmingCancelAll.set(false);
        this.toast.success(this.translate.instant('banners.toast.cancelledAll', { count: deletedCount }));
        this.showFirstPage();
      },
      // The error toast already says why; part of the banners may be gone, so show what is left.
      onError: () => {
        this.confirmingCancelAll.set(false);
        this.reload();
      },
    });
  }

  /** Back to page 1 and a fresh list - after the banners were wiped the current page may no longer exist. */
  private showFirstPage(): void {
    if (this.currentPage > 1) {
      // Changing the URL reloads through the query-params subscription.
      this.goToPage(1);
    } else {
      this.reload();
    }
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
