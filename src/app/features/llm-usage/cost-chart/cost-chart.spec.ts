import { TestBed } from '@angular/core/testing';
import type { ChartConfiguration, ScriptableContext } from 'chart.js';
import { vi } from 'vitest';
import { CHART_FACTORY, CostChartComponent } from './cost-chart';

type BarConfig = ChartConfiguration<'bar'>;

describe('CostChartComponent', () => {
  let configs: BarConfig[];
  let canvases: HTMLCanvasElement[];
  let destroy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    configs = [];
    canvases = [];
    destroy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [CostChartComponent],
      providers: [
        {
          provide: CHART_FACTORY,
          useValue: (canvas: HTMLCanvasElement, config: BarConfig) => {
            canvases.push(canvas);
            configs.push(config);
            return { destroy };
          },
        },
      ],
    }).compileComponents();
  });

  function create(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(CostChartComponent);
    const defaults: Record<string, unknown> = {
      labels: ['Oct 9', 'Oct 10', 'Oct 11'],
      titles: ['Fri, Oct 9, 2026', 'Sat, Oct 10, 2026', 'Sun, Oct 11, 2026'],
      notes: ['', '', 'In progress'],
      faded: [false, false, true],
      series: [
        { label: 'sonnet', color: '#ff6b4a', data: [2, 3, 1] },
        { label: 'haiku', color: '#4ea8ff', data: [1, 0, 0.5] },
      ],
      formatValue: (value: number) => `$${value.toFixed(2)}`,
      totalLabel: 'Total',
      ariaLabel: 'Spend over time',
      ...inputs,
    };
    for (const [name, value] of Object.entries(defaults)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  it('draws a stacked bar chart on its canvas, one dataset per series', async () => {
    const fixture = create();
    await fixture.whenStable();

    expect(configs).toHaveLength(1);
    expect(canvases[0]).toBe(fixture.nativeElement.querySelector('canvas'));
    expect(fixture.nativeElement.querySelector('canvas').getAttribute('aria-label')).toBe('Spend over time');

    const config = configs[0];
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['Oct 9', 'Oct 10', 'Oct 11']);
    expect(config.data.datasets.map((d) => d.label)).toEqual(['sonnet', 'haiku']);
    expect(config.data.datasets.map((d) => d.data)).toEqual([
      [2, 3, 1],
      [1, 0, 0.5],
    ]);
    expect(config.options?.scales?.['x']).toMatchObject({ stacked: true });
    expect(config.options?.scales?.['y']).toMatchObject({ stacked: true, beginAtZero: true });
  });

  it('draws buckets flagged as faded see-through and outlined, the rest solid', async () => {
    const fixture = create();
    await fixture.whenStable();

    const dataset = configs[0].data.datasets[0];
    const background = dataset.backgroundColor as (ctx: Partial<ScriptableContext<'bar'>>) => string;
    const borderWidth = dataset.borderWidth as (ctx: Partial<ScriptableContext<'bar'>>) => number;

    expect(background({ dataIndex: 0 })).toBe('#ff6b4a');
    expect(background({ dataIndex: 2 })).toBe('rgba(255, 107, 74, 0.35)');
    expect(borderWidth({ dataIndex: 0 })).toBe(0);
    expect(borderWidth({ dataIndex: 2 })).toBe(1.5);
    expect(fixture.componentRef).toBeTruthy();
  });

  it('formats the y axis and the tooltip with the supplied formatter', async () => {
    const fixture = create();
    await fixture.whenStable();

    const options = configs[0].options!;
    const yTicks = (options.scales!['y'] as { ticks: { callback: (value: number) => string } }).ticks;
    expect(yTicks.callback(4)).toBe('$4.00');

    const callbacks = options.plugins!.tooltip!.callbacks!;
    const items = [
      { dataIndex: 2, label: 'Oct 11', dataset: { label: 'sonnet' }, parsed: { y: 1 } },
      { dataIndex: 2, label: 'Oct 11', dataset: { label: 'haiku' }, parsed: { y: 0.5 } },
    ] as never[];

    expect((callbacks.title as (i: never[]) => string)(items)).toBe('Sun, Oct 11, 2026');
    expect((callbacks.afterTitle as (i: never[]) => string)(items)).toBe('In progress');
    expect((callbacks.label as (i: never) => string)(items[0])).toBe('sonnet: $1.00');
    expect((callbacks.footer as (i: never[]) => string)(items)).toBe('Total: $1.50');
  });

  it('hides zero entries from the tooltip', async () => {
    const fixture = create();
    await fixture.whenStable();

    const filter = configs[0].options!.plugins!.tooltip!.filter as unknown as (item: never) => boolean;
    expect(filter({ parsed: { y: 0 } } as never)).toBe(false);
    expect(filter({ parsed: { y: 2 } } as never)).toBe(true);
    expect(fixture.componentRef).toBeTruthy();
  });

  it('shows a legend only when there is more than one series, and no total footer for a single one', async () => {
    const fixture = create({ series: [{ label: 'only', color: '#ff6b4a', data: [1, 2, 3] }] });
    await fixture.whenStable();

    const options = configs[0].options!;
    expect(options.plugins!.legend!.display).toBe(false);
    const footer = options.plugins!.tooltip!.callbacks!.footer as (i: never[]) => string;
    expect(footer([{ parsed: { y: 1 } }] as never[])).toBe('');
  });

  it('rebuilds the chart (destroying the old one) when an input changes', async () => {
    const fixture = create();
    await fixture.whenStable();
    expect(configs).toHaveLength(1);

    fixture.componentRef.setInput('series', [{ label: 'sonnet', color: '#ff6b4a', data: [9, 9, 9] }]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(configs).toHaveLength(2);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(configs[1].data.datasets[0].data).toEqual([9, 9, 9]);
  });

  it('destroys the chart together with the component', async () => {
    const fixture = create();
    await fixture.whenStable();

    fixture.destroy();

    expect(destroy).toHaveBeenCalled();
  });
});
