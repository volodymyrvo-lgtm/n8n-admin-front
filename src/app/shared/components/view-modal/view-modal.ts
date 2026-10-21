import { AfterViewInit, Component, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * A read-only modal that shows what's inside an entity (a rule set, a
 * prompt, a glossary, ...) - the body is projected, so each list brings
 * its own content. Closes on the X button, a click on the backdrop and
 * Escape. If `copyText` is set it also offers a "Copy" button for it.
 *
 * Purely presentational: the parent owns whether it is shown (render it
 * with `@if`) and reacts to `closed`.
 */
@Component({
  selector: 'app-view-modal',
  imports: [TranslatePipe],
  templateUrl: './view-modal.html',
  styleUrl: './view-modal.css',
})
export class ViewModalComponent implements AfterViewInit {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  /** When set, a "Copy" button copies this text to the clipboard. */
  readonly copyText = input<string | null>(null);

  readonly closed = output<void>();

  protected readonly copied = signal(false);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly previouslyFocused = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);

  ngAfterViewInit(): void {
    this.closeButton()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close();
  }

  protected onBackdropMouseDown(event: MouseEvent): void {
    // Only a press on the backdrop itself - not a drag that ends there after starting inside the panel.
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  protected close(): void {
    this.closed.emit();
    this.previouslyFocused?.focus?.();
  }

  protected async copy(): Promise<void> {
    const text = this.copyText();
    if (text === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context / denied) - nothing useful to do.
    }
  }
}
