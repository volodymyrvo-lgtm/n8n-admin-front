import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DESIGN_TASK_DESCRIPTION_MAX_LENGTH, CreateDesignJobFormValue } from '../../../core/models/job.model';
import { DesignJobsService } from '../../../core/services/design-jobs.service';
import { ToastService } from '../../../core/services/toast.service';

/** Required once trimmed ("   " is empty), and not longer than the limit. */
function trimmedText(maxLength: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (value.length === 0) {
      return { required: true };
    }
    return value.length > maxLength ? { maxlength: { requiredLength: maxLength, actualLength: value.length } } : null;
  };
}

/**
 * Form for a new design job: just the task description - the same
 * body goes to our backend (`POST /jobs/design`) and to the n8n webhook -
 * plus the "testing" toggle that sends the n8n trigger to the test webhook.
 */
@Component({
  selector: 'app-add-design-job',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './add-design-job.html',
  // Same look as the communication job form.
  styleUrl: '../../jobs/add-job/add-job.css',
})
export class AddDesignJobComponent {
  private readonly fb = inject(FormBuilder);
  private readonly designJobsService = inject(DesignJobsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  protected readonly taskDescriptionMaxLength = DESIGN_TASK_DESCRIPTION_MAX_LENGTH;

  protected readonly form = this.fb.nonNullable.group({
    taskDescription: ['', trimmedText(DESIGN_TASK_DESCRIPTION_MAX_LENGTH)],
    isTesting: [false],
  });

  /** True from submit until the backend answers - stops a double click from creating the job twice. */
  protected readonly submitting = signal(false);

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const value: CreateDesignJobFormValue = this.form.getRawValue();
    this.submitting.set(true);

    this.designJobsService.createJob(value, {
      onBackendSuccess: () => {
        this.toast.success(this.translate.instant('designAdd.toast.created'));
        this.router.navigateByUrl('/design/jobs');
      },
      // A failed POST already shows the server's message(s) through the error toast interceptor.
      onBackendError: () => this.submitting.set(false),
      onN8nError: () => this.toast.error(this.translate.instant('designAdd.n8nError')),
      onN8nNotConfigured: () => this.toast.error(this.translate.instant('designAdd.n8nNotConfigured')),
    });
  }
}
