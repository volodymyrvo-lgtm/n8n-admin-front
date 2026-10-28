import { AfterViewInit, Component, computed, ElementRef, HostListener, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * A confirmation dialog for an irreversible action. With `requiredText` the
 * confirm button stays disabled until that word has been typed in (compared
 * after trimming, case-sensitively) - for the "delete everything" kind of
 * action where a stray click must not be enough.
 *
 * Purely presentational: the parent shows it with `@if`, runs the action on
 * `confirmed` and sets `busy` while that runs (the dialog can't be dismissed
 * or confirmed twice meanwhile), and removes it on `cancelled` or when done.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [TranslatePipe],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialogComponent implements AfterViewInit {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  /** When set, this word has to be typed before confirming. */
  readonly requiredText = input<string | null>(null);
  readonly busy = input<boolean>(false);
  /** `danger` (red, the default) for destructive actions, `primary` for ones that only need a second look. */
  readonly tone = input<'danger' | 'primary'>('danger');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly typed = signal('');
  private readonly typedInput = viewChild<ElementRef<HTMLElement>>('typedInput');
  private readonly cancelButton = viewChild<ElementRef<HTMLElement>>('cancelButton');

  protected readonly canConfirm = computed(() => {
    const required = this.requiredText();
    return !this.busy() && (required === null || this.typed().trim() === required);
  });

  ngAfterViewInit(): void {
    // The word to type comes first when there is one; otherwise the safe choice (cancel) has the focus.
    (this.typedInput() ?? this.cancelButton())?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.cancel();
  }

  protected onBackdropMouseDown(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  protected onInput(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  protected cancel(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }

  protected confirm(): void {
    if (this.canConfirm()) {
      this.confirmed.emit();
    }
  }
}
