import type { LlmUsageSummaryRow } from '../../core/models/llm-usage.model';
import { buildChartModel, buildDonutSlices, TOTAL_SERIES_KEY } from './chart-data';

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
