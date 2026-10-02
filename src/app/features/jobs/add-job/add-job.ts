import { Component, computed, effect, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BOARD_OPTIONS,
  CreateJobFormValue,
  JOB_TYPE_OPTIONS,
  LLM_OPTIONS,
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
  protected readonly llmOptions = LLM_OPTIONS;

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
    llm: ['', Validators.required],
    isTesting: [false],
  });

  /** Kept in sync with the jobType control so `mainRuleSets` can react to it. */
  private readonly selectedJobType = toSignal(this.form.controls.jobType.valueChanges, {
    initialValue: this.form.controls.jobType.value,
  });

  /** Kept in sync with the taskStatus control so `isLocalization`/`isUpdate` can react to it. */
  private readonly selectedTaskStatus = toSignal(this.form.controls.taskStatus.valueChanges, {
    initialValue: this.form.controls.taskStatus.value,
  });

  /**
   * A "localization" job is a different kind of job from the form's
   * perspective: no main rule set (a glossary is picked instead) and a
   * differently-shaped n8n payload - see `syncTaskStatusFields` below
   * and JobsService.buildN8nPayload.
   */
  protected readonly isLocalization = computed(() => this.selectedTaskStatus() === 'localization');

  /**
   * An "update" job only carries task metadata (jobType/taskStatus/
   * messageType/board/taskDescription) - it has no system message, LLM,
   * main rule set, tone of voice, or humanizer, so those fields are
   * hidden in the form (see add-job.html) and cleared by
   * `syncTaskStatusFields` below, the same way the main rule set is
   * swapped out for "localization". JobsService.buildN8nPayload /
   * buildBackendPayload don't need their own "update" branch for this -
   * they already send '' for whichever of these fields the form leaves
   * empty.
   */
  protected readonly isUpdate = computed(() => this.selectedTaskStatus() === 'update');

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
   * Swaps which fields are required/shown whenever the task status
   * changes:
   * - "localization": no main rule set (cleared, not required) - a
   *   glossary is required in its place.
   * - "update": no system message, LLM, main rule set, tone of voice,
   *   or humanizer - all five are cleared and not required, since an
   *   update job doesn't touch any of them (see add-job.html).
   * - anything else ("new"): every field above behaves normally.
   *
   * Also clears whichever field just became irrelevant so the form
   * never submits a stale id/value for a field the UI no longer shows.
   */
  private readonly syncTaskStatusFields = effect(() => {
    const localization = this.isLocalization();
    const update = this.isUpdate();

    const mainRuleSetId = this.form.controls.mainRuleSetId;
    const glossaryId = this.form.controls.glossaryId;
    const promptId = this.form.controls.promptId;
    const llm = this.form.controls.llm;
    const toneOfVoiceRuleSetId = this.form.controls.toneOfVoiceRuleSetId;
    const humanizerRuleSetId = this.form.controls.humanizerRuleSetId;

    if (localization) {
      mainRuleSetId.clearValidators();
      mainRuleSetId.setValue('');
      glossaryId.setValidators(Validators.required);
    } else {
      glossaryId.clearValidators();
      glossaryId.setValue('');
      if (update) {
        mainRuleSetId.clearValidators();
        mainRuleSetId.setValue('');
      } else {
        mainRuleSetId.setValidators(Validators.required);
      }
    }

    if (update) {
      promptId.clearValidators();
      promptId.setValue('');
      llm.clearValidators();
      llm.setValue('');
      toneOfVoiceRuleSetId.setValue('');
      humanizerRuleSetId.setValue('');
    } else {
      promptId.setValidators(Validators.required);
      llm.setValidators(Validators.required);
    }

    mainRuleSetId.updateValueAndValidity({ emitEvent: false });
    glossaryId.updateValueAndValidity({ emitEvent: false });
    promptId.updateValueAndValidity({ emitEvent: false });
    llm.updateValueAndValidity({ emitEvent: false });
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
      llm: raw.llm || null,
      isTesting: raw.isTesting,
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
