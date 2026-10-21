import { Component, input, output } from '@angular/core';

/**
 * The small "eye" button that sits right next to an entity's name in a
 * list and opens its read-only view (see ViewModalComponent). Visible to
 * every user - looking at what's inside doesn't need the admin role.
 */
@Component({
  selector: 'app-view-button',
  template: `
    <button type="button" class="view-btn" [attr.aria-label]="label()" [title]="label()" (click)="opened.emit(); $event.stopPropagation()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }

    .view-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: oklch(55% 0.008 260);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .view-btn:hover {
      background: oklch(26% 0.015 260);
      color: var(--accent);
    }

    .view-btn:focus-visible {
      outline: 2px solid color-mix(in oklch, var(--accent) 60%, transparent);
      outline-offset: 1px;
    }
  `,
})
export class ViewButtonComponent {
  /** Accessible name and tooltip, e.g. "View contents". */
  readonly label = input.required<string>();
  readonly opened = output<void>();
}
