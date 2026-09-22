/** Outcome of a single step within a job run. */
export type StepStatus = 'success' | 'failed' | 'pending';

export interface JobStep {
  status: StepStatus;
}

/** A job run's steps, keyed by step name (e.g. "step1", "step2", ...). */
export interface JobSteps {
  [step: string]: JobStep;
}

/** Overall outcome of a job run - success once every step succeeded, failed if any step failed, pending while still running. */
export type JobRunStatus = 'success' | 'failed' | 'pending';

/**
 * A single execution of a job, as returned by the backend - e.g. an
 * onboarding email run triggered against a set of rules. This is the
 * real run history shown on the jobs page.
 */
export interface JobRun {
  id: string;
  steps: JobSteps;
  jobType: string;
  taskStatus: string;
  messageType: string;
  board: string;
  taskDescription: string;
  status: JobRunStatus;
  runDate: string | null;
  createdAt: string;
  updatedAt: string;
  runnedById: string;
  ruleIds: string[];
}

/** The channel a job's message goes out through. */
export type JobTypeOption = 'email' | 'sms' | 'web_push' | 'notification_center' | 'in_app';
export const JOB_TYPE_OPTIONS: readonly JobTypeOption[] = ['email', 'sms', 'web_push', 'notification_center', 'in_app'];

export type TaskStatusOption = 'new' | 'update' | 'localization';
export const TASK_STATUS_OPTIONS: readonly TaskStatusOption[] = ['new', 'update', 'localization'];

/** Same set of channels as JobTypeOption - kept as a separate alias since the two fields are conceptually distinct on the backend. */
export type MessageTypeOption = JobTypeOption;
export const MESSAGE_TYPE_OPTIONS: readonly MessageTypeOption[] = JOB_TYPE_OPTIONS;

export type BoardOption = 'ONBOARDING' | 'Onboarding_2_not_ready' | 'CHURN_15';
export const BOARD_OPTIONS: readonly BoardOption[] = ['ONBOARDING', 'Onboarding_2_not_ready', 'CHURN_15'];

/**
 * The new-job form's raw values. `mainRuleSetId`/`toneOfVoiceRuleSetId`/
 * `humanizerRuleSetId` each pick an existing rule set by role (the latter
 * two filtered to rule sets tagged with the matching setType); `promptId`
 * picks an existing prompt (see PromptsService) that becomes the job's
 * system message; `glossaryId` picks an existing glossary (see
 * GlossariesService).
 *
 * A `localization` task status is a different kind of job from the
 * form's perspective: it has no main rule set (the UI hides that field
 * entirely and `mainRuleSetId` stays null) and picks a glossary instead
 * (`glossaryId`) - see AddJobComponent's `isLocalization` and
 * JobsService.buildN8nPayload, which builds an entirely different body
 * for the n8n webhook in that case.
 */
export interface CreateJobFormValue {
  jobType: JobTypeOption;
  taskStatus: TaskStatusOption;
  messageType: MessageTypeOption;
  board: BoardOption;
  taskDescription: string;
  mainRuleSetId: string | null;
  toneOfVoiceRuleSetId: string | null;
  humanizerRuleSetId: string | null;
  promptId: string | null;
  glossaryId: string | null;
}

/**
 * Body posted to our own backend to create the job run record. `sm`
 * ("system message") is the id of the prompt picked in the form
 * (`CreateJobFormValue.promptId`) - the backend validates it as a UUID,
 * same as it validates `ruleIds`.
 */
export interface CreateJobBackendPayload {
  steps: JobSteps;
  jobType: JobTypeOption;
  taskStatus: TaskStatusOption;
  messageType: MessageTypeOption;
  board: BoardOption;
  taskDescription: string;
  ruleIds: string[];
  sm: string;
}

/**
 * Body posted straight to the n8n webhook that actually runs a "new" or
 * "update" job. `jobId` is only known once the backend has created the
 * job run record, so this payload can only be built after that POST
 * resolves - see JobsService.createJob. `sm` ("system message") is the
 * id of the prompt picked in the form (`CreateJobFormValue.promptId`).
 *
 * A "localization" job posts a differently-shaped body instead - see
 * CreateJobN8nLocalizationPayload.
 */
export interface CreateJobN8nPayload {
  taskStatus: TaskStatusOption;
  messageType: MessageTypeOption;
  board: BoardOption;
  taskDescription: string;
  mainRuleSet: string;
  toneOfVoice: string;
  humanizer: string;
  sm: string;
  jobId: string;
}

/**
 * Body posted straight to the n8n webhook for a "localization" job -
 * unlike CreateJobN8nPayload, a localization job has no main rule set
 * picked in the UI, so `mainRuleSet` is always sent as `''` here, and
 * `glossaries` (the picked glossary's id, from
 * `CreateJobFormValue.glossaryId`) is carried alongside it. See
 * JobsService.buildN8nPayload.
 */
export interface CreateJobN8nLocalizationPayload {
  taskStatus: TaskStatusOption;
  messageType: MessageTypeOption;
  board: BoardOption;
  taskDescription: string;
  mainRuleSet: string;
  toneOfVoice: string;
  humanizer: string;
  glossaries: string;
  sm: string;
  jobId: string;
}
