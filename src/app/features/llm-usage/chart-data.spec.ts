import type { LlmUsageSummaryRow } from '../../core/models/llm-usage.model';
import { buildChartModel, buildCompareChartModel, buildDonutSlices, TOTAL_SERIES_KEY } from './chart-data';

function row(period: string | null, llmMod: string, cost: number): LlmUsageSummaryRow {
  return {
    period,
    llmMod,
    requests: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost,
  };
}

const BASE = { granularity: 'day', splitBy: 'llmMod', from: '2026-10-09', to: '2026-10-12', maxDate: '2026-10-11' } as const;

describe('buildChartModel', () => {
  it('lays out every day in the range and fills the ones the backend omitted with zeros', () => {
    const model = buildChartModel([row('2026-10-09', 'a', 1.5), row('2026-10-11', 'a', 2)], BASE);

    expect(model.periods).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
    expect(model.series).toHaveLength(1);
    expect(model.series[0].data).toEqual([1.5, 0, 2, 0]);
    expect(model.series[0].total).toBe(3.5);
  });

  it('keeps one aligned series per group value, biggest spender first', () => {
    const model = buildChartModel(
      [row('2026-10-09', 'small', 1), row('2026-10-09', 'big', 5), row('2026-10-10', 'big', 5)],
      BASE,
    );

    expect(model.series.map((s) => s.key)).toEqual(['big', 'small']);
    expect(model.series[0].data).toEqual([5, 5, 0, 0]);
    expect(model.series[1].data).toEqual([1, 0, 0, 0]);
  });

  it('breaks ties between equally expensive series alphabetically', () => {
    const model = buildChartModel([row('2026-10-09', 'b', 1), row('2026-10-09', 'a', 1)], BASE);
    expect(model.series.map((s) => s.key)).toEqual(['a', 'b']);
  });

  it('adds up rows that land in the same bucket and series', () => {
    const model = buildChartModel([row('2026-10-09', 'a', 1), row('2026-10-09', 'a', 2)], BASE);
    expect(model.series[0].data[0]).toBe(3);
  });

  it('ignores rows without a period or outside the laid-out buckets', () => {
    const model = buildChartModel([row(null, 'a', 9), row('2026-09-01', 'a', 9), row('2026-10-10', 'a', 1)], BASE);
    expect(model.series[0].data).toEqual([0, 1, 0, 0]);
  });

  it('draws a single zero-filled total series when not split by any dimension', () => {
    const model = buildChartModel([], { ...BASE, splitBy: null });

    expect(model.series).toHaveLength(1);
    expect(model.series[0].key).toBe(TOTAL_SERIES_KEY);
    expect(model.series[0].data).toEqual([0, 0, 0, 0]);
  });

  it('has no series at all for an empty result that is split by a dimension', () => {
    expect(buildChartModel([], BASE).series).toEqual([]);
  });

  it('flags buckets that are cut off by the range or still in progress', () => {
    const model = buildChartModel([], {
      granularity: 'week',
      splitBy: 'llmMod',
      from: '2026-10-01',
      to: '2026-10-11',
      maxDate: '2026-10-11',
    });

    expect(model.periods).toEqual(['2026-09-28', '2026-10-05']);
    expect(model.coverage[0]).toMatchObject({ startsBeforeRange: true, partial: true });
    expect(model.coverage[1]).toMatchObject({ partial: false, ongoing: false });
  });

  it('flags the current, still-running month as ongoing', () => {
    const model = buildChartModel([], {
      granularity: 'month',
      splitBy: 'llmMod',
      from: '2026-09-01',
      to: '2026-10-11',
      maxDate: '2026-10-11',
    });

    expect(model.coverage.map((c) => c.ongoing)).toEqual([false, true]);
    expect(model.coverage.map((c) => c.partial)).toEqual([false, true]);
  });
});

describe('buildDonutSlices', () => {
  const item = (key: string, value: number) => ({ key, label: key.toUpperCase(), color: '#112233', value });
  const options = { restLabel: (count: number) => `Others (${count})`, restColor: '#5d6577' };

  it('orders slices biggest first and computes shares of the total', () => {
    const slices = buildDonutSlices([item('a', 1), item('b', 3)], options);

    expect(slices.map((slice) => slice.key)).toEqual(['b', 'a']);
    expect(slices.map((slice) => slice.share)).toEqual([0.75, 0.25]);
    expect(slices.every((slice) => !slice.isRest)).toBe(true);
  });

  it('drops entries without spend and returns nothing when there is no spend at all', () => {
    expect(buildDonutSlices([item('a', 0), item('b', 2)], options).map((slice) => slice.key)).toEqual(['b']);
    expect(buildDonutSlices([item('a', 0)], options)).toEqual([]);
    expect(buildDonutSlices([], options)).toEqual([]);
  });

  it('keeps up to six slices as they are', () => {
    const slices = buildDonutSlices(['a', 'b', 'c', 'd', 'e', 'f'].map((key, i) => item(key, 10 - i)), options);

    expect(slices).toHaveLength(6);
    expect(slices.some((slice) => slice.isRest)).toBe(false);
  });

  it('folds everything beyond the biggest five into one neutral "rest" slice', () => {
    const slices = buildDonutSlices(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key, i) => item(key, 10 - i)), options);

    expect(slices.map((slice) => slice.key)).toEqual(['a', 'b', 'c', 'd', 'e', '__rest__']);
    const rest = slices[5];
    expect(rest).toMatchObject({ label: 'Others (2)', color: '#5d6577', value: 9, isRest: true });
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('buildCompareChartModel', () => {
  const model = (from: string, to: string, rows: LlmUsageSummaryRow[], maxDate = '2026-10-31') =>
    buildChartModel(rows, { granularity: 'day', splitBy: 'llmMod', from, to, maxDate });

  it('lines two periods up by position and sums every series into one total per bucket', () => {
    const a = model('2026-09-01', '2026-09-03', [row('2026-09-01', 'x', 1), row('2026-09-01', 'y', 2), row('2026-09-03', 'x', 4)]);
    const b = buildChartModel([row('2026-10-02', 'x', 5)], {
      granularity: 'day',
      splitBy: null,
      from: '2026-10-01',
      to: '2026-10-03',
      maxDate: '2026-10-31',
    });
    // (B's rows carry no split, but the builder just sums whatever it's given.)

    const compare = buildCompareChartModel(a, b);
    expect(compare.size).toBe(3);
    expect(compare.a).toEqual([3, 0, 4]);
    expect(compare.b).toEqual([0, 5, 0]);
    expect(compare.periodsA).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(compare.periodsB).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(compare.partial).toEqual([false, false, false]);
  });

  it('leaves the shorter period without bars (null) past its end', () => {
    const compare = buildCompareChartModel(
      model('2026-09-01', '2026-09-02', [row('2026-09-01', 'x', 1)]),
      model('2026-10-01', '2026-10-04', [row('2026-10-04', 'x', 2)]),
    );

    expect(compare.size).toBe(4);
    expect(compare.a).toEqual([1, 0, null, null]);
    expect(compare.b).toEqual([0, 0, 0, 2]);
    expect(compare.periodsA).toEqual(['2026-09-01', '2026-09-02', null, null]);
  });

  it('flags a bucket as partial / ongoing when either side is', () => {
    // B runs to Oct 5 but data only goes up to Oct 3: its last two days are still in progress.
    const compare = buildCompareChartModel(
      model('2026-09-01', '2026-09-05', []),
      model('2026-10-01', '2026-10-05', [], '2026-10-03'),
    );

    expect(compare.ongoing).toEqual([false, false, false, true, true]);
    expect(compare.partial).toEqual([false, false, false, true, true]);
  });
});
