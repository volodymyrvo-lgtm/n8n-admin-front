import type { ParamMap, Params } from '@angular/router';
import type { GroupByField, LlmUsageSortBy } from '../../core/models/llm-usage.model';
import { addDays, BucketGranularity, isValidIsoDate } from './date-utils';

/**
 * Everything the dashboard's filter panel controls. It lives in the URL's
 * query string (so a link can be shared) and is the single source of
 * truth for the page: controls write to the URL, the page reads the
 * state back out of it.
 */
export interface UsageState {
  from: string;
  to: string;
  granularity: BucketGranularity;
  /** Which dimension the time chart is stacked by (or the doughnut is sliced by). */
  splitBy: GroupByField;
  /** Time chart as stacked bars, the period's total as a doughnut of shares, or - while comparing - this period's bars next to the other one's. */
  view: ChartViewMode;
  types: string[];
  flows: string[];
  models: string[];
  /** Compare the totals with another period (the previous one of the same length, unless `compareFrom/To` pick a different one). */
  compare: boolean;
  /** A hand-picked period to compare with; both null = the automatic previous period. */
  compareFrom: string | null;
  compareTo: string | null;
  /** Detailed table: current page (1-based), server-side sort column and direction. */
  page: number;
  sortBy: LlmUsageSortBy;
  order: SortOrder;
}

export type SortOrder = 'asc' | 'desc';

export type ChartViewMode = 'bars' | 'donut' | 'compare';

export const CHART_VIEWS: readonly ChartViewMode[] = ['bars', 'donut', 'compare'];
export const CHART_GRANULARITIES: readonly BucketGranularity[] = ['day', 'week', 'month', 'quarter'];
export const SPLIT_DIMENSIONS: readonly GroupByField[] = ['llmMod', 'type', 'flow'];

export const TABLE_SORT_COLUMNS: readonly LlmUsageSortBy[] = ['date', 'cost', 'requests', 'inputTokens', 'outputTokens'];
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];

const DEFAULT_SORT: LlmUsageSortBy = 'date';
const DEFAULT_ORDER: SortOrder = 'desc';
const DEFAULT_GRANULARITY: BucketGranularity = 'day';
const DEFAULT_SPLIT: GroupByField = 'llmMod';
const DEFAULT_VIEW: ChartViewMode = 'bars';
/** Default window: the last 30 days, ending on the last day the backend has data for. */
const DEFAULT_RANGE_DAYS = 30;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Reads the dashboard state out of the URL's query params, falling back
 * to defaults for anything missing or malformed (a hand-edited or stale
 * link must never break the page). `maxDate` anchors the default range.
 */
export function resolveUsageState(params: ParamMap, maxDate: string): UsageState {
  const rawFrom = params.get('from');
  const rawTo = params.get('to');

  let from = isValidIsoDate(rawFrom) ? rawFrom : addDays(maxDate, -(DEFAULT_RANGE_DAYS - 1));
  let to = isValidIsoDate(rawTo) ? rawTo : maxDate;
  if (from > to) {
    [from, to] = [to, from];
  }

  return {
    from,
    to,
    granularity: oneOf(params.get('step'), CHART_GRANULARITIES, DEFAULT_GRANULARITY),
    splitBy: oneOf(params.get('by'), SPLIT_DIMENSIONS, DEFAULT_SPLIT),
    view: oneOf(params.get('view'), CHART_VIEWS, DEFAULT_VIEW),
    types: params.getAll('type'),
    flows: params.getAll('flow'),
    models: params.getAll('model'),
    // On by default; `cmp=0` switches it off.
    compare: params.get('cmp') !== '0',
    ...resolveCompareRange(params.get('cfrom'), params.get('cto')),
    page: resolvePage(params.get('page')),
    sortBy: oneOf(params.get('sort'), TABLE_SORT_COLUMNS, DEFAULT_SORT),
    order: oneOf(params.get('order'), SORT_ORDERS, DEFAULT_ORDER),
  };
}

/** A hand-picked comparison period needs both ends to be valid dates; anything else falls back to the automatic previous period. */
function resolveCompareRange(rawFrom: string | null, rawTo: string | null): { compareFrom: string | null; compareTo: string | null } {
  if (!isValidIsoDate(rawFrom) || !isValidIsoDate(rawTo)) {
    return { compareFrom: null, compareTo: null };
  }
  return rawFrom <= rawTo ? { compareFrom: rawFrom, compareTo: rawTo } : { compareFrom: rawTo, compareTo: rawFrom };
}

function resolvePage(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** The inverse of `resolveUsageState`: the query params to write to the URL (empty filter lists are omitted). */
export function usageStateToQueryParams(state: UsageState): Params {
  return {
    from: state.from,
    to: state.to,
    step: state.granularity,
    by: state.splitBy,
    // The default view is left out of the URL to keep shared links short.
    view: state.view === DEFAULT_VIEW ? null : state.view,
    type: state.types.length > 0 ? state.types : null,
    flow: state.flows.length > 0 ? state.flows : null,
    model: state.models.length > 0 ? state.models : null,
    cmp: state.compare ? null : '0',
    // Kept while comparing is switched off, so switching it back on restores the chosen period.
    cfrom: state.compareFrom,
    cto: state.compareTo,
    page: state.page > 1 ? state.page : null,
    sort: state.sortBy === DEFAULT_SORT ? null : state.sortBy,
    order: state.order === DEFAULT_ORDER ? null : state.order,
  };
}
