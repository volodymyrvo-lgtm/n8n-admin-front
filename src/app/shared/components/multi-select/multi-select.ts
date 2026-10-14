import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * A compact multi-select: one button (label + how many are picked) that
 * opens a checklist. Replaces a wall of toggle chips when a filter has
 * many values.
 *
 * Purely presentational and controlled: it renders `selected` and tells
 * the parent what happened (`toggled` with a value, or `cleared`); the
 * parent owns the state.
 */
@Component({
  selector: 'app-multi-select',
  imports: [],
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.css',
})
export class MultiSelectComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly MultiSelectOption[]>();
  readonly selected = input<readonly string[]>([]);
  /** Text of the "clear selection" button inside the open list. */
  readonly clearLabel = input<string>('Clear');
  /** Which edge of the button the open list lines up with - `end` for a filter near the right edge, whose wide list would otherwise run off-screen. */
  readonly panelAlign = input<'start' | 'end'>('start');

  readonly toggled = output<string>();
  readonly cleared = output<void>();

  protected readonly open = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Labels of the picked options, for the button's tooltip (so a selection is readable without opening the list). */
  protected selectedSummary(): string {
    const picked = new Set(this.selected());
    return this.options()
      .filter((option) => picked.has(option.value))
      .map((option) => option.label)
      .join(', ');
  }

  protected isSelected(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggleOpen(): void {
    this.open.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('keydown.escape')
  protected onEscape(): void {
    if (this.open()) {
      this.open.set(false);
      this.host.nativeElement.querySelector('button')?.focus();
    }
  }
}
