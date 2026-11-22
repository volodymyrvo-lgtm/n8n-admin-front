import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PROMPT_BASE_PATHS, PromptKind, promptKindOf } from '../../../core/models/prompt.model';
import { PromptsService } from '../../../core/services/prompts.service';
import { ToastService } from '../../../core/services/toast.service';

/**
 * Shared form for both creating a new prompt (`/prompts/new`) and
 * editing an existing one (`/prompts/:id/edit`) - same split as
 * RuleSetFormComponent. Just name + raw message for now; more fields
 * will show up here once the shape of a prompt is decided.
 *
 * Shared by the Content, SEO and Blog AI sections: the route's
 * `data.kind` says which kind of prompt this edits (and so which list
 * "edit" looks the prompt up in, what a new prompt is created as, and
 * where to go back to).
 */
@Component({
  selector: 'app-prompt-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './prompt-form.html',
  styleUrl: './prompt-form.css',
})
export class PromptFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly promptsService = inject(PromptsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  private readonly kind: PromptKind = promptKindOf(this.route.snapshot.data?.['kind']);
  /** The list page this form belongs to - where Cancel and a successful save go. */
  protected readonly basePath = PROMPT_BASE_PATHS[this.kind];

  private readonly editingId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditMode = !!this.editingId;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    message: ['', Validators.required],
  });

  constructor() {
    if (!this.editingId) {
      return;
    }

    const existing = this.promptsService.promptsFor(this.kind)().find((prompt) => prompt.id === this.editingId);
    if (!existing) {
      // Not found locally (e.g. a direct navigation before the list has
      // loaded) - there is nothing to edit, so go back to the list.
      this.router.navigateByUrl(this.basePath);
      return;
    }

    this.form.setValue({ name: existing.name, message: existing.message });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, message } = this.form.getRawValue();
    const input = { name, message };

    if (this.editingId) {
      // A Blog AI prompt says its kind on edit as well (`PATCH /prompts/:id` with `{ kind: 'blog_ai' }`);
      // the other kinds are patched exactly as before.
      this.promptsService.updatePrompt(this.editingId, this.kind === 'blog_ai' ? { ...input, kind: 'blog_ai' } : input, {
        onSuccess: () => {
          this.toast.success(this.translate.instant('prompts.toast.updated'));
          this.router.navigateByUrl(this.basePath);
        },
        onError: () => {
          this.toast.error(this.translate.instant('toast.genericError'));
        },
      });
    } else {
      // Only an SEO / Blog AI prompt says its kind; a communication one is created exactly as before (the backend defaults it).
      this.promptsService.addPrompt(this.kind === 'communication' ? input : { ...input, kind: this.kind }, {
        onSuccess: () => {
          this.toast.success(this.translate.instant('prompts.toast.created'));
          this.router.navigateByUrl(this.basePath);
        },
        onError: () => {
          this.toast.error(this.translate.instant('toast.genericError'));
        },
      });
    }
  }

  /**
   * Mirrors "prompt tags" while typing. These aren't real HTML/XML - a
   * prompt can wrap any bit of text in `<label>...</label>` as scaffolding
   * for the flow that consumes it - so as soon as an opening tag like
   * `<system>` (or `<some label>`, spaces and all) is completed, the
   * matching closing tag is inserted on the next line automatically, with
   * the caret left right after the opening tag so typing continues inside
   * it. This only fires for opening tags: typing a closing tag (`</...>`)
   * or a self-closing one (`<.../>`) does nothing, and it won't duplicate
   * a closing tag that is already right there.
   */
  protected onMessageInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    const cursor = textarea.selectionStart;
    const value = textarea.value;
    if (cursor === null || value[cursor - 1] !== '>') {
      return;
    }

    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/<([^<>/][^<>]*)>$/);
    if (!match) {
      return;
    }

    const tagContent = match[1];
    if (tagContent.trimEnd().endsWith('/')) {
      return; // self-closing, e.g. <br/> - nothing to close
    }

    const closingTag = `</${tagContent}>`;
    const afterCursor = value.slice(cursor);
    if (afterCursor.startsWith(`\n${closingTag}`) || afterCursor.startsWith(closingTag)) {
      return; // the matching closing tag is already right there
    }

    const newValue = `${beforeCursor}\n${closingTag}${afterCursor}`;
    textarea.value = newValue;
    textarea.setSelectionRange(cursor, cursor);
    this.form.controls.message.setValue(newValue);

    // The form control's writeValue re-applies the raw string to the
    // textarea on the next change detection pass, which can otherwise
    // reset the caret to the end - put it back where the user was typing.
    queueMicrotask(() => textarea.setSelectionRange(cursor, cursor));
  }
}
