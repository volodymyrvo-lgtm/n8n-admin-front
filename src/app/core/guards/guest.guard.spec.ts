import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { guestGuard } from './guest.guard';

describe('guestGuard', () => {
  let authServiceStub: { checkSession: () => boolean };

  beforeEach(() => {
    authServiceStub = { checkSession: () => false };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceStub }],
    });
  });

  it('allows navigation when there is no valid session', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('redirects to / when the session is still valid', () => {
    authServiceStub.checkSession = () => true;

    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));

    expect(result instanceof UrlTree).toBe(true);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });
});
