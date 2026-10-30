import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env';
import { SKIP_ERROR_TOAST } from '../interceptors/error-toast.interceptor';
import { PaginatedUpdatedEmails, UpdatedEmail, UpdatedEmailListItem } from '../models/updated-email.model';

const UPDATED_EMAILS_URL = `${environment.apiBaseUrl}/updated-emails`;

export const DEFAULT_UPDATED_EMAILS_LIMIT = 20;

/**
 * The emails updated by the "email HTML update" jobs: the paginated list
 * (`GET /updated-emails`) and, for the one being looked at, its HTML
 * (`GET /updated-emails/:id`).
 */
@Injectable({ providedIn: 'root' })
export class UpdatedEmailsService {
  private readonly http = inject(HttpClient);

  readonly emails = signal<UpdatedEmailListItem[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = signal(DEFAULT_UPDATED_EMAILS_LIMIT);
  readonly loading = signal(false);
  /** True when the last page request failed - lets the page offer a retry. */
  readonly failed = signal(false);

  loadEmails(query: { page?: number; limit?: number } = {}): void {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_UPDATED_EMAILS_LIMIT;

    this.loading.set(true);
    this.failed.set(false);
    this.http
      .get<PaginatedUpdatedEmails>(UPDATED_EMAILS_URL, { params: new HttpParams().set('page', page).set('limit', limit) })
      .subscribe({
        next: (result) => {
          this.emails.set(result.items);
          this.total.set(result.total);
          this.page.set(result.page);
          this.limit.set(result.limit);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  /** One updated email with its HTML. A failure is shown in the modal itself, so no error toast. */
  getEmail(id: string): Observable<UpdatedEmail> {
    return this.http.get<UpdatedEmail>(`${UPDATED_EMAILS_URL}/${encodeURIComponent(id)}`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }
}
