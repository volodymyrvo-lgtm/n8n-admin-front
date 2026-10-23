import { DesignJobRun, JobRun, SeoJobRun } from './job.model';

/**
 * One row of `GET /job-errors`: a failure that n8n reported for a job.
 * `error` is whatever the workflow sent - usually `{ message, workflow,
 * failedNode, executionId }`, but its shape is free-form, so it's read
 * defensively (see parseJobError).
 */
export interface JobError {
  id: string;
  jobId: string;
  error: unknown;
  createdAt: string;
}

/** `GET /job-errors` is paginated like `GET /jobs`; `page` is 1-based. */
export interface PaginatedJobErrors {
  items: JobError[];
  total: number;
  page: number;
  limit: number;
}

/** The job a log belongs to (`GET /jobs/:id`) - either family; `kind` tells which. */
export type AnyJobRun = JobRun | SeoJobRun | DesignJobRun;

/** Where a job's details stand: being fetched, loaded, gone (deleted) or failed to load. */
export type JobLookup = { state: 'loading' } | { state: 'ready'; job: AnyJobRun } | { state: 'missing' } | { state: 'error' };

export interface JobErrorField {
  key: string;
  value: string;
}

/** A job error's payload, split into the well-known n8n fields and everything else. */
export interface ParsedJobError {
  message: string | null;
  workflow: string | null;
  failedNode: string | null;
  executionId: string | null;
  /** Every other key of the payload, as readable text (objects pretty-printed). */
  extra: JobErrorField[];
}

const KNOWN_KEYS = ['message', 'workflow', 'failedNode', 'executionId'] as const;

function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Reads the free-form `error` of a job error. A plain string is treated
 * as the message; an object has its `message` / `workflow` / `failedNode`
 * / `executionId` pulled out (numbers like an execution id become text)
 * and every other key kept in `extra`, so nothing the workflow sent is
 * lost; anything else (null, a number) becomes the message as text.
 */
export function parseJobError(error: unknown): ParsedJobError {
  const empty: ParsedJobError = { message: null, workflow: null, failedNode: null, executionId: null, extra: [] };

  if (error === null || error === undefined || error === '') {
    return empty;
  }
  if (typeof error !== 'object' || Array.isArray(error)) {
    return { ...empty, message: asText(error) };
  }

  const record = error as Record<string, unknown>;
  const known = (key: (typeof KNOWN_KEYS)[number]): string | null => {
    const text = asText(record[key]);
    return text === '' ? null : text;
  };

  return {
    message: known('message'),
    workflow: known('workflow'),
    failedNode: known('failedNode'),
    executionId: known('executionId'),
    extra: Object.entries(record)
      .filter(([key]) => !(KNOWN_KEYS as readonly string[]).includes(key))
      .map(([key, value]) => ({ key, value: asText(value) })),
  };
}
