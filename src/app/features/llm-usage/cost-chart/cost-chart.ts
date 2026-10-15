import {
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  InjectionToken,
  input,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  Legend,
  LinearScale,
  type ScriptableContext,
  Tooltip,
  type TooltipItem,
} from 'chart.js';

// Chart.js is tree-shakeable: register only the pieces a stacked bar chart
// uses instead of `Chart.register(...registerables)`, so the rest stays out
// of this (lazy) route's bundle.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface CostChartSeries {
  label: string;
  /** `#rrggbb` - Chart.js can't derive alpha variants from CSS color functions like oklch(). */
  color: string;
  /** Cost per bucket, aligned with the chart's `labels`; `null` = no bar (e.g. the shorter of two compared periods has ended). */
  data: (number | null)[];
}

/** The slice of a Chart.js instance the component needs - lets tests swap in a fake instead of drawing on a real canvas. */
export interface ChartHandle {
  destroy(): void;
}
export type ChartFactory = (canvas: HTMLCanvasElement, config: ChartConfiguration<'bar'>) => ChartHandle;

export const CHART_FACTORY = new InjectionToken<ChartFactory>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => (canvas, config) => new Chart(canvas, config),
});

const TEXT_MUTED = '#8c91a1';
const GRID = 'rgba(255, 255, 255, 0.07)';
const FADED_ALPHA = 0.35;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Stacked bar chart of cost over time, drawn with Chart.js.
 *
 * Purely presentational: the parent hands over already-bucketed,
 * zero-filled series. Buckets flagged in `faded` (a period that's still
 * in progress or cut off by the selected range) are drawn as outlined,
 * see-through bars, so they're not mistaken for a real drop in spend.
 */
@Component({
  selector: 'app-cost-chart',
  template: `<canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>`,
  styles: `
    :host {
      display: block;
      position: relative;
      height: 340px;
    }
  `,
})
export class CostChartComponent {
  readonly labels = input.required<string[]>();
  /** Tooltip heading per bucket (e.g. a full date or a week's span). */
  readonly titles = input<string[]>([]);
  /** Extra tooltip line per bucket (e.g. "in progress"); empty string for none. */
  readonly notes = input<string[]>([]);
  readonly series = input.required<CostChartSeries[]>();
  /** Stack the series on top of each other (default), or draw them side by side - for comparing two periods. */
  readonly stacked = input(true);
  /** Per bucket: draw it faded/outlined. */
  readonly faded = input<boolean[]>([]);
  readonly formatValue = input.required<(value: number) => string>();
  readonly totalLabel = input<string>('Total');
  readonly ariaLabel = input<string>('');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly createChart = inject(CHART_FACTORY);
  private chart: ChartHandle | null = null;

  constructor() {
    // Rebuilds the chart whenever any input changes. Re-creating (rather
    // than patching the live instance) is a little more work for Chart.js
    // but can't leave stale datasets/callbacks behind.
    afterRenderEffect(() => {
      const config = this.buildConfig();
      this.chart?.destroy();
      this.chart = this.createChart(this.canvas().nativeElement, config);
    });

    inject(DestroyRef).onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  private buildConfig(): ChartConfiguration<'bar'> {
    const series = this.series();
    const faded = this.faded();
    const titles = this.titles();
    const notes = this.notes();
    const format = this.formatValue();
    const totalLabel = this.totalLabel();
    const stacked = this.stacked();
    const isFaded = (ctx: ScriptableContext<'bar'>) => faded[ctx.dataIndex] === true;

    return {
      type: 'bar',
      data: {
        labels: this.labels(),
        datasets: series.map((item) => ({
          label: item.label,
          data: item.data,
          backgroundColor: (ctx: ScriptableContext<'bar'>) => (isFaded(ctx) ? withAlpha(item.color, FADED_ALPHA) : item.color),
          borderColor: item.color,
          borderWidth: (ctx: ScriptableContext<'bar'>) => (isFaded(ctx) ? 1.5 : 0),
          borderSkipped: false,
          maxBarThickness: 42,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            stacked,
            grid: { display: false },
            ticks: { color: TEXT_MUTED, maxRotation: 0, autoSkip: true },
            border: { color: GRID },
          },
          y: {
            stacked,
            beginAtZero: true,
            grid: { color: GRID },
            border: { display: false },
            ticks: { color: TEXT_MUTED, callback: (value) => format(Number(value)) },
          },
        },
        plugins: {
          legend: {
            display: series.length > 1,
            position: 'bottom',
            labels: { color: TEXT_MUTED, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' },
          },
          tooltip: {
            backgroundColor: '#14151a',
            borderColor: 'rgba(255, 255, 255, 0.14)',
            borderWidth: 1,
            titleColor: '#f1f2f5',
            bodyColor: '#c9ccd6',
            footerColor: '#f1f2f5',
            padding: 12,
            // Zero entries would only pad the tooltip when many series are stacked; side by side, a zero is a real answer.
            filter: (item: TooltipItem<'bar'>) => (stacked ? (item.parsed.y ?? 0) !== 0 : item.parsed.y !== null),
            callbacks: {
              title: (items) => titles[items[0]?.dataIndex ?? 0] ?? items[0]?.label ?? '',
              afterTitle: (items) => notes[items[0]?.dataIndex ?? 0] ?? '',
              label: (item) => `${item.dataset.label}: ${format(item.parsed.y ?? 0)}`,
              footer: (items) =>
                stacked && series.length > 1 ? `${totalLabel}: ${format(items.reduce((sum, item) => sum + (item.parsed.y ?? 0), 0))}` : '',
            },
          },
        },
      },
    };
  }
}
