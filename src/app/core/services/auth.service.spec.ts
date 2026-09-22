import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

/** Builds a fake (unsigned) JWT with the given payload, for expiry tests. */
function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_');
  return `${base64url({ alg: 'none' })}.${base64url(payload)}.`;
}

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  // AuthService reads localStorage in its constructor (to seed
  // `isAuthenticated`), so tests that care about that startup value set
  // localStorage *before* calling TestBed.inject(AuthService) - which is
  // why the service isn't pre-injected here the way httpMock is.
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unauthenticated when there is no stored token', () => {
    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBe(false);
  });

  it('stores the token and user, and flips to authenticated, on successful login', () => {
    const service = TestBed.inject(AuthService);
    service.login({ username: 'a@royale.az', password: 'secret1' }).subscribe();

    const req = httpMock.expectOne('http://localhost:3000/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({ accessToken: 'abc123', user: { id: '1', username: 'a@royale.az', role: 'admin' } });

    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('auth_token')).toBe('abc123');
    expect(service.currentUser()).toEqual({ id: '1', username: 'a@royale.az', role: 'admin' });
    expect(service.isAdmin()).toBe(true);
  });

  it('stays unauthenticated when the login request fails', () => {
    const service = TestBed.inject(AuthService);
    service.login({ username: 'a@royale.az', password: 'wrong' }).subscribe({ error: () => {} });

    const req = httpMock.expectOne('http://localhost:3000/auth/login');
    req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.isAuthenticated()).toBe(false);
  });

  it('clears the token and flips to unauthenticated on logout', () => {
    localStorage.setItem('auth_token', 'abc123');
    const service = TestBed.inject(AuthService);
    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('isAdmin reflects the current user\'s role and is false while logged out', () => {
    const service = TestBed.inject(AuthService);
    expect(service.isAdmin()).toBe(false);

    service.login({ username: 'a@royale.az', password: 'secret1' }).subscribe();
    httpMock
      .expectOne('http://localhost:3000/auth/login')
      .flush({ accessToken: 'abc123', user: { id: '2', username: 'a@royale.az', role: 'user' } });

    expect(service.isAdmin()).toBe(false);

    service.logout();
    expect(service.isAdmin()).toBe(false);
  });

  it('treats a non-JWT token as never expiring (nothing to check client-side)', () => {
    localStorage.setItem('auth_token', 'abc123');
    const service = TestBed.inject(AuthService);

    expect(service.checkSession()).toBe(true);
    expect(localStorage.getItem('auth_token')).toBe('abc123');
  });

  it('starts authenticated when a stored JWT has not expired yet', () => {
    localStorage.setItem('auth_token', fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBe(true);
  });

  it('starts unauthenticated and clears an already-expired stored JWT', () => {
    localStorage.setItem('auth_token', fakeJwt({ exp: Math.floor(Date.now() / 1000) - 60 }));
    const service = TestBed.inject(AuthService);

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('checkSession clears an expired token and flips isAuthenticated even if it was true at startup', () => {
    localStorage.setItem('auth_token', fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(true);

    // The token expires while the app is sitting open on a page - simulate
    // that by overwriting it with an already-expired one, then re-check.
    localStorage.setItem('auth_token', fakeJwt({ exp: Math.floor(Date.now() / 1000) - 60 }));

    expect(service.checkSession()).toBe(false);
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});
