import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the stored auth token to every outgoing request as an
 * `Authorization: Bearer <token>` header. Requests fire without it when
 * there is no token yet (e.g. the login request itself), or when the
 * request is for a static file (a translation or an email template) - those
 * aren't API calls and don't need one.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/i18n/') || req.url.includes('/email-templates/')) {
    return next(req);
  }

  const token = inject(AuthService).getToken();

  if (!token) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
