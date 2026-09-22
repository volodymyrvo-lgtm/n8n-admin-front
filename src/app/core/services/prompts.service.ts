import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { environment } from '@env';
import { CreatePromptInput, Prompt } from '../models/prompt.model';

const PROMPTS_URL = `${environment.apiBaseUrl}/prompts`;

export interface PromptCallbacks {
  onSuccess?: (prompt: Prompt) => void;
  onError?: () => void;
}

/**
 * Prompt store backed by the real backend - list/create/update/delete all
 * go through HTTP now (see the /prompts routes on the NestJS side), the
 * same shape as JobsService/RuleSetsService/UsersService.
 */
@Injectable({ providedIn: 'root' })
export class PromptsService {
  private readonly http = inject(HttpClient);
  readonly prompts = signal<Prompt[]>([]);
  readonly loading = signal<boolean>(false);

  loadPrompts(): void {
    this.loading.set(true);
    this.http
      .get<Prompt[]>(PROMPTS_URL)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (prompts) => this.prompts.set(prompts),
      });
  }

  addPrompt(input: CreatePromptInput, callbacks?: PromptCallbacks): void {
    this.http.post<Prompt>(PROMPTS_URL, input).subscribe({
      next: (created) => {
        this.prompts.update((prompts) => [...prompts, created]);
        callbacks?.onSuccess?.(created);
      },
      error: () => callbacks?.onError?.(),
    });
  }

  updatePrompt(id: string, input: CreatePromptInput, callbacks?: PromptCallbacks): void {
    this.http.patch<Prompt>(`${PROMPTS_URL}/${id}`, input).subscribe({
      next: (updated) => {
        this.prompts.update((prompts) => prompts.map((prompt) => (prompt.id === id ? updated : prompt)));
        callbacks?.onSuccess?.(updated);
      },
      error: () => callbacks?.onError?.(),
    });
  }

  deletePrompt(id: string, callbacks?: { onSuccess?: () => void; onError?: () => void }): void {
    this.http.delete(`${PROMPTS_URL}/${id}`).subscribe({
      next: () => {
        this.prompts.update((prompts) => prompts.filter((prompt) => prompt.id !== id));
        callbacks?.onSuccess?.();
      },
      error: () => callbacks?.onError?.(),
    });
  }
}
