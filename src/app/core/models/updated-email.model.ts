/** One row of `GET /updated-emails`: which email was updated and when - the HTML itself is fetched on demand. */
export interface UpdatedEmailListItem {
  id: string;
  /** The email the update belongs to, e.g. `1_en` (number and language). */
  emailId: string;
  createdAt: string;
  updatedAt: string;
}

/** `GET /updated-emails/:id`: the list item plus the updated email's full HTML. */
export interface UpdatedEmail extends UpdatedEmailListItem {
  body: string;
}

/** `GET /updated-emails` is paginated on the backend (`page` is 1-based). */
export interface PaginatedUpdatedEmails {
  items: UpdatedEmailListItem[];
  total: number;
  page: number;
  limit: number;
}
