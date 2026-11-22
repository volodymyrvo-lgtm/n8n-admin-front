import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '@env';
import {
  CreateGlossaryInput,
  Glossary,
  GlossaryEntry,
  GlossaryEntryInput,
  GlossaryKind,
  UpdateGlossaryInput,
} from '../models/glossary.model';

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
 *
 * Glossaries come in two kinds (see GlossaryKind): the Content section's
 * (`glossaries`, fetched with a plain `GET /glossaries`, as before the
 * kinds existed - the job form's localization picker reads this one) and
 * the Blog AI assistant's (`blogAiGlossaries`, `GET /glossaries?kind=blog_ai`).
 * They're separate signals so one section never shows the other's.
 */
@Injectable({ providedIn: 'root' })
export class GlossariesService {
  private readonly http = inject(HttpClient);

  readonly glossaries = signal<Glossary[]>([]);
  /** Blog AI assistant glossaries. */
  readonly blogAiGlossaries = signal<Glossary[]>([]);
  readonly loading = signal<boolean>(false);

  readonly entries = signal<GlossaryEntry[]>([]);
  readonly entriesLoading = signal<boolean>(false);

  /** The list for a kind - lets a page that serves both sections pick its own. */
  glossariesFor(kind: GlossaryKind): WritableSignal<Glossary[]> {
    return kind === 'blog_ai' ? this.blogAiGlossaries : this.glossaries;
  }

  loadGlossaries(kind: GlossaryKind = 'communication'): void {
    this.loading.set(true);
    // Content glossaries keep the original, parameterless request.
    const request =
      kind === 'communication'
        ? this.http.get<Glossary[]>(GLOSSARIES_URL)
        : this.http.get<Glossary[]>(GLOSSARIES_URL, { params: new HttpParams().set('kind', kind) });

    request.pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (glossaries) => this.glossariesFor(kind).set(glossaries),
    });
  }

  /** Creates a glossary; `input.kind` (omitted for Content, `'blog_ai'` for Blog AI) decides which list it joins. */
  addGlossary(input: CreateGlossaryInput, callbacks?: GlossaryCallbacks<Glossary>): void {
    this.http.post<Glossary>(GLOSSARIES_URL, input).subscribe({
      next: (created) => {
        this.glossariesFor(input.kind ?? 'communication').update((items) => [...items, created]);
        callbacks?.onSuccess?.(created);
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  // Ids are unique across kinds, so update/delete just apply to both lists.

  updateGlossary(id: string, input: UpdateGlossaryInput, callbacks?: GlossaryCallbacks<Glossary>): void {
    this.http.patch<Glossary>(`${GLOSSARIES_URL}/${id}`, input).subscribe({
      next: (updated) => {
        const replace = (items: Glossary[]) => items.map((item) => (item.id === id ? updated : item));
        this.glossaries.update(replace);
        this.blogAiGlossaries.update(replace);
        callbacks?.onSuccess?.(updated);
      },
      error: (error) => callbacks?.onError?.(error),
    });
  }

  deleteGlossary(id: string, callbacks?: SimpleCallbacks): void {
    this.http.delete(`${GLOSSARIES_URL}/${id}`).subscribe({
      next: () => {
        const remove = (items: Glossary[]) => items.filter((item) => item.id !== id);
        this.glossaries.update(remove);
        this.blogAiGlossaries.update(remove);
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
