import {
  addDays,
  bucketCoverage,
  bucketEnd,
  bucketStarts,
  daysInRange,
  isValidIsoDate,
  nextBucketStart,
  presetRange,
  startOfBucket,
  suggestGranularity,
} from './date-utils';

describe('date-utils', () => {
  describe('isValidIsoDate', () => {
    it('accepts real calendar days', () => {
      expect(isValidIsoDate('2026-10-05')).toBe(true);
      expect(isValidIsoDate('2028-02-29')).toBe(true);
    });

    it('rejects malformed values and days that do not exist', () => {
      expect(isValidIsoDate('2026-02-30')).toBe(false);
      expect(isValidIsoDate('2027-02-29')).toBe(false);
      expect(isValidIsoDate('2026-1-5')).toBe(false);
      expect(isValidIsoDate('05.10.2026')).toBe(false);
      expect(isValidIsoDate('')).toBe(false);
      expect(isValidIsoDate(null)).toBe(false);
      expect(isValidIsoDate(undefined)).toBe(false);
    });
  });

  describe('addDays', () => {
    it('moves across month and year boundaries', () => {
      expect(addDays('2026-10-11', -29)).toBe('2026-09-12');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('does not drift across a DST change (it works in UTC)', () => {
      expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
      expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    });
  });

  describe('startOfBucket', () => {
    it('returns the day itself for day buckets', () => {
      expect(startOfBucket('2026-10-07', 'day')).toBe('2026-10-07');
    });

    it('returns the Monday of the week (including for a Sunday)', () => {
      expect(startOfBucket('2026-10-05', 'week')).toBe('2026-10-05'); // Monday
      expect(startOfBucket('2026-10-08', 'week')).toBe('2026-10-05');
      expect(startOfBucket('2026-10-11', 'week')).toBe('2026-10-05'); // Sunday
      expect(startOfBucket('2026-10-12', 'week')).toBe('2026-10-12'); // next Monday
    });

    it('returns the 1st of the month and the first day of the quarter', () => {
      expect(startOfBucket('2026-10-31', 'month')).toBe('2026-10-01');
      expect(startOfBucket('2026-05-17', 'quarter')).toBe('2026-04-01');
      expect(startOfBucket('2026-12-31', 'quarter')).toBe('2026-10-01');
      expect(startOfBucket('2026-01-01', 'quarter')).toBe('2026-01-01');
    });
  });

  describe('nextBucketStart / bucketEnd', () => {
    it('steps to the next bucket, rolling over the year', () => {
      expect(nextBucketStart('2026-10-05', 'day')).toBe('2026-10-06');
      expect(nextBucketStart('2026-10-05', 'week')).toBe('2026-10-12');
      expect(nextBucketStart('2026-12-01', 'month')).toBe('2027-01-01');
      expect(nextBucketStart('2026-10-01', 'quarter')).toBe('2027-01-01');
    });

    it('gives the last day of a bucket, inclusive', () => {
      expect(bucketEnd('2026-10-05', 'day')).toBe('2026-10-05');
      expect(bucketEnd('2026-10-05', 'week')).toBe('2026-10-11');
      expect(bucketEnd('2026-02-01', 'month')).toBe('2026-02-28');
      expect(bucketEnd('2026-10-01', 'quarter')).toBe('2026-12-31');
    });
  });

  describe('bucketStarts', () => {
    it('lists every day in the range, ends included', () => {
      expect(bucketStarts('2026-10-09', '2026-10-12', 'day')).toEqual([
        '2026-10-09',
        '2026-10-10',
        '2026-10-11',
        '2026-10-12',
      ]);
    });

    it('aligns the first week back to its Monday', () => {
      expect(bucketStarts('2026-10-01', '2026-10-31', 'week')).toEqual([
        '2026-09-28',
        '2026-10-05',
        '2026-10-12',
        '2026-10-19',
        '2026-10-26',
      ]);
    });

    it('lists months and quarters, including ones that only partly overlap', () => {
      expect(bucketStarts('2026-08-15', '2026-10-02', 'month')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
      expect(bucketStarts('2026-01-01', '2026-10-11', 'quarter')).toEqual([
        '2026-01-01',
        '2026-04-01',
        '2026-07-01',
        '2026-10-01',
      ]);
    });

    it('returns a single bucket for a one-day range', () => {
      expect(bucketStarts('2026-10-11', '2026-10-11', 'day')).toEqual(['2026-10-11']);
      expect(bucketStarts('2026-10-11', '2026-10-11', 'month')).toEqual(['2026-10-01']);
    });
  });

  describe('bucketCoverage', () => {
    it('marks a bucket that begins before the range as partial', () => {
      const coverage = bucketCoverage('2026-09-28', 'week', '2026-10-01', '2026-10-31', '2026-10-31');
      expect(coverage).toEqual({ startsBeforeRange: true, endsAfterRange: false, ongoing: false, partial: true });
    });

    it('marks a bucket that runs past the range as partial', () => {
      const coverage = bucketCoverage('2026-10-26', 'week', '2026-10-01', '2026-10-30', '2026-10-31');
      expect(coverage.endsAfterRange).toBe(true);
      expect(coverage.partial).toBe(true);
    });

    it('marks a bucket reaching past the last loaded day as ongoing', () => {
      const coverage = bucketCoverage('2026-10-05', 'week', '2026-10-05', '2026-10-11', '2026-10-08');
      expect(coverage.ongoing).toBe(true);
      expect(coverage.partial).toBe(true);
    });

    it('treats a bucket fully inside the range and the loaded data as complete', () => {
      const coverage = bucketCoverage('2026-10-05', 'week', '2026-10-01', '2026-10-31', '2026-10-31');
      expect(coverage).toEqual({ startsBeforeRange: false, endsAfterRange: false, ongoing: false, partial: false });
    });

    it('does not treat anything as ongoing when maxDate is unknown', () => {
      expect(bucketCoverage('2026-10-05', 'week', '2026-10-05', '2026-10-11', null).ongoing).toBe(false);
    });
  });

  describe('presetRange', () => {
    it('anchors every preset to maxDate (the last loaded day)', () => {
      const maxDate = '2026-10-11';
      expect(presetRange('yesterday', maxDate)).toEqual({ from: '2026-10-11', to: '2026-10-11' });
      expect(presetRange('last7', maxDate)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
      expect(presetRange('last30', maxDate)).toEqual({ from: '2026-09-12', to: '2026-10-11' });
      expect(presetRange('thisMonth', maxDate)).toEqual({ from: '2026-10-01', to: '2026-10-11' });
      expect(presetRange('thisQuarter', maxDate)).toEqual({ from: '2026-10-01', to: '2026-10-11' });
    });

    it('starts the quarter preset at the quarter boundary', () => {
      expect(presetRange('thisQuarter', '2026-11-20')).toEqual({ from: '2026-10-01', to: '2026-11-20' });
      expect(presetRange('thisQuarter', '2026-02-03')).toEqual({ from: '2026-01-01', to: '2026-02-03' });
    });
  });

  describe('daysInRange', () => {
    it('counts both ends', () => {
      expect(daysInRange('2026-10-05', '2026-10-05')).toBe(1);
      expect(daysInRange('2026-09-12', '2026-10-11')).toBe(30);
      expect(daysInRange('2026-02-27', '2026-03-02')).toBe(4);
    });
  });

  describe('suggestGranularity', () => {
    it('picks a step that keeps the chart readable for the range length', () => {
      expect(suggestGranularity('2026-10-10', '2026-10-10')).toBe('day');
      expect(suggestGranularity('2026-09-12', '2026-10-11')).toBe('day');
      expect(suggestGranularity('2026-10-01', '2026-10-31')).toBe('day');
      expect(suggestGranularity('2026-09-01', '2026-10-11')).toBe('week');
      expect(suggestGranularity('2026-07-01', '2026-10-11')).toBe('week');
      expect(suggestGranularity('2026-05-01', '2026-10-11')).toBe('month');
      expect(suggestGranularity('2025-01-01', '2026-10-11')).toBe('month');
      expect(suggestGranularity('2023-01-01', '2026-10-11')).toBe('quarter');
    });
  });
});
