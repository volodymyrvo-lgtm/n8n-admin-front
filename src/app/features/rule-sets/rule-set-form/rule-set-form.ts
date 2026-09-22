import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RuleSetFields, SET_TYPES, SetType } from '../../../core/models/rule-set.model';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  createRow,
  KeyValueEditorComponent,
  KeyValueRow,
} from '../../../shared/components/key-value-editor/key-value-editor';

/**
 * Shared form for both creating a new rule set (`/rule-sets/new`) and
 * editing an existing one (`/rule-sets/:id/edit`) - the two only differ
 * in whether an existing rule set is loaded into the form up front and
 * in a couple of labels.
 */
@Component({
  selector: 'app-rule-set-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, KeyValueEditorComponent],
  templateUrl: './rule-set-form.html',
  styleUrl: './rule-set-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleSetFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ruleSetsService = inject(RuleSetsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly cd = inject(ChangeDetectorRef);

  private readonly editingId = this.route.snapshot.paramMap.get('id');
  private readonly duplicateFromId = this.editingId ? null : this.route.snapshot.queryParamMap.get('duplicateFrom');
  protected readonly isEditMode = !!this.editingId;
  protected readonly isDuplicateMode = !!this.duplicateFromId;
  protected readonly setTypes = SET_TYPES;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    setType: this.fb.nonNullable.group(
      {
        email: [false],
        sms: [false],
        push: [false],
        toneOfVoice: [false],
        humanaizer: [false],
        web_push: [false],
        in_app: [false],
        notification_center: [false],
      },
      { validators: atLeastOneSetTypeSelected },
    ),
  });
  protected readonly fields = signal<KeyValueRow[]>([createRow()]);

  constructor() {
    const sourceId = this.editingId ?? this.duplicateFromId;
    if (!sourceId) {
      return;
    }

    const existing = this.ruleSetsService.ruleSets().find((ruleSet) => ruleSet.id === sourceId);
    if (!existing) {
      if (this.editingId) {
        // Not found locally (e.g. a direct navigation before the list has
        // loaded) - there is nothing to edit, so go back to the list.
        this.router.navigateByUrl('/rule-sets');
      }
      // Duplicating from a rule set that isn't loaded locally yet (rare -
      // the copy action only appears once the list has loaded) just falls
      // back to a blank form instead of bouncing away.
      return;
    }

    this.form.controls.name.setValue(
      this.isDuplicateMode
        ? this.translate.instant('ruleSets.copyName', { name: existing.ruleName })
        : existing.ruleName,
    );
    this.fields.set(ruleSetToRows(existing.ruleSet));
    for (const type of existing.setType ?? []) {
      this.form.controls.setType.controls[type]?.setValue(true);
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, setType } = this.form.getRawValue();
    const input = {
      ruleName: name,
      ruleSet: rowsToRuleSet(this.fields()),
      setType: SET_TYPES.filter((type) => setType[type]),
    };

    if (this.editingId) {
      this.ruleSetsService.updateRuleSet(this.editingId, input);
      this.toast.success(this.translate.instant('ruleSets.toast.updated'));
    } else {
      this.ruleSetsService.addRuleSet(input);
      this.ruleSetsService.loadRuleSets();
      this.toast.success(this.translate.instant('ruleSets.toast.created'));
    }

    this.router.navigateByUrl('/rule-sets');
    this.cd.markForCheck();
  }
}

/** Requires at least one of the setType checkboxes to be checked. */
function atLeastOneSetTypeSelected(control: AbstractControl): ValidationErrors | null {
  const value = control.value as Record<SetType, boolean>;
  return Object.values(value).some(Boolean) ? null : { required: true };
}

/**
 * Turns the editor's UI rows into the plain, recursive object shape the
 * backend expects (e.g. `{ "Segment": "...", "Bonus Block": { ... } }`)
 * - dropping rows with no key (e.g. an untouched starter row) and
 * stripping UI-only bits (id, isGroup).
 */
function rowsToRuleSet(rows: KeyValueRow[]): RuleSetFields {
  const result: RuleSetFields = {};

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    result[key] = row.isGroup ? rowsToRuleSet(row.children) : row.value;
  }

  return result;
}

/**
 * The inverse of `rowsToRuleSet` - rebuilds editable UI rows from a
 * stored rule set's plain object fields, so an existing rule set can be
 * loaded back into the editor for editing. A string value becomes a
 * regular row; a nested object becomes a group row with its own rows.
 */
function ruleSetToRows(ruleSet: RuleSetFields): KeyValueRow[] {
  const rows = Object.entries(ruleSet ?? {}).map(([key, value]) =>
    typeof value === 'string'
      ? createRow({ key, value })
      : createRow({ key, isGroup: true, children: ruleSetToRows(value) }),
  );

  return rows.length > 0 ? rows : [createRow()];
}
