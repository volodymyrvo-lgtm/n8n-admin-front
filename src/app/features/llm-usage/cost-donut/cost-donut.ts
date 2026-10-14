import { afterRenderEffect, Component, computed, DestroyRef, ElementRef, inject, InjectionToken, input, signal, viewChild } from '@angular/core';
import { ArcElement, Chart, type ChartConfiguration, DoughnutController } from 'chart.js';
import type { ChartHandle } from '../cost-chart/cost-chart';
import type { DonutSlice } from '../chart-data';

// Like the bar chart: register only what a doughnut needs.
Chart.register(DoughnutController, ArcElement);

export type DonutFactory = (canvas: HTMLCanvasElement, config: ChartConfiguration<'doughnut'>) => ChartHandle;

/** Swappable in tests, so they don't have to draw on a real canvas. */
export const DONUT_FACTORY = new InjectionToken<DonutFactory>('DONUT_FACTORY', {
  providedIn: 'root',
  factory: () => (canvas, config) => new Chart(canvas, config),
});

/** The card background: slices are separated by a ring of this color, which reads as a gap between them. */
const SURFACE = '#101319';

/**
 * Doughnut of how a period's spend splits across a dimension, with the
 * total in the hole (it swaps to the hovered slice's own figures while
 * one is under the cursor - no tooltip to cover the ring) and a ranked
 * legend beside it. The legend is plain
 * HTML (not Chart.js's) so it can carry the value and share of every
 * slice - the small ones are hard to read off a ring.
 */
@Component({
  selector: 'app-cost-donut',
  template: `
    <div class="donut__plot">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      <div class="donut__center">
        <span class="donut__center-label" [class.donut__center-label--slice]="hoveredSlice()">{{ centerLabel() }}</span>
        <strong class="donut__center-value">{{ formatValue()(centerValue()) }}</strong>
        @if (hoveredSlice(); as slice) {
          <span class="donut__center-share">{{ formatShare()(slice.share) }}</span>
        }
      </div>
    </div>

    <ul class="donut__legend">
      @for (slice of slices(); track slice.key) {
        <li class="donut__item">
          <span class="donut__dot" [style.background]="slice.color" aria-hidden="true"></span>
          <span class="donut__name" [title]="slice.label">{{ slice.label }}</span>
          <span class="donut__value">{{ formatValue()(slice.value) }}</span>
          <span class="donut__share">{{ formatShare()(slice.share) }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 40px;
      flex-wrap: wrap;
      padding: 8px 0 4px;
    }

    .donut__plot {
      position: relative;
      width: 280px;
      height: 280px;
      flex: none;
    }

    .donut__center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      pointer-events: none;
    }

    .donut__center-label {
      font: 600 10.5px 'JetBrains Mono', monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: oklch(52% 0.008 260);
    }

    .donut__center-label--slice {
      max-width: 150px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      text-align: center;
      text-transform: none;
      letter-spacing: 0;
      font: 500 12.5px 'Work Sans', system-ui, sans-serif;
      color: oklch(80% 0.006 260);
    }

    .donut__center-share {
      font: 500 12.5px 'Work Sans', system-ui, sans-serif;
      color: oklch(62% 0.008 260);
      font-variant-numeric: tabular-nums;
    }

    .donut__center-value {
      font: 600 26px 'Space Grotesk', system-ui, sans-serif;
      letter-spacing: -0.02em;
      color: oklch(96% 0.004 260);
      font-variant-numeric: tabular-nums;
    }

    .donut__legend {
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1 1 280px;
      max-width: 460px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .donut__item {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto 56px;
      align-items: center;
      gap: 10px;
      padding: 7px 0;
      border-bottom: 1px solid oklch(24% 0.015 260);
      font: 500 13.5px 'Work Sans', system-ui, sans-serif;
    }

    .donut__item:last-child {
      border-bottom: none;
    }

    .donut__dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }

    .donut__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: oklch(88% 0.004 260);
    }

    .donut__value {
      font-weight: 600;
      color: oklch(94% 0.004 260);
      font-variant-numeric: tabular-nums;
    }

    .donut__share {
      text-align: right;
      color: oklch(58% 0.008 260);
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 720px) {
      :host {
        gap: 20px;
      }

      .donut__plot {
        width: 240px;
        height: 240px;
      }

      .donut__legend {
        flex-basis: 100%;
        max-width: none;
      }
    }
  `,
})
export class CostDonutComponent {
  readonly slices = input.required<DonutSlice[]>();
  readonly formatValue = input.required<(value: number) => string>();
  readonly formatShare = input.required<(fraction: number) => string>();
  readonly totalLabel = input<string>('Total');
  readonly ariaLabel = input<string>('');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly createChart = inject(DONUT_FACTORY);
  private chart: ChartHandle | null = null;

  /** Index of the slice under the cursor, or null. */
  private readonly hovered = signal<number | null>(null);

  protected readonly hoveredSlice = computed(() => {
    const index = this.hovered();
    return index === null ? null : (this.slices()[index] ?? null);
  });

  protected readonly centerLabel = computed(() => this.hoveredSlice()?.label ?? this.totalLabel());

  protected readonly centerValue = computed(
    () => this.hoveredSlice()?.value ?? this.slices().reduce((sum, slice) => sum + slice.value, 0),
  );

  constructor() {
    afterRenderEffect(() => {
      const config = this.buildConfig();
      this.hovered.set(null);
      this.chart?.destroy();
      this.chart = this.createChart(this.canvas().nativeElement, config);
    });

    inject(DestroyRef).onDestroy(() => {
      this.chart?.destroy();
      this.chart = null;
    });
  }

  private buildConfig(): ChartConfiguration<'doughnut'> {
    const slices = this.slices();

    return {
      type: 'doughnut',
      data: {
        labels: slices.map((slice) => slice.label),
        datasets: [
          {
            data: slices.map((slice) => slice.value),
            backgroundColor: slices.map((slice) => slice.color),
            borderColor: SURFACE,
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 200 },
        // Hover feedback is the figures in the hole (see the template), not a tooltip.
        onHover: (_event, active) => this.hovered.set(active[0]?.index ?? null),
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
    };
  }
}
