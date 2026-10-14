import { TestBed } from '@angular/core/testing';
import type { ChartConfiguration } from 'chart.js';
import { vi } from 'vitest';
import type { DonutSlice } from '../chart-data';
import { CostDonutComponent, DONUT_FACTORY } from './cost-donut';

type DonutConfig = ChartConfiguration<'doughnut'>;

const SLICES: DonutSlice[] = [
  { key: 'a', label: 'gpt-5.6-sol', color: '#ff6b4a', value: 15, share: 0.75, isRest: false },
  { key: 'b', label: 'claude-sonnet-5', color: '#4ea8ff', value: 4, share: 0.2, isRest: false },
  { key: '__rest__', label: 'Others (2)', color: '#5d6577', value: 1, share: 0.05, isRest: true },
];

describe('CostDonutComponent', () => {
  let configs: DonutConfig[];
  let destroy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    configs = [];
    destroy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [CostDonutComponent],
      providers: [
        {
          provide: DONUT_FACTORY,
          useValue: (_canvas: HTMLCanvasElement, config: DonutConfig) => {
            configs.push(config);
            return { destroy };
          },
        },
      ],
    }).compileComponents();
  });

  function create(slices: DonutSlice[] = SLICES) {
    const fixture = TestBed.createComponent(CostDonutComponent);
    fixture.componentRef.setInput('slices', slices);
    fixture.componentRef.setInput('formatValue', (value: number) => `$${value.toFixed(2)}`);
    fixture.componentRef.setInput('formatShare', (fraction: number) => `${Math.round(fraction * 100)}%`);
    fixture.componentRef.setInput('totalLabel', 'Total');
    fixture.componentRef.setInput('ariaLabel', 'Spend share');
    fixture.detectChanges();
    return fixture;
  }

  it('draws a doughnut with one slice per entry, in the given colors', async () => {
    const fixture = create();
    await fixture.whenStable();

    expect(configs).toHaveLength(1);
    const config = configs[0];
    expect(config.type).toBe('doughnut');
    expect(config.data.labels).toEqual(['gpt-5.6-sol', 'claude-sonnet-5', 'Others (2)']);
    expect(config.data.datasets[0].data).toEqual([15, 4, 1]);
    expect(config.data.datasets[0].backgroundColor).toEqual(['#ff6b4a', '#4ea8ff', '#5d6577']);
    expect(fixture.nativeElement.querySelector('canvas').getAttribute('aria-label')).toBe('Spend share');
  });

  it('shows the total in the hole and a legend with value and share for every slice', async () => {
    const fixture = create();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.donut__center-value').textContent).toBe('$20.00');

    const items = [...fixture.nativeElement.querySelectorAll('.donut__item')] as HTMLElement[];
    expect(items.map((item) => item.querySelector('.donut__name')?.textContent)).toEqual([
      'gpt-5.6-sol',
      'claude-sonnet-5',
      'Others (2)',
    ]);
    expect(items[0].querySelector('.donut__value')?.textContent).toBe('$15.00');
    expect(items[0].querySelector('.donut__share')?.textContent).toBe('75%');
  });

  it('shows the hovered slice\'s figures in the hole instead of a tooltip, and the total again when the cursor leaves', async () => {
    const fixture = create();
    await fixture.whenStable();
    const config = configs[0];
    const center = () => ({
      label: fixture.nativeElement.querySelector('.donut__center-label').textContent.trim(),
      value: fixture.nativeElement.querySelector('.donut__center-value').textContent.trim(),
      share: fixture.nativeElement.querySelector('.donut__center-share')?.textContent.trim() ?? null,
    });

    expect(config.options?.plugins?.legend?.display).toBe(false);
    expect(config.options?.plugins?.tooltip?.enabled).toBe(false);
    expect(center()).toEqual({ label: 'Total', value: '$20.00', share: null });

    const onHover = config.options?.onHover as unknown as (event: unknown, active: { index: number }[]) => void;
    onHover({}, [{ index: 1 }]);
    fixture.detectChanges();
    expect(center()).toEqual({ label: 'claude-sonnet-5', value: '$4.00', share: '20%' });

    onHover({}, []);
    fixture.detectChanges();
    expect(center()).toEqual({ label: 'Total', value: '$20.00', share: null });
  });

  it('rebuilds the chart when the slices change and destroys it with the component', async () => {
    const fixture = create();
    await fixture.whenStable();

    fixture.componentRef.setInput('slices', SLICES.slice(0, 1));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(configs).toHaveLength(2);
    expect(configs[1].data.datasets[0].data).toEqual([15]);
    expect(destroy).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(destroy).toHaveBeenCalledTimes(2);
  });
});
