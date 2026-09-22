import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CreateGlossaryInput, Glossary } from '../../../core/models/glossary.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  createRow,
  KeyValueEditorComponent,
  KeyValueRow,
} from '../../../shared/components/key-value-editor/key-value-editor';

/**
 * Shared form for creating (`/glossary/new`) and editing
 * (`/glossary/:id/edit`) a glossary's own fields - name, language
 * pair, purpose and the free-form `instructions` guidance. Its terms
 * are a separate nested resource, managed from
 * GlossaryEntryFormComponent instead - see glossary.model.ts.
 */
@Component({
  selector: 'app-glossary-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, KeyValueEditorComponent],
  templateUrl: './glossary-form.html',
  styleUrl: './glossary-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlossaryFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly glossariesService = inject(GlossariesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly cd = inject(ChangeDetectorRef);

  private readonly editingId = this.route.snapshot.paramMap.get('id');
  protected readonly isEditMode = !!this.editingId;

  protected readonly form = this.fb.nonNullable.group({
    glossaryName: ['', Validators.required],
    languagePair: ['', Validators.required],
    sourceLanguage: ['', Validators.required],
    targetLanguage: ['', Validators.required],
    schemaVersion: this.fb.nonNullable.control('1.0', Validators.required),
    setType: [''],
    purpose: [''],
  });
  protected readonly instructions = signal<KeyValueRow[]>([createRow()]);

  constructor() {
    if (!this.editingId) {
      return;
    }

    const existing = this.glossariesService.glossaries().find((glossary) => glossary.id === this.editingId);
    if (!existing) {
      // Not found locally (e.g. a direct navigation before the list has
      // loaded) - there is nothing to edit, so go back to the list.
      this.router.navigateByUrl('/glossary');
      return;
    }

    this.patchFrom(existing);
  }

  private patchFrom(existing: Glossary): void {
    this.form.patchValue({
      glossaryName: existing.glossaryName,
      languagePair: existing.allGlossRules.language_pair,
      sourceLanguage: existing.allGlossRules.source_language,
      targetLanguage: existing.allGlossRules.target_language,
      schemaVersion: existing.allGlossRules.schema_version,
      setType: existing.setType.join('\n'),
      purpose: existing.allGlossRules.purpose,
    });
    this.instructions.set(instructionsToRows(existing.allGlossRules.instructions));
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const input: CreateGlossaryInput = {
      glossaryName: raw.glossaryName.trim(),
      setType: linesToArray(raw.setType),
      allGlossRules: {
        purpose: raw.purpose.trim(),
        instructions: rowsToInstructions(this.instructions()),
        language_pair: raw.languagePair.trim(),
        schema_version: raw.schemaVersion.trim(),
        source_language: raw.sourceLanguage.trim(),
        target_language: raw.targetLanguage.trim(),
      },
    };

    if (this.editingId) {
      this.glossariesService.updateGlossary(this.editingId, input, {
        onSuccess: () => {
          this.toast.success(this.translate.instant('glossary.toast.updated'));
          this.router.navigateByUrl(`/glossary/${this.editingId}`);
        },
        onError: () => {
          this.toast.error(this.translate.instant('toast.genericError'));
        },
      });
    } else {
      this.glossariesService.addGlossary(input, {
        onSuccess: (created) => {
          this.toast.success(this.translate.instant('glossary.toast.created'));
          this.router.navigateByUrl(`/glossary/${created.id}`);
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

/**
 * Turns the key-value editor's rows into the flat `instructions`
 * record the backend expects - a stray group row (the editor allows
 * adding one, but a glossary's instructions are never nested) is
 * simply skipped rather than sent as malformed data.
 */
function rowsToInstructions(rows: KeyValueRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || row.isGroup) {
      continue;
    }
    result[key] = row.value;
  }
  return result;
}

/** The inverse of `rowsToInstructions` - rebuilds editable rows from a stored glossary's instructions map. */
function instructionsToRows(instructions: Record<string, string>): KeyValueRow[] {
  const rows = Object.entries(instructions ?? {}).map(([key, value]) => createRow({ key, value }));
  return rows.length > 0 ? rows : [createRow()];
}
