import type { ParamMap, Params } from '@angular/router';
import type { GroupByField } from '../../core/models/llm-usage.model';
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
  /** Time chart as stacked bars, or the period's total as a doughnut of shares. */
  view: ChartViewMode;
  types: string[];
  flows: string[];
  models: string[];
}

export type ChartViewMode = 'bars' | 'donut';

export const CHART_VIEWS: readonly ChartViewMode[] = ['bars', 'donut'];
export const CHART_GRANULARITIES: readonly BucketGranularity[] = ['day', 'week', 'month', 'quarter'];
export const SPLIT_DIMENSIONS: readonly GroupByField[] = ['llmMod', 'type', 'flow'];

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
  };
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
  };
}
