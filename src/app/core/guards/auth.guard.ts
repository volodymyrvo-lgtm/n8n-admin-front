import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Blocks access to any route it guards unless the user is logged in
 * with a still-valid session, redirecting to /login otherwise. Calls
 * `checkSession()` rather than just reading `isAuthenticated()` so an
 * expired token is caught (and cleared) on every navigation, not only
 * at app startup.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.checkSession()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
