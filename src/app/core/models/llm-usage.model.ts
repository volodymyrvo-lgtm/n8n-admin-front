/**
 * Contract of the backend's /llm-usage endpoints (the LLM spend
 * dashboard) - see the frontend spec the backend team handed over.
 *
 * Dates are always plain `YYYY-MM-DD` strings (no time, no timezone) and
 * every numeric field arrives as a number, tokens included.
 */

/** Time step of GET /llm-usage/summary; `total` collapses the whole range into one row (`period: null`). */
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'total';

/** Extra dimensions a summary row can be broken down by. */
export type GroupByField = 'type' | 'flow' | 'llmMod';

/**
 * Filters shared by GET /llm-usage and GET /llm-usage/summary. `date`
 * (a single day) can't be combined with `from`/`to` - the dashboard
 * always sends `from`/`to` (a single day is `from === to`), so it never
 * needs `date`.
 */
export interface LlmUsageFilters {
  date?: string;
  from?: string;
  to?: string;
  type?: string[];
  flow?: string[];
  llmMod?: string[];
}

export interface LlmUsageSummaryRow {
  /** Start of the period (day itself / Monday / 1st of month / first day of quarter); null for `granularity=total`. */
  period: string | null;
  type?: string;
  flow?: string;
  llmMod?: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface LlmUsageRow {
  id: string;
  date: string;
  flow: string;
  type: string;
  llmMod: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface PaginatedLlmUsage {
  items: LlmUsageRow[];
  total: number;
  page: number;
  limit: number;
}

/** Dictionary for the filter controls and the date pickers; `maxDate` is "yesterday" (the last loaded day). */
export interface LlmUsageFiltersResponse {
  flows: string[];
  types: string[];
  llmMods: string[];
  minDate: string | null;
  maxDate: string | null;
}

export type LlmUsageSortBy = 'date' | 'cost' | 'requests' | 'inputTokens' | 'outputTokens';

export interface LlmUsageSummaryQuery extends LlmUsageFilters {
  granularity?: Granularity;
  groupBy?: GroupByField[];
}

export interface LlmUsageListQuery extends LlmUsageFilters {
  page?: number;
  limit?: number;
  sortBy?: LlmUsageSortBy;
  order?: 'asc' | 'desc';
}
