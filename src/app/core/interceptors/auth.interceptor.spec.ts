import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { of, Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let authServiceStub: { getToken: () => string | null };

  beforeEach(() => {
    authServiceStub = { getToken: () => null };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authServiceStub }],
    });
  });

  function run(req: HttpRequest<unknown>): HttpRequest<unknown> {
    let seen!: HttpRequest<unknown>;
    const next: HttpHandlerFn = (r): Observable<HttpEvent<unknown>> => {
      seen = r;
      return of({} as HttpEvent<unknown>);
    };

    TestBed.runInInjectionContext(() => authInterceptor(req, next));
    return seen;
  }

  it('adds an Authorization header when a token is stored', () => {
    authServiceStub.getToken = () => 'abc123';

    const seen = run(new HttpRequest('GET', '/api/jobs'));

    expect(seen.headers.get('Authorization')).toBe('Bearer abc123');
  });

  it('leaves the request untouched when there is no token', () => {
    const original = new HttpRequest('GET', '/api/jobs');

    const seen = run(original);

    expect(seen.headers.has('Authorization')).toBe(false);
    expect(seen).toBe(original);
  });

  it('does not attach a token to translation file requests, even when one is stored', () => {
    authServiceStub.getToken = () => 'abc123';
    const original = new HttpRequest('GET', '/i18n/en.json');

    const seen = run(original);

    expect(seen.headers.has('Authorization')).toBe(false);
    expect(seen).toBe(original);
  });
});
