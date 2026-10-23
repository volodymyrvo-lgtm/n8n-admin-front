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
 *
 * `sm` is the id of the prompt used as the job's system message (see
 * PromptsService), `glossaryId` is the glossary used for a localization
 * run (null otherwise), `llm` is the model that ran the job, `spend` is
 * the cost incurred per LLM key (usually just the one model in `llm`,
 * but kept as a map since a job can in principle involve more than
 * one), and `tableUrl` links out to the run's underlying data table.
 */
export interface JobRun {
  id: string;
  /** Which family the job belongs to - this is the communication (CRM mailings) one; SEO jobs are `SeoJobRun`. */
  kind: 'communication';
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
  sm: string;
  glossaryId: string | null;
  llm: string;
  spend: Record<string, number>;
  tableUrl: string;
  runnedById: string;
  ruleIds: string[];
}

/**
 * GET /jobs is paginated on the backend (job runs grow without bound,
 * unlike rule sets/prompts which stay small enough to load in full and
 * page through on the frontend - see JobsService.loadJobRuns). `page` is
 * 1-based; `total` is the number of job runs matching the current
 * filters, across every page, and is what JobListComponent divides by
 * `limit` to know how many pages to show.
 */
export interface PaginatedJobRuns {
  items: JobRun[];
  total: number;
  page: number;
  limit: number;
}

/** The channel a job's message goes out through. */
export type JobTypeOption = 'email' | 'sms' | 'web_push' | 'notification_center' | 'in_app';
export const JOB_TYPE_OPTIONS: readonly JobTypeOption[] = ['email', 'sms', 'web_push', 'notification_center', 'in_app'];

export type TaskStatusOption = 'new' | 'update' | 'localization';
export const TASK_STATUS_OPTIONS: readonly TaskStatusOption[] = ['new', 'update', 'localization'];

/** Same set of channels as JobTypeOption - kept as a separate alias since the two fields are conceptually distinct on the backend. */
export type MessageTypeOption = JobTypeOption;
export const MESSAGE_TYPE_OPTIONS: readonly MessageTypeOption[] = JOB_TYPE_OPTIONS;

export type BoardOption = 'ONBOARDING' | 'onboarding_comms' | 'CHURN_15';
export const BOARD_OPTIONS: readonly BoardOption[] = ['ONBOARDING', 'onboarding_comms', 'CHURN_15'];

/** The LLM that runs the job - required on every task status, sent to both our backend and n8n as `llm`. */
export type LlmOption = 'claude_sonnet_5' | 'gpt_5_6_sol' | 'gpt_6_astra' | 'gpt_6_sol';
export const LLM_OPTIONS: readonly LlmOption[] = ['claude_sonnet_5', 'gpt_5_6_sol', 'gpt_6_astra', 'gpt_6_sol'];

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
 *
 * `llm` picks which model runs the job (see LlmOption) - unlike
 * `mainRuleSetId`/`glossaryId`, it's shown and required for every task
 * status, "new"/"update" and "localization" alike.
 *
 * `isTesting` doesn't change either payload's shape - it only decides
 * which n8n webhook JobsService.createJob posts to (the real one, or
 * environment.testN8nWebhookUrl), so a job can be trial-run against
 * the test workflow without touching production.
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
  llm: string | null;
  isTesting: boolean;
}

/**
 * Body posted to our own backend to create the job run record. `sm`
 * ("system message") is the id of the prompt picked in the form
 * (`CreateJobFormValue.promptId`) - the backend validates it as a UUID,
 * same as it validates `ruleIds`. `llm` is the model picked in the form
 * (`CreateJobFormValue.llm`, one of LlmOption) - required, same as `sm`.
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
  llm: string;
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
  llm: string;
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
  llm: string;
  jobId: string;
}

// ---------------------------------------------------------------------------
// SEO jobs (generation of SEO pages) - same `/jobs` resource on the backend,
// told apart from the communication ones by `kind`. See SeoJobsService.
// ---------------------------------------------------------------------------

/**
 * A run of an SEO job, as returned by `GET /jobs?kind=seo`. It shares the
 * run bookkeeping (steps, status, dates, spend, table link) with
 * `JobRun`, but carries its own fields (`language`, `prompt`,
 * `pageTask`) while the communication-only ones (`jobType`, `board`,
 * ...) are always `null`. `llm` holds the model, as on every job.
 *
 * `prompt` is a plain string on the backend: `"<LANGUAGE> <promptId>"`,
 * built by `buildSeoPrompt` from the form's language + chosen prompt.
 */
export interface SeoJobRun {
  id: string;
  kind: 'seo';
  steps: JobSteps;
  status: JobRunStatus;
  runDate: string | null;
  createdAt: string;
  updatedAt: string;
  runnedById: string | null;
  llm: string | null;
  spend: Record<string, number>;
  tableUrl: string | null;
  language: string;
  prompt: string;
  pageTask: string;
  jobType: null;
  taskStatus: null;
  messageType: null;
  board: null;
  taskDescription: null;
  ruleIds: string[];
  sm: string | null;
  glossaryId: string | null;
}

/** Same paginated envelope as `PaginatedJobRuns`, for `GET /jobs?kind=seo`. */
export interface PaginatedSeoJobRuns {
  items: SeoJobRun[];
  total: number;
  page: number;
  limit: number;
}

/** Languages an SEO page can be generated in; the value is sent as-is (`language`). */
export type SeoLanguageOption = 'EN' | 'AZ' | 'RU';
export const SEO_LANGUAGE_OPTIONS: readonly SeoLanguageOption[] = ['EN', 'AZ', 'RU'];

/** The SEO form's limits - mirror the backend's validation of `POST /jobs/seo`. */
export const SEO_PAGE_TASK_MAX_LENGTH = 500;
export const SEO_LLM_MAX_LENGTH = 200;
export const SEO_PROMPT_MAX_LENGTH = 1000;

/** The new-SEO-job form's values. `promptId` is the chosen prompt's id (see PromptsService, kind `seo`). `isTesting` only picks which n8n webhook is triggered, like on the communication form. */
export interface CreateSeoJobFormValue {
  language: string;
  llm: string;
  promptId: string;
  pageTask: string;
  /** Ids of the picked SEO rule sets by role (kind `seo`, tagged `toneOfVoice` / `humanaizer`); `''` when a role wasn't picked, but at least one is required. There is no "main" rule set for SEO. */
  toneOfVoiceRuleSetId: string;
  humanizerRuleSetId: string;
  isTesting: boolean;
}

/**
 * Body of `POST /jobs/seo`. Nothing else may be sent (the backend rejects
 * unknown fields with a 400): `kind`, the run date and the runner are set
 * by the server.
 */
export interface CreateSeoJobBackendPayload {
  steps: JobSteps;
  language: string;
  llm: string;
  prompt: string;
  pageTask: string;
  /** Unique ids of existing SEO rules (the backend rejects other kinds' rules and unknown ids), at least one. */
  ruleIds: string[];
}

/**
 * Body posted to the SEO n8n webhook once the backend has created the record (`jobId`).
 * Like the communication payload it carries the rule sets by role
 * (`toneOfVoice` / `humanizer`, the rule's id or `''` when not picked) -
 * not a `ruleIds` array, which is only for our backend.
 */
export interface CreateSeoJobN8nPayload {
  jobId: string;
  language: string;
  llm: string;
  prompt: string;
  pageTask: string;
  toneOfVoice: string;
  humanizer: string;
}

/** The `prompt` string the backend stores for an SEO job: the language, a space, then the prompt's id. */
export function buildSeoPrompt(language: string, promptId: string): string {
  return `${language} ${promptId}`;
}

/** Splits a stored `prompt` back into its language and prompt id; `null` if it isn't in the `"<LANGUAGE> <id>"` form. */
export function parseSeoPrompt(prompt: string): { language: string; promptId: string } | null {
  const match = /^(\S+)\s+(\S+)$/.exec(prompt.trim());
  return match ? { language: match[1], promptId: match[2] } : null;
}

// ---------------------------------------------------------------------------
// Design jobs - the same `/jobs` resource again, `kind: 'design'`.
// See DesignJobsService. A design job is just a task description.
// ---------------------------------------------------------------------------

/**
 * A run of a design job, as returned by `GET /jobs?kind=design`.
 * It carries the common run bookkeeping (steps, status, dates, spend, table
 * link) and the one field the job is made of - `taskDescription`.
 */
export interface DesignJobRun {
  id: string;
  kind: 'design';
  steps: JobSteps;
  status: JobRunStatus;
  runDate: string | null;
  createdAt: string;
  updatedAt: string;
  runnedById: string | null;
  llm: string | null;
  spend: Record<string, number>;
  tableUrl: string | null;
  taskDescription: string;
}

/** Same paginated envelope as `PaginatedJobRuns`, for `GET /jobs?kind=design`. */
export interface PaginatedDesignJobRuns {
  items: DesignJobRun[];
  total: number;
  page: number;
  limit: number;
}

/** The design form's limit on the task description. */
export const DESIGN_TASK_DESCRIPTION_MAX_LENGTH = 2000;

/** The new-design-job form's values: the task description, plus `isTesting` that only picks which n8n webhook is triggered. */
export interface CreateDesignJobFormValue {
  taskDescription: string;
  isTesting: boolean;
}

/**
 * The one body of a design job - posted to our backend (`POST /jobs/design`)
 * and to the n8n webhook alike. The webhook additionally gets the `jobId`
 * the backend assigned (see `CreateDesignJobN8nPayload`).
 */
export interface CreateDesignJobPayload {
  taskDescription: string;
}

/** What the n8n webhook receives: the same body as the backend plus the created job's id. */
export interface CreateDesignJobN8nPayload extends CreateDesignJobPayload {
  jobId: string;
}
