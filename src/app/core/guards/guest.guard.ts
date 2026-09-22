import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Keeps a logged-in user off guest-only routes (the login page),
 * redirecting them to the home page instead. Uses `checkSession()` so
 * that an expired token is cleared here too - otherwise someone whose
 * session expired while away could be stuck unable to reach /login
 * until they were kicked there some other way first.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.checkSession()) {
    return true;
  }

  return router.createUrlTree(['/']);
};
