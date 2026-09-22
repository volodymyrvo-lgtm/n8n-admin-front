import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  let authServiceStub: { isAdmin: () => boolean };

  beforeEach(() => {
    authServiceStub = { isAdmin: () => false };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authServiceStub }],
    });
  });

  it('allows navigation when the current user is an admin', () => {
    authServiceStub.isAdmin = () => true;

    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));

    expect(result).toBe(true);
  });

  it('redirects to /rule-sets when the current user is not an admin', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));

    expect(result instanceof UrlTree).toBe(true);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/rule-sets');
  });
});
