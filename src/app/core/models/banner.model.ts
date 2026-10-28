/** Where a banner stands in moderation. Only `pending` exists today - the rest are already returned by (and filterable on) the backend. */
export type BannerStatus = 'pending' | 'approved' | 'rejected' | 'sending' | 'sent' | 'send_failed';

/** One banner of `GET /banners`. The picture itself is not in the response - `imageUrl` is a temporary signed link to it. */
export interface Banner {
  id: string;
  /** The job the banner was generated for; `null` when n8n didn't send one or the job was deleted. */
  jobId: string | null;
  /** The name from Figma - NOT unique (a banner can be regenerated), `id` is the identifier. */
  figmaImageName: string;
  mimeType: string;
  sizeBytes: number;
  /** Typed as the known values, but a new one may appear on the backend - see `bannerStatusView`. */
  status: BannerStatus | string;
  createdAt: string;
  /** Signed link, works in a plain `<img src>` for about 10 minutes; `null` when the file is unavailable. */
  imageUrl: string | null;
}

/** `GET /banners` is paginated; `page` is 1-based and `total` counts the banners matching the filters. */
export interface PaginatedBanners {
  items: Banner[];
  total: number;
  page: number;
  limit: number;
}

/** `DELETE /banners` (admin only) removes every banner and answers with how many it removed. */
export interface DeleteAllBannersResponse {
  deletedCount: number;
}

/** Body of `POST /banners/bulk-delete` (admin only): the banners to delete. */
export interface BulkDeleteBannersRequest {
  ids: string[];
}

/** What `POST /banners/bulk-delete` may answer with; the count is optional because only the request shape is specified. */
export interface BulkDeleteBannersResponse {
  deletedCount?: number;
}

/**
 * Body of `POST /banners/send`. Both fields are optional and combine:
 * no `ids` = every banner that isn't `sent` yet; no `parentId` = the root
 * folder. An empty body therefore sends everything to the root.
 */
export interface SendBannersRequest {
  ids?: string[];
  parentId?: number;
}

/** `PUT /banners/:id/image` accepts PNG only, up to 10 MB. */
export const BANNER_IMAGE_MIME_TYPE = 'image/png';
export const BANNER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Why a file can't replace a banner's picture, or `null` if it can (the backend checks again and answers 400 / 413). */
export type BannerImageProblem = 'type' | 'size' | 'empty';

export function bannerImageProblem(file: Pick<File, 'type' | 'size'>): BannerImageProblem | null {
  if (file.type !== BANNER_IMAGE_MIME_TYPE) {
    return 'type';
  }
  if (file.size === 0) {
    return 'empty';
  }
  return file.size > BANNER_IMAGE_MAX_BYTES ? 'size' : null;
}

export interface BannersQuery {
  page?: number;
  limit?: number;
}

/** How a status is shown: a translation key for its label and the `status-badge` modifier for its colour. */
export interface BannerStatusView {
  labelKey: string | null;
  /** The raw value, shown as the label when the status isn't known (`labelKey` is `null`). */
  raw: string;
  badgeClass: string;
}

const KNOWN_STATUSES: Record<BannerStatus, { labelKey: string; badgeClass: string }> = {
  pending: { labelKey: 'banners.status.pending', badgeClass: 'status-badge--paused' },
  approved: { labelKey: 'banners.status.approved', badgeClass: 'status-badge--active' },
  rejected: { labelKey: 'banners.status.rejected', badgeClass: 'status-badge--failed' },
  sending: { labelKey: 'banners.status.sending', badgeClass: 'status-badge--admin' },
  sent: { labelKey: 'banners.status.sent', badgeClass: 'status-badge--active' },
  send_failed: { labelKey: 'banners.status.send_failed', badgeClass: 'status-badge--failed' },
};

/** The label and colour of a status; an unknown one falls back to its raw value on a neutral badge instead of breaking the page. */
export function bannerStatusView(status: string): BannerStatusView {
  const known = (KNOWN_STATUSES as Record<string, { labelKey: string; badgeClass: string }>)[status];
  return known
    ? { labelKey: known.labelKey, raw: status, badgeClass: known.badgeClass }
    : { labelKey: null, raw: status, badgeClass: 'status-badge--neutral' };
}

/** A file size for humans: bytes below 1 KB, then KB, then MB (one decimal for MB). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
