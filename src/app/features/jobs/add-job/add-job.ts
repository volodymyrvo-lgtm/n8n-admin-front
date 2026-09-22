import { Component, computed, effect, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BOARD_OPTIONS,
  CreateJobFormValue,
  JOB_TYPE_OPTIONS,
  MESSAGE_TYPE_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '../../../core/models/job.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { PromptsService } from '../../../core/services/prompts.service';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { JobsService } from '../../../core/services/jobs.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-add-job',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './add-job.html',
  styleUrl: './add-job.css',
})
export class AddJobComponent implements  OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly jobsService = inject(JobsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  protected readonly ruleSetsService = inject(RuleSetsService);
  protected readonly promptsService = inject(PromptsService);
  protected readonly glossariesService = inject(GlossariesService);

  protected readonly jobTypeOptions = JOB_TYPE_OPTIONS;
  protected readonly taskStatusOptions = TASK_STATUS_OPTIONS;
  protected readonly messageTypeOptions = MESSAGE_TYPE_OPTIONS;
  protected readonly boardOptions = BOARD_OPTIONS;

  protected readonly form = this.fb.nonNullable.group({
    jobType: [this.jobTypeOptions[0], Validators.required],
    taskStatus: [this.taskStatusOptions[0], Validators.required],
    messageType: [this.messageTypeOptions[0], Validators.required],
    board: [this.boardOptions[0], Validators.required],
    taskDescription: ['', Validators.required],
    mainRuleSetId: ['', Validators.required],
    toneOfVoiceRuleSetId: [''],
    humanizerRuleSetId: [''],
    promptId: ['', Validators.required],
    glossaryId: [''],
  });

  /** Kept in sync with the jobType control so `mainRuleSets` can react to it. */
  private readonly selectedJobType = toSignal(this.form.controls.jobType.valueChanges, {
    initialValue: this.form.controls.jobType.value,
  });

  /** Kept in sync with the taskStatus control so `isLocalization` can react to it. */
  private readonly selectedTaskStatus = toSignal(this.form.controls.taskStatus.valueChanges, {
    initialValue: this.form.controls.taskStatus.value,
  });

  /**
   * A "localization" job is a different kind of job from the form's
   * perspective: no main rule set (a glossary is picked instead) and a
   * differently-shaped n8n payload - see `syncLocalizationFields` below
   * and JobsService.buildN8nPayload.
   */
  protected readonly isLocalization = computed(() => this.selectedTaskStatus() === 'localization');

  /**
   * Rule sets tagged for the currently selected job type - only those make
   * sense as the "main" rule set (e.g. an email job shouldn't offer sms or
   * tone-of-voice rule sets here).
   */
  protected readonly mainRuleSets = computed(() =>
    this.ruleSetsService.ruleSets().filter((ruleSet) => ruleSet.setType?.includes(this.selectedJobType())),
  );

  /** Rule sets tagged for the "tone of voice" role - only those are offered for that field. */
  protected readonly toneOfVoiceRuleSets = computed(() =>
    this.ruleSetsService.ruleSets().filter((ruleSet) => ruleSet.setType?.includes('toneOfVoice')),
  );

  /** Rule sets tagged for the "humanizer" role - only those are offered for that field. */
  protected readonly humanizerRuleSets = computed(() =>
    this.ruleSetsService.ruleSets().filter((ruleSet) => ruleSet.setType?.includes('humanaizer')),
  );

  /**
   * Clears the picked main rule set whenever it falls out of `mainRuleSets`
   * (job type changed to one it isn't tagged for, or rule sets just loaded) -
   * otherwise the form could keep an id that's no longer shown in the select.
   */
  private readonly clearStaleMainRuleSet = effect(() => {
    const validIds = new Set(this.mainRuleSets().map((ruleSet) => ruleSet.id));
    const current = this.form.controls.mainRuleSetId.value;
    if (current && !validIds.has(current)) {
      this.form.controls.mainRuleSetId.setValue('');
    }
  });

  /**
   * Swaps which fields are required whenever `isLocalization` flips:
   * a localization job has no main rule set (cleared and no longer
   * required) but must have a glossary picked instead, and vice versa
   * for any other task status. Also clears whichever field just became
   * irrelevant so the form never submits a stale id for a field the UI
   * no longer shows (see add-job.html).
   */
  private readonly syncLocalizationFields = effect(() => {
    const localization = this.isLocalization();
    const mainRuleSetId = this.form.controls.mainRuleSetId;
    const glossaryId = this.form.controls.glossaryId;

    if (localization) {
      mainRuleSetId.clearValidators();
      mainRuleSetId.setValue('');
      glossaryId.setValidators(Validators.required);
    } else {
      mainRuleSetId.setValidators(Validators.required);
      glossaryId.clearValidators();
      glossaryId.setValue('');
    }
    mainRuleSetId.updateValueAndValidity({ emitEvent: false });
    glossaryId.updateValueAndValidity({ emitEvent: false });
  });

  ngOnInit() {
    this.ruleSetsService.loadRuleSets();
    this.promptsService.loadPrompts();
    this.glossariesService.loadGlossaries();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const value: CreateJobFormValue = {
      jobType: raw.jobType,
      taskStatus: raw.taskStatus,
      messageType: raw.messageType,
      board: raw.board,
      taskDescription: raw.taskDescription,
      mainRuleSetId: raw.mainRuleSetId || null,
      toneOfVoiceRuleSetId: raw.toneOfVoiceRuleSetId || null,
      humanizerRuleSetId: raw.humanizerRuleSetId || null,
      promptId: raw.promptId || null,
      glossaryId: raw.glossaryId || null,
    };

    this.jobsService.createJob(value, {
      onBackendSuccess: () => {
        this.toast.success(this.translate.instant('jobs.toast.created'));
        this.router.navigateByUrl('/jobs');
      },
      onBackendError: () => {
        this.toast.error(this.translate.instant('addJob.backendError'));
      },
      onN8nError: () => {
        this.toast.error(this.translate.instant('addJob.n8nError'));
      },
    });
  }
}
