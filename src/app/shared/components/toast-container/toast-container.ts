import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

/**
 * Renders whatever is currently in `ToastService.toasts`. Mounted once
 * in the root component so it sits above every route (including
 * /login) and survives navigation between pages.
 */
@Component({
  selector: 'app-toast-container',
  imports: [],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.css',
})
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService);
}
