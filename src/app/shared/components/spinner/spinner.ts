import { Component, input } from '@angular/core';

/**
 * Generic loading spinner, meant to be dropped into any page's
 * "waiting for the server" branch:
 *
 *   @if (someService.loading()) {
 *     <app-spinner />
 *   } @else if (someService.items().length > 0) {
 *     ...data...
 *   } @else {
 *     <app-empty-state ... />
 *   }
 *
 * `size` controls the spinner's diameter in pixels; `label` is an
 * optional caption shown under it (also used as the accessible name).
 */
@Component({
  selector: 'app-spinner',
  imports: [],
  templateUrl: './spinner.html',
  styleUrl: './spinner.css',
})
export class SpinnerComponent {
  readonly size = input<number>(30);
  readonly label = input<string>('');
}
