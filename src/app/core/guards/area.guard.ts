import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessArea } from '../access';
import { AuthService } from '../services/auth.service';

/**
 * Lets a route through only for a role that can open at least one of the
 * given areas (see access.ts); anyone else - a reader on the dashboard, an
 * analyst on the jobs - is sent to the page their role does have, rather
 * than to /login: they're signed in, they just can't open this part.
 */
export function areaGuard(...areas: AccessArea[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    if (areas.some((area) => authService.canAccess(area))) {
      return true;
    }
    return inject(Router).createUrlTree([authService.homeUrl()]);
  };
}
