import type { Granularity } from '../../core/models/llm-usage.model';

/**
 * Date math for the dashboard, on plain `YYYY-MM-DD` strings.
 *
 * The backend deals in calendar days without time or timezone, so this
 * works the same way: every helper takes and returns such strings and
 * does its arithmetic in UTC (which has no DST, so "+1 day" is always
 * exactly 24h). Deliberately avoids `new Date('2026-10-05')` / local-time
 * `toISOString()` round-trips - in a timezone ahead of UTC,
 * `new Date(2026, 9, 5).toISOString().slice(0, 10)` yields `2026-10-04`.
 *
 * ISO date strings sort lexicographically, so plain `<` / `>` on them is
 * a correct chronological comparison.
 */

export type BucketGranularity = Exclude<Granularity, 'total'>;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Upper bound on buckets `bucketStarts` will ever generate - a guard against a runaway range, not a real limit. */
const MAX_BUCKETS = 2000;

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function toUtcMs(iso: string): number {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) {
    throw new Error(`Invalid ISO date: "${iso}"`);
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMs(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/** True only for a real calendar day in `YYYY-MM-DD` form (rejects `2026-02-30`, `2026-1-5`, ...). */
export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE_RE.test(value)) {
    return false;
  }
  return fromUtcMs(toUtcMs(value)) === value;
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

/** Start of the bucket containing `iso`: the day itself, that week's Monday, the 1st of the month, or the first day of the quarter. */
export function startOfBucket(iso: string, granularity: BucketGranularity): string {
  const ms = toUtcMs(iso);
  const date = new Date(ms);
  switch (granularity) {
    case 'day':
      return iso;
    case 'week': {
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      return fromUtcMs(ms - daysSinceMonday * DAY_MS);
    }
    case 'month':
      return fromUtcMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    case 'quarter':
      return fromUtcMs(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
  }
}

/** Start of the bucket right after the one that starts at `start`. */
export function nextBucketStart(start: string, granularity: BucketGranularity): string {
  const ms = toUtcMs(start);
  const date = new Date(ms);
  switch (granularity) {
    case 'day':
      return fromUtcMs(ms + DAY_MS);
    case 'week':
      return fromUtcMs(ms + 7 * DAY_MS);
    case 'month':
      return fromUtcMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    case 'quarter':
      return fromUtcMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 3, 1));
  }
}

/** Last day (inclusive) of the bucket that starts at `start`. */
export function bucketEnd(start: string, granularity: BucketGranularity): string {
  return addDays(nextBucketStart(start, granularity), -1);
}

/**
 * Every bucket start that overlaps `[from, to]`, in order - including
 * the ones the backend omits because they have no data, so the chart can
 * draw them as zeros. The first bucket starts at or before `from` (its
 * start is aligned back to the bucket boundary).
 */
export function bucketStarts(from: string, to: string, granularity: BucketGranularity): string[] {
  const starts: string[] = [];
  let current = startOfBucket(from, granularity);
  while (current <= to && starts.length < MAX_BUCKETS) {
    starts.push(current);
    current = nextBucketStart(current, granularity);
  }
  return starts;
}

export interface BucketCoverage {
  /** The bucket begins before the selected range, so it only counts the days from `from`. */
  startsBeforeRange: boolean;
  /** The bucket continues past the selected range, so it only counts the days up to `to`. */
  endsAfterRange: boolean;
  /** The bucket reaches past the last loaded day (`maxDate`) - more data will still arrive. */
  ongoing: boolean;
  /** Any of the above: the bucket's total isn't comparable with a full period's. */
  partial: boolean;
}

export function bucketCoverage(
  start: string,
  granularity: BucketGranularity,
  from: string,
  to: string,
  maxDate: string | null,
): BucketCoverage {
  const end = bucketEnd(start, granularity);
  const startsBeforeRange = start < from;
  const endsAfterRange = end > to;
  const ongoing = maxDate !== null && end > maxDate;
  return { startsBeforeRange, endsAfterRange, ongoing, partial: startsBeforeRange || endsAfterRange || ongoing };
}

export type UsagePreset = 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'thisQuarter';
export const USAGE_PRESETS: readonly UsagePreset[] = ['yesterday', 'last7', 'last30', 'thisMonth', 'thisQuarter'];

/**
 * The date range a quick preset stands for. Anchored to `maxDate` (the
 * last day the backend actually has data for), not to the browser's
 * clock: normally `maxDate` is yesterday, but if a morning load ever
 * fails, "Yesterday" should show the newest day with data instead of an
 * empty page.
 */
export function presetRange(preset: UsagePreset, maxDate: string): { from: string; to: string } {
  switch (preset) {
    case 'yesterday':
      return { from: maxDate, to: maxDate };
    case 'last7':
      return { from: addDays(maxDate, -6), to: maxDate };
    case 'last30':
      return { from: addDays(maxDate, -29), to: maxDate };
    case 'thisMonth':
      return { from: startOfBucket(maxDate, 'month'), to: maxDate };
    case 'thisQuarter':
      return { from: startOfBucket(maxDate, 'quarter'), to: maxDate };
  }
}

/** Number of calendar days in `from..to`, both ends included. */
export function daysInRange(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS) + 1;
}

/**
 * The time step that gives a readable chart for a range of this length
 * (roughly 5-30 bars): days up to a month, weeks up to ~4 months, months
 * up to two years, quarters beyond that. The dashboard applies it when
 * the period changes, so the period and the chart's step stay in tune;
 * the user can still override the step afterwards.
 */
export function suggestGranularity(from: string, to: string): BucketGranularity {
  const days = daysInRange(from, to);
  if (days <= 31) {
    return 'day';
  }
  if (days <= 120) {
    return 'week';
  }
  return days <= 730 ? 'month' : 'quarter';
}
