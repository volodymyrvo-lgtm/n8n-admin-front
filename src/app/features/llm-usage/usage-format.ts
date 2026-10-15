import type { BucketGranularity } from './date-utils';
import { bucketEnd } from './date-utils';

/**
 * Currency the dashboard labels costs with. The backend spec only says
 * "probably USD" - job cards already show spend in USD, so this matches
 * them, but it's still unconfirmed: change it here once the backend team
 * says otherwise.
 */
export const USAGE_CURRENCY = 'USD';

/** Intl locale for the app's UI language (`en` / `ru`). */
export function intlLocale(language: string): string {
  return language === 'ru' ? 'ru-RU' : 'en-US';
}

/**
 * Formats a cost with at least 2 and at most `maxFractionDigits` decimals
 * (trailing zeros beyond the 2nd are dropped); amounts of $1 and up are
 * shown with exactly 2 unless a detailed precision (> 4) was asked for.
 * Tiny non-zero amounts are never rounded to zero: below 0.01 more digits
 * are kept, and anything smaller than the last digit shown becomes
 * "<$0.000001".
 */
export function formatCost(value: number, locale = 'en-US', maxFractionDigits = 4): string {
  const make = (max: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: USAGE_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: max,
    });

  if (!Number.isFinite(value) || value === 0) {
    return make(2).format(0);
  }

  const abs = Math.abs(value);
  let digits = maxFractionDigits;
  if (abs < 0.01) {
    digits = Math.max(maxFractionDigits, 6);
  } else if (abs >= 1 && maxFractionDigits <= 4) {
    // Aggregates (KPI tiles, chart, breakdowns): sub-cent precision is noise
    // once an amount reaches a dollar. The detailed table (6 digits) keeps it.
    digits = 2;
  }
  const smallest = 10 ** -digits;
  if (abs < smallest) {
    return `<${make(digits).format(smallest)}`;
  }
  return make(digits).format(value);
}

export function formatInteger(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** `1234567` -> `1.2M` - for the KPI tiles, where the exact number is available as a tooltip. */
export function formatCompact(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  // timeZone: 'UTC' so a `YYYY-MM-DD` day is never shifted by the viewer's own timezone.
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
}

/** Short x-axis label for a bucket that starts at `period`. */
export function formatPeriodLabel(period: string, granularity: BucketGranularity, locale = 'en-US'): string {
  const date = utcDate(period);
  switch (granularity) {
    case 'day':
    case 'week':
      return dateFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    case 'month':
      return dateFormat(locale, { month: 'short', year: 'numeric' }).format(date);
    case 'quarter':
      return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  }
}

/** Longer tooltip title for a bucket: the exact day, or the whole span a week/month/quarter covers. */
export function formatPeriodTitle(period: string, granularity: BucketGranularity, locale = 'en-US'): string {
  const start = utcDate(period);
  const full = dateFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const short = dateFormat(locale, { month: 'short', day: 'numeric' });

  switch (granularity) {
    case 'day':
      return dateFormat(locale, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(start);
    case 'week':
      return `${short.format(start)} – ${full.format(utcDate(bucketEnd(period, granularity)))}`;
    case 'month':
      return dateFormat(locale, { month: 'long', year: 'numeric' }).format(start);
    case 'quarter':
      return `${formatPeriodLabel(period, granularity, locale)} (${short.format(start)} – ${short.format(utcDate(bucketEnd(period, granularity)))})`;
  }
}

/** How a KPI changed against the previous period. */
export type Delta =
  | { kind: 'none' } // nothing in either period - nothing to say
  | { kind: 'new' } // zero before, something now - a percentage would be infinite
  | { kind: 'change'; direction: 'up' | 'down' | 'flat'; fraction: number };

/** Changes smaller than 0.05% read as "no change" (the badge would show "0.0%" anyway). */
const FLAT_THRESHOLD = 0.0005;

/** `total / days`, 0 for an empty period. */
export function perDay(total: number, days: number): number {
  return days > 0 ? total / days : 0;
}

export function compareValues(current: number, previous: number): Delta {
  if (previous === 0) {
    return current === 0 ? { kind: 'none' } : { kind: 'new' };
  }
  const fraction = (current - previous) / Math.abs(previous);
  const direction = Math.abs(fraction) < FLAT_THRESHOLD ? 'flat' : fraction > 0 ? 'up' : 'down';
  return { kind: 'change', direction, fraction };
}
