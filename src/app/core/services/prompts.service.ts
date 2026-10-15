import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal, WritableSignal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '@env';
import { CreatePromptInput, Prompt, PromptKind } from '../models/prompt.model';

const PROMPTS_URL = `${environment.apiBaseUrl}/prompts`;

export interface PromptCallbacks {
  onSuccess?: (prompt: Prompt) => void;
  onError?: () => void;
}

/**
 * Prompt store backed by the real backend - list/create/update/delete all
 * go through HTTP now (see the /prompts routes on the NestJS side), the
 * same shape as JobsService/RuleSetsService/UsersService.
 *
 * Prompts come in two kinds (see PromptKind): `communication` (CRM
 * mailings, `prompts`) and `seo` (SEO generation, `seoPrompts`). The
 * communication list is fetched with a plain `GET /prompts`, exactly as
 * before the kinds existed; the SEO one with `GET /prompts?kind=seo`.
 * They're kept in separate signals so one section never shows (or
 * flashes) the other's prompts.
 */
@Injectable({ providedIn: 'root' })
export class PromptsService {
  private readonly http = inject(HttpClient);
  /** Communication prompts (the default kind). */
  readonly prompts = signal<Prompt[]>([]);
  /** SEO prompts. */
  readonly seoPrompts = signal<Prompt[]>([]);
  readonly loading = signal<boolean>(false);

  /** The list for a kind - lets a page that serves both sections pick its own. */
  promptsFor(kind: PromptKind): WritableSignal<Prompt[]> {
    return kind === 'seo' ? this.seoPrompts : this.prompts;
  }

  loadPrompts(kind: PromptKind = 'communication'): void {
    this.loading.set(true);
    // Communication prompts keep the original, parameterless request.
    const request =
      kind === 'seo'
        ? this.http.get<Prompt[]>(PROMPTS_URL, { params: new HttpParams().set('kind', 'seo') })
        : this.http.get<Prompt[]>(PROMPTS_URL);

    request.pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (prompts) => this.promptsFor(kind).set(prompts),
    });
  }

  /** Creates a prompt; `input.kind` (omitted for communication, `'seo'` for SEO) decides which list it joins. */
  addPrompt(input: CreatePromptInput, callbacks?: PromptCallbacks): void {
    this.http.post<Prompt>(PROMPTS_URL, input).subscribe({
      next: (created) => {
        this.promptsFor(input.kind ?? 'communication').update((prompts) => [...prompts, created]);
        callbacks?.onSuccess?.(created);
      },
      error: () => callbacks?.onError?.(),
    });
  }

  // Ids are unique across kinds, so update/delete just apply to both lists.

  updatePrompt(id: string, input: CreatePromptInput, callbacks?: PromptCallbacks): void {
    this.http.patch<Prompt>(`${PROMPTS_URL}/${id}`, input).subscribe({
      next: (updated) => {
        const replace = (prompts: Prompt[]) => prompts.map((prompt) => (prompt.id === id ? updated : prompt));
        this.prompts.update(replace);
        this.seoPrompts.update(replace);
        callbacks?.onSuccess?.(updated);
      },
      error: () => callbacks?.onError?.(),
    });
  }

  deletePrompt(id: string, callbacks?: { onSuccess?: () => void; onError?: () => void }): void {
    this.http.delete(`${PROMPTS_URL}/${id}`).subscribe({
      next: () => {
        const remove = (prompts: Prompt[]) => prompts.filter((prompt) => prompt.id !== id);
        this.prompts.update(remove);
        this.seoPrompts.update(remove);
        callbacks?.onSuccess?.();
      },
      error: () => callbacks?.onError?.(),
    });
  }
}
