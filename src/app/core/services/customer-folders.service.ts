import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '@env';
import { CreateCustomerFolderRequest, CustomerFolder, CustomerFoldersResponse } from '../models/customer-folder.model';

const FOLDERS_URL = `${environment.apiBaseUrl}/customer-folders`;

/**
 * The customer's folder tree (`/customer-folders`) - the places banners can
 * be sent to. The backend returns every folder in one flat list; nesting is
 * rebuilt from `parentId` (see `buildFolderTree`).
 */
@Injectable({ providedIn: 'root' })
export class CustomerFoldersService {
  private readonly http = inject(HttpClient);

  readonly folders = signal<CustomerFolder[]>([]);
  readonly loading = signal<boolean>(false);
  /** The last load failed (the error toast already said why); cleared by the next load. */
  readonly failed = signal<boolean>(false);
  readonly creating = signal<boolean>(false);

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.http.get<CustomerFoldersResponse>(FOLDERS_URL).subscribe({
      next: (result) => {
        this.folders.set(result.items);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /**
   * `POST /customer-folders` with `{ name, parentId }` (`parentId: null` for a
   * top-level folder). The created folder is added to `folders` right away.
   */
  create(name: string, parentId: number | null, callbacks?: { onSuccess?: (created: CustomerFolder) => void; onError?: () => void }): void {
    if (this.creating()) {
      return;
    }
    this.creating.set(true);

    const body: CreateCustomerFolderRequest = { name: name.trim(), parentId };
    this.http.post<CustomerFolder>(FOLDERS_URL, body).subscribe({
      next: (created) => {
        this.folders.update((folders) => [...folders, created]);
        this.creating.set(false);
        callbacks?.onSuccess?.(created);
      },
      error: () => {
        this.creating.set(false);
        callbacks?.onError?.();
      },
    });
  }
}
