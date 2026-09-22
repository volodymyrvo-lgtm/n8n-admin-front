import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;

/**
 * Global toast notifications - inject `ToastService` and call
 * `success`/`error`/`info` from any component or service, no matter
 * where in the app you are. `<app-toast-container>` (mounted once in
 * the root component) renders whatever ends up in `toasts`.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  success(message: string): void {
    this.push('success', message, DEFAULT_DURATION_MS);
  }

  error(message: string): void {
    this.push('error', message, ERROR_DURATION_MS);
  }

  info(message: string): void {
    this.push('info', message, DEFAULT_DURATION_MS);
  }

  /** Removes a toast immediately - used by the auto-dismiss timer and the container's close button. */
  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private push(type: ToastType, message: string, durationMs: number): void {
    const id = ++this.nextId;
    this.toasts.update((toasts) => [...toasts, { id, type, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }
}
