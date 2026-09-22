import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { GLOSSARY_STATUSES, GlossaryEntryInput, targetLanguageFieldKey } from '../../../core/models/glossary.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { ToastService } from '../../../core/services/toast.service';

/**
 * Shared form for creating (`/glossary/:id/entries/new`) and editing
 * (`/glossary/:id/entries/:entryId/edit`) one term of glossary `:id`.
 * EN -> AZ and EN -> RU terms have the same shape (only the
 * do_not_use_* / recommended_* field name suffix differs), so this one
 * form covers both, driven by the parent glossary's `target_language`
 * (see `langKey` below and targetLanguageFieldKey() in glossary.model.ts).
 */
@Component({
  selector: 'app-glossary-entry-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './glossary-entry-form.html',
  styleUrl: './glossary-entry-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlossaryEntryFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly glossariesService = inject(GlossariesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly cd = inject(ChangeDetectorRef);

  protected readonly glossaryId = this.route.snapshot.paramMap.get('id')!;
  private readonly editingId = this.route.snapshot.paramMap.get('entryId');
  protected readonly isEditMode = !!this.editingId;
  protected readonly statuses = GLOSSARY_STATUSES;

  private readonly glossary = this.glossariesService.glossaries().find((item) => item.id === this.glossaryId);
  /** e.g. "azerbaijani" for the EN -> AZ glossary - drives the do_not_use_* / recommended_* field names below. */
  protected readonly langKey = this.glossary ? targetLanguageFieldKey(this.glossary.allGlossRules.target_language) : '';

  protected readonly form = this.fb.nonNullable.group({
    englishTerm: ['', Validators.required],
    status: this.fb.nonNullable.control(GLOSSARY_STATUSES[0], Validators.required),
    recommended: ['', Validators.required],
    doNotUse: [''],
    sourceForms: [''],
    usageNote: [''],
  });

  constructor() {
    if (!this.glossary) {
      // Not found locally (e.g. a direct navigation before the
      // glossaries list has loaded) - there is nothing to build the
      // language-specific form around, so go back to the list.
      this.router.navigateByUrl('/glossary');
      return;
    }

    if (!this.editingId) {
      return;
    }

    const existing = this.glossariesService.entries().find((entry) => entry.id === this.editingId);
    if (!existing) {
      // Not found locally (e.g. a direct navigation before the entries
      // list has loaded) - there is nothing to edit.
      this.router.navigateByUrl(`/glossary/${this.glossaryId}`);
      return;
    }

    const record = existing as unknown as Record<string, unknown>;
    this.form.patchValue({
      englishTerm: existing.english_term,
      status: existing.status,
      recommended: ((record[`recommended_${this.langKey}`] as string[] | undefined) ?? []).join('\n'),
      doNotUse: ((record[`do_not_use_${this.langKey}`] as string[] | undefined) ?? []).join('\n'),
      sourceForms: existing.source_forms_found.join('\n'),
      usageNote: existing.usage_note ?? '',
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const usageNote = raw.usageNote.trim();
    const input: GlossaryEntryInput = {
      english_term: raw.englishTerm.trim(),
      status: raw.status,
      usage_note: usageNote ? usageNote : null,
      source_forms_found: linesToArray(raw.sourceForms),
      [`recommended_${this.langKey}`]: linesToArray(raw.recommended),
      [`do_not_use_${this.langKey}`]: linesToArray(raw.doNotUse),
    };

    if (this.editingId) {
      this.glossariesService.updateEntry(this.glossaryId, this.editingId, input, {
        onSuccess: () => {
          this.toast.success(this.translate.instant('glossary.entry.toast.updated'));
          this.router.navigateByUrl(`/glossary/${this.glossaryId}`);
        },
        onError: () => {
          this.toast.error(this.translate.instant('toast.genericError'));
        },
      });
    } else {
      this.glossariesService.addEntry(this.glossaryId, input, {
        onSuccess: () => {
          this.toast.success(this.translate.instant('glossary.entry.toast.created'));
          this.router.navigateByUrl(`/glossary/${this.glossaryId}`);
        },
        onError: () => {
          this.toast.error(this.translate.instant('toast.genericError'));
        },
      });
    }

    this.cd.markForCheck();
  }
}

/** Turns a textarea's raw "one item per line" text into a trimmed, non-empty string array. */
function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
