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
      });
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
        convertToParamMap({ from: '2026-10-02', to: '2026-10-09', step: 'quarter', by: 'type', view: 'donut', type: ['x', 'y'] }),
        MAX_DATE,
      );
      const written = Object.entries(usageStateToQueryParams(original)).filter(([, value]) => value !== null);
      const rebuilt = resolveUsageState(convertToParamMap(Object.fromEntries(written)), MAX_DATE);

      expect(rebuilt).toEqual(original);
    });
  });
});
