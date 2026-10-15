import { convertToParamMap } from '@angular/router';
import { resolveUsageState, usageStateToQueryParams } from './usage-state';

const MAX_DATE = '2026-10-11';

describe('usage-state', () => {
  describe('resolveUsageState', () => {
    it('defaults to the last 30 days ending on maxDate, by day, stacked by model', () => {
      const state = resolveUsageState(convertToParamMap({}), MAX_DATE);

      expect(state).toEqual({
        from: '2026-09-12',
        to: '2026-10-11',
        granularity: 'day',
        splitBy: 'llmMod',
        view: 'bars',
        types: [],
        flows: [],
        models: [],
        compare: true,
        compareFrom: null,
        compareTo: null,
        page: 1,
        sortBy: 'date',
        order: 'desc',
      });
    });

    it('reads everything back out of the query string, including repeated list params', () => {
      const state = resolveUsageState(
        convertToParamMap({
          from: '2026-10-01',
          to: '2026-10-05',
          step: 'week',
          by: 'type',
          view: 'donut',
          type: ['email_localization', 'other'],
          flow: 'NEWCRM_PPL_AZ/RU_EMAIL_Localization',
          model: ['claude-sonnet-5', 'gpt-6-astra'],
          cmp: '0',
          cfrom: '2026-09-01',
          cto: '2026-09-07',
          page: '3',
          sort: 'cost',
          order: 'asc',
        }),
        MAX_DATE,
      );

      expect(state).toEqual({
        from: '2026-10-01',
        to: '2026-10-05',
        granularity: 'week',
        splitBy: 'type',
        view: 'donut',
        types: ['email_localization', 'other'],
        flows: ['NEWCRM_PPL_AZ/RU_EMAIL_Localization'],
        models: ['claude-sonnet-5', 'gpt-6-astra'],
        compare: false,
        compareFrom: '2026-09-01',
        compareTo: '2026-09-07',
        page: 3,
        sortBy: 'cost',
        order: 'asc',
      });
    });

    it('falls back to defaults for malformed or unknown values instead of breaking', () => {
      const state = resolveUsageState(
        convertToParamMap({ from: 'yesterday', to: '2026-02-30', step: 'total', by: 'nonsense', view: 'pie' }),
        MAX_DATE,
      );

      expect(state.from).toBe('2026-09-12');
      expect(state.to).toBe('2026-10-11');
      expect(state.granularity).toBe('day');
      expect(state.splitBy).toBe('llmMod');
      expect(state.view).toBe('bars');
    });

    it('falls back to page 1, date desc for malformed table params', () => {
      for (const page of ['0', '-2', '1.5', 'abc', '']) {
        expect(resolveUsageState(convertToParamMap({ page }), MAX_DATE).page).toBe(1);
      }
      const state = resolveUsageState(convertToParamMap({ sort: 'flow', order: 'sideways' }), MAX_DATE);
      expect([state.sortBy, state.order]).toEqual(['date', 'desc']);
    });

    it('reads a hand-picked comparison period, swapping a reversed one, and ignores a half-valid one', () => {
      const read = (params: Record<string, string>) => {
        const state = resolveUsageState(convertToParamMap(params), MAX_DATE);
        return [state.compareFrom, state.compareTo];
      };
      expect(read({ cfrom: '2026-09-01', cto: '2026-09-07' })).toEqual(['2026-09-01', '2026-09-07']);
      expect(read({ cfrom: '2026-09-07', cto: '2026-09-01' })).toEqual(['2026-09-01', '2026-09-07']);
      expect(read({ cfrom: '2026-09-01' })).toEqual([null, null]);
      expect(read({ cfrom: 'nope', cto: '2026-09-07' })).toEqual([null, null]);
    });

    it('accepts the compare view', () => {
      expect(resolveUsageState(convertToParamMap({ view: 'compare' }), MAX_DATE).view).toBe('compare');
    });

    it('swaps a reversed range so it never produces a 400 from the backend', () => {
      const state = resolveUsageState(convertToParamMap({ from: '2026-10-09', to: '2026-10-01' }), MAX_DATE);
      expect([state.from, state.to]).toEqual(['2026-10-01', '2026-10-09']);
    });

    it('uses only the valid half of a partly valid range', () => {
      const state = resolveUsageState(convertToParamMap({ from: '2026-10-05' }), MAX_DATE);
      expect([state.from, state.to]).toEqual(['2026-10-05', '2026-10-11']);
    });
  });

  describe('usageStateToQueryParams', () => {
    it('writes the state out and omits empty filter lists', () => {
      const params = usageStateToQueryParams({
        from: '2026-10-01',
        to: '2026-10-11',
        granularity: 'month',
        splitBy: 'flow',
        view: 'bars',
        types: [],
        flows: ['a'],
        models: ['m1', 'm2'],
        compare: true,
        compareFrom: null,
        compareTo: null,
        page: 1,
        sortBy: 'date',
        order: 'desc',
      });

      expect(params).toEqual({
        from: '2026-10-01',
        to: '2026-10-11',
        step: 'month',
        by: 'flow',
        view: null,
        type: null,
        flow: ['a'],
        model: ['m1', 'm2'],
        cmp: null,
        cfrom: null,
        cto: null,
        page: null,
        sort: null,
        order: null,
      });
    });

    it('writes the hand-picked comparison period, and keeps it while comparing is switched off', () => {
      const base = { ...resolveUsageState(convertToParamMap({}), MAX_DATE), compareFrom: '2026-09-01', compareTo: '2026-09-07' };
      const on = usageStateToQueryParams(base);
      expect([on['cfrom'], on['cto']]).toEqual(['2026-09-01', '2026-09-07']);
      const off = usageStateToQueryParams({ ...base, compare: false });
      expect([off['cfrom'], off['cto']]).toEqual(['2026-09-01', '2026-09-07']);
    });

    it('writes only non-default compare / table params', () => {
      const params = usageStateToQueryParams({
        ...resolveUsageState(convertToParamMap({}), MAX_DATE),
        compare: false,
        page: 2,
        sortBy: 'requests',
        order: 'asc',
      });
      expect([params['cmp'], params['page'], params['sort'], params['order']]).toEqual(['0', 2, 'requests', 'asc']);
    });

    it('writes the doughnut view into the URL', () => {
      const params = usageStateToQueryParams({
        ...resolveUsageState(convertToParamMap({}), MAX_DATE),
        view: 'donut',
      });
      expect(params['view']).toBe('donut');
    });

    it('round-trips through resolveUsageState', () => {
      const original = resolveUsageState(
        convertToParamMap({ from: '2026-10-02', to: '2026-10-09', step: 'quarter', by: 'type', view: 'donut', type: ['x', 'y'], cmp: '0', cfrom: '2026-08-01', cto: '2026-08-09', page: '4', sort: 'inputTokens' }),
        MAX_DATE,
      );
      const written = Object.entries(usageStateToQueryParams(original)).filter(([, value]) => value !== null);
      const rebuilt = resolveUsageState(convertToParamMap(Object.fromEntries(written)), MAX_DATE);

      expect(rebuilt).toEqual(original);
    });
  });
});
