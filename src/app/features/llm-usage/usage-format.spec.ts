import {
  compareValues,
  formatCompact,
  formatCost,
  formatInteger,
  formatPeriodLabel,
  formatPeriodTitle,
  intlLocale,
} from './usage-format';

describe('usage-format', () => {
  describe('formatCost', () => {
    it('shows at least 2 decimals and drops trailing zeros beyond the 2nd', () => {
      expect(formatCost(1.84)).toBe('$1.84');
      expect(formatCost(1234.5)).toBe('$1,234.50');
      expect(formatCost(0.262602)).toBe('$0.2626');
    });

    it('rounds amounts of a dollar and up to cents in aggregates, but not in the detailed view', () => {
      expect(formatCost(279.91353)).toBe('$279.91');
      expect(formatCost(1.00004)).toBe('$1.00');
      expect(formatCost(52.31906, 'en-US', 6)).toBe('$52.31906');
    });

    it('shows up to 6 decimals when asked (detailed table)', () => {
      expect(formatCost(0.262602, 'en-US', 6)).toBe('$0.262602');
    });

    it('never rounds a tiny non-zero amount down to zero', () => {
      expect(formatCost(0.0034)).toBe('$0.0034');
      expect(formatCost(0.000123)).toBe('$0.000123');
      expect(formatCost(0.0000001)).toBe('<$0.000001');
    });

    it('formats zero (and non-finite input) as $0.00', () => {
      expect(formatCost(0)).toBe('$0.00');
      expect(formatCost(Number.NaN)).toBe('$0.00');
    });
  });

  describe('numbers', () => {
    it('separates thousands', () => {
      expect(formatInteger(1234567)).toBe('1,234,567');
    });

    it('abbreviates large values for the KPI tiles', () => {
      expect(formatCompact(1234567)).toBe('1.2M');
      expect(formatCompact(540000)).toBe('540K');
      expect(formatCompact(31)).toBe('31');
    });
  });

  describe('period labels', () => {
    it('labels each granularity compactly', () => {
      expect(formatPeriodLabel('2026-10-05', 'day')).toBe('Oct 5');
      expect(formatPeriodLabel('2026-10-05', 'week')).toBe('Oct 5');
      expect(formatPeriodLabel('2026-10-01', 'month')).toBe('Oct 2026');
      expect(formatPeriodLabel('2026-10-01', 'quarter')).toBe('Q4 2026');
      expect(formatPeriodLabel('2026-01-01', 'quarter')).toBe('Q1 2026');
    });

    it('gives tooltip titles that spell out the span a bucket covers', () => {
      expect(formatPeriodTitle('2026-10-05', 'day')).toBe('Mon, Oct 5, 2026');
      expect(formatPeriodTitle('2026-10-05', 'week')).toBe('Oct 5 – Oct 11, 2026');
      expect(formatPeriodTitle('2026-10-01', 'month')).toBe('October 2026');
      expect(formatPeriodTitle('2026-10-01', 'quarter')).toBe('Q4 2026 (Oct 1 – Dec 31)');
    });
  });

  it('maps the UI language to an Intl locale', () => {
    expect(intlLocale('ru')).toBe('ru-RU');
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale('anything-else')).toBe('en-US');
  });

  describe('compareValues', () => {
    it('reports the relative change and its direction', () => {
      expect(compareValues(150, 100)).toEqual({ kind: 'change', direction: 'up', fraction: 0.5 });
      expect(compareValues(75, 100)).toEqual({ kind: 'change', direction: 'down', fraction: -0.25 });
    });

    it('treats a negligible change as flat', () => {
      expect(compareValues(100.01, 100)).toMatchObject({ kind: 'change', direction: 'flat' });
    });

    it('says "new" when the previous period had nothing, and nothing when both are empty', () => {
      expect(compareValues(5, 0)).toEqual({ kind: 'new' });
      expect(compareValues(0, 0)).toEqual({ kind: 'none' });
    });

    it('shows a full drop when the current period is empty', () => {
      expect(compareValues(0, 40)).toEqual({ kind: 'change', direction: 'down', fraction: -1 });
    });
  });
});
