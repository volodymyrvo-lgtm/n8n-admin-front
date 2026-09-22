import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { catchError, EMPTY, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/**
 * Reacts to a 401 from the backend - an expired or otherwise invalid
 * token - by clearing the stored token and sending the user back to
 * /login, instead of letting it fall through as just a generic error
 * toast. This is the server-confirmed counterpart to the client-side
 * `exp` check in AuthService: that one catches an expired JWT before a
 * request is even made, this one catches whatever that check can't see
 * (a non-JWT token, one revoked early, clock drift, etc.).
 *
 * Registered last in app.config.ts's interceptor list so it sees the
 * raw response before errorToastInterceptor does, and swallows a 401 it
 * has handled (returns EMPTY instead of rethrowing) so that interceptor
 * doesn't *also* show its generic "something went wrong" toast on top
 * of the redirect.
 *
 * The login request is skipped - a 401 there just means wrong
 * credentials, which the login page already surfaces inline.
 */
export const authExpiryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/auth/login') || req.url.includes('/i18n/')) {
    return next(req);
  }

  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const translate = inject(TranslateService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
        toast.error(translate.instant('auth.sessionExpired'));
        router.navigateByUrl('/login');
        return EMPTY;
      }
      return throwError(() => error);
    }),
  );
};
