import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '@env';
import { CreateGlossaryInput, Glossary, GlossaryEntry, GlossaryEntryInput } from '../models/glossary.model';

const GLOSSARIES_URL = `${environment.apiBaseUrl}/glossaries`;

export interface GlossaryCallbacks<T> {
  onSuccess?: (item: T) => void;
  onError?: (error: unknown) => void;
}

export interface SimpleCallbacks {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Glossaries and their entries. A glossary (e.g. the EN->AZ glossary)
 * is the top-level resource (`/glossaries`), its terms are a nested
 * sub-resource (`/glossaries/:id/entries[/:entryId]`). `entries`/
 * `entriesLoading` hold the terms of whichever glossary was last
 * loaded with `loadEntries` - only one glossary's terms are open in
 * the UI at a time, so there is no need to key them by glossary id.
 */
@Injectable({ providedIn: 'root' })
export class GlossariesService {
  private readonly http = inject(HttpClient);

  readonly glossaries = signal<Glossary[]>([]);
  readonly loading = signal<boolean>(false);

  readonly entries = signal<GlossaryEntry[]>([]);
  readonly entriesLoading = signal<boolean>(false);

  loadGlossaries(): void {
    this.loading.set(true);
    this.http
      .get<Glossary[]>(GLOSSARIES_URL)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (glossaries) => this.glossaries.set(glossaries),
      });
  }

  addGlossary(input: CreateGlossaryInput, callbacks?: GlossaryCallbacks<Glossary>): void {
    this.http.post<Glossary>(GLOSSARIES_URL, input).subscribe({
      next: (created) => {
        this.glossaries.update((items) => [...items, created]);
        callbacks?.onSuccess?.(created);
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  updateGlossary(id: string, input: CreateGlossaryInput, callbacks?: GlossaryCallbacks<Glossary>): void {
    this.http.patch<Glossary>(`${GLOSSARIES_URL}/${id}`, input).subscribe({
      next: (updated) => {
        this.glossaries.update((items) => items.map((item) => (item.id === id ? updated : item)));
        callbacks?.onSuccess?.(updated);
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  deleteGlossary(id: string, callbacks?: SimpleCallbacks): void {
    this.http.delete(`${GLOSSARIES_URL}/${id}`).subscribe({
      next: () => {
        this.glossaries.update((items) => items.filter((item) => item.id !== id));
        callbacks?.onSuccess?.();
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  loadEntries(glossaryId: string): void {
    this.entriesLoading.set(true);
    this.http
      .get<GlossaryEntry[]>(`${GLOSSARIES_URL}/${glossaryId}/entries`)
      .pipe(finalize(() => this.entriesLoading.set(false)))
      .subscribe({
        next: (entries) => this.entries.set(entries),
      });
  }

  addEntry(glossaryId: string, input: GlossaryEntryInput, callbacks?: GlossaryCallbacks<GlossaryEntry>): void {
    this.http.post<GlossaryEntry>(`${GLOSSARIES_URL}/${glossaryId}/entries`, input).subscribe({
      next: (created) => {
        this.entries.update((items) => [...items, created]);
        callbacks?.onSuccess?.(created);
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  updateEntry(
    glossaryId: string,
    entryId: string,
    input: GlossaryEntryInput,
    callbacks?: GlossaryCallbacks<GlossaryEntry>,
  ): void {
    this.http.patch<GlossaryEntry>(`${GLOSSARIES_URL}/${glossaryId}/entries/${entryId}`, input).subscribe({
      next: (updated) => {
        this.entries.update((items) => items.map((item) => (item.id === entryId ? updated : item)));
        callbacks?.onSuccess?.(updated);
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  /**
   * The backend refuses to delete a glossary's last entry (400/409) -
   * callers should inspect the error passed to `onError` and show a
   * dedicated message rather than the generic error toast in that case.
   */
  deleteEntry(glossaryId: string, entryId: string, callbacks?: SimpleCallbacks): void {
    this.http.delete(`${GLOSSARIES_URL}/${glossaryId}/entries/${entryId}`).subscribe({
      next: () => {
        this.entries.update((items) => items.filter((item) => item.id !== entryId));
        callbacks?.onSuccess?.();
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }
}
