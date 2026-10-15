import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  CreateSeoJobFormValue,
  LLM_OPTIONS,
  SEO_LANGUAGE_OPTIONS,
  SEO_PAGE_TASK_MAX_LENGTH,
} from '../../../core/models/job.model';
import { AuthService } from '../../../core/services/auth.service';
import { PromptsService } from '../../../core/services/prompts.service';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { SeoJobsService } from '../../../core/services/seo-jobs.service';
import { ToastService } from '../../../core/services/toast.service';

/** Required once trimmed (the backend trims too, so "   " is empty), and not longer than the backend's limit. */
function trimmedText(maxLength: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (value.length === 0) {
      return { required: true };
    }
    return value.length > maxLength ? { maxlength: { requiredLength: maxLength, actualLength: value.length } } : null;
  };
}

/** At least one of the two rules (tone of voice / humanizer) has to be picked - the backend rejects an empty `ruleIds`. */
function atLeastOneRule(group: AbstractControl): ValidationErrors | null {
  const { toneOfVoiceRuleSetId, humanizerRuleSetId } = group.value as { toneOfVoiceRuleSetId: string; humanizerRuleSetId: string };
  return toneOfVoiceRuleSetId || humanizerRuleSetId ? null : { noRule: true };
}

/**
 * Form for a new SEO job (`POST /jobs/seo`): language, model, the prompt to
 * use (picked from the SEO prompts), the page task and the SEO rules - a
 * tone of voice and/or a humanizer rule set (at least one), picked from the SEO
 * rule sets only. Same roles as the communication form, minus the main rule set. Validation mirrors
 * the backend's, so a 400 is the exception - when it does come, the error
 * toast shows the server's message(s).
 */
@Component({
  selector: 'app-add-seo-job',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './add-seo-job.html',
  // Same look as the communication job form.
  styleUrl: '../../jobs/add-job/add-job.css',
})
export class AddSeoJobComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly seoJobsService = inject(SeoJobsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  protected readonly promptsService = inject(PromptsService);
  protected readonly ruleSetsService = inject(RuleSetsService);
  protected readonly authService = inject(AuthService);

  protected readonly languageOptions = SEO_LANGUAGE_OPTIONS;
  protected readonly llmOptions = LLM_OPTIONS;
  protected readonly pageTaskMaxLength = SEO_PAGE_TASK_MAX_LENGTH;

  protected readonly form = this.fb.nonNullable.group(
    {
      language: [this.languageOptions[0] as string, Validators.required],
      llm: ['', Validators.required],
      promptId: ['', Validators.required],
      pageTask: ['', trimmedText(SEO_PAGE_TASK_MAX_LENGTH)],
      toneOfVoiceRuleSetId: [''],
      humanizerRuleSetId: [''],
      isTesting: [false],
    },
    { validators: atLeastOneRule },
  );

  /** SEO rule sets tagged for the "tone of voice" role (`GET /rules?kind=seo` - never the communication ones). */
  protected readonly toneOfVoiceRuleSets = computed(() =>
    this.ruleSetsService.seoRuleSets().filter((ruleSet) => ruleSet.setType?.includes('toneOfVoice')),
  );

  /** SEO rule sets tagged for the "humanizer" role. */
  protected readonly humanizerRuleSets = computed(() =>
    this.ruleSetsService.seoRuleSets().filter((ruleSet) => ruleSet.setType?.includes('humanaizer')),
  );

  /** True from submit until the backend answers - stops a double click from creating the job twice. */
  protected readonly submitting = signal(false);

  ngOnInit(): void {
    this.promptsService.loadPrompts('seo');
    this.ruleSetsService.loadRuleSets('seo');
  }

  /** Shown under the two rule selects once the user touched one of them (or tried to submit) with both empty. */
  protected showRulesError(): boolean {
    const { toneOfVoiceRuleSetId, humanizerRuleSetId } = this.form.controls;
    return this.form.hasError('noRule') && (toneOfVoiceRuleSetId.touched || humanizerRuleSetId.touched);
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const value: CreateSeoJobFormValue = this.form.getRawValue();
    this.submitting.set(true);

    this.seoJobsService.createJob(value, {
      onBackendSuccess: () => {
        this.toast.success(this.translate.instant('seoAdd.toast.created'));
        this.router.navigateByUrl('/seo/jobs');
      },
      // A failed POST already shows the server's message(s) through the error toast interceptor.
      onBackendError: () => this.submitting.set(false),
      onN8nError: () => this.toast.error(this.translate.instant('seoAdd.n8nError')),
      onN8nNotConfigured: () => this.toast.error(this.translate.instant('seoAdd.n8nNotConfigured')),
    });
  }
}
