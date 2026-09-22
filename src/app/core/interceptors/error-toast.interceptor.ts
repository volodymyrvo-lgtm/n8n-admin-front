import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/**
 * Shows an error toast for every failed HTTP request, so a failure is
 * always visible somewhere even if the calling code doesn't handle it
 * itself. The error still propagates - components that need to react
 * to it (disable a spinner, show a field-level message, etc.) still can.
 *
 * The login request is skipped: the login page already shows its own
 * inline "invalid credentials" message, so toasting it too would be
 * redundant. Static translation file requests (`/i18n/*.json`) are
 * skipped too - a failed asset load isn't worth an error toast, and the
 * toast's own text depends on those files having loaded successfully.
 * Add more `req.url` checks here for any other endpoint that handles
 * its own errors inline.
 */
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/auth/login') || req.url.includes('/i18n/')) {
    return next(req);
  }

  const toast = inject(ToastService);
  const translate = inject(TranslateService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const serverMessage = typeof error.error?.message === 'string' ? error.error.message : null;
      toast.error(serverMessage ?? translate.instant('toast.genericError'));
      return throwError(() => error);
    }),
  );
};
