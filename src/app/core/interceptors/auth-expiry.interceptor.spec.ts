import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { authExpiryInterceptor } from './auth-expiry.interceptor';

describe('authExpiryInterceptor', () => {
  let authServiceStub: { logout: () => void };

  beforeEach(() => {
    authServiceStub = { logout: () => {} };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
      ],
    });
  });

  function run(req: HttpRequest<unknown>, next: HttpHandlerFn): Promise<void> {
    return new Promise((resolve) => {
      TestBed.runInInjectionContext(() => authExpiryInterceptor(req, next)).subscribe({
        next: () => resolve(),
        error: () => resolve(),
        complete: () => resolve(),
      });
    });
  }

  it('logs out, toasts, and redirects to /login on a 401', async () => {
    const logoutSpy = vi.spyOn(authServiceStub, 'logout');
    const toast = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    const req = new HttpRequest('GET', '/api/jobs');
    const error = new HttpErrorResponse({ status: 401 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
    const translate = TestBed.inject(TranslateService);
    expect(toast.toasts()[0]?.message).toBe(translate.instant('auth.sessionExpired'));
  });

  it('leaves other error statuses untouched, for errorToastInterceptor to handle', async () => {
    const logoutSpy = vi.spyOn(authServiceStub, 'logout');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    const req = new HttpRequest('GET', '/api/jobs');
    const error = new HttpErrorResponse({ status: 500 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    expect(logoutSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not react to a 401 from the login endpoint itself', async () => {
    const logoutSpy = vi.spyOn(authServiceStub, 'logout');
    const req = new HttpRequest('POST', 'http://localhost:3000/auth/login', {});
    const error = new HttpErrorResponse({ status: 401 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('passes successful responses through untouched', async () => {
    const logoutSpy = vi.spyOn(authServiceStub, 'logout');
    const req = new HttpRequest('GET', '/api/jobs');
    const next: HttpHandlerFn = () => of({} as HttpEvent<unknown>) as Observable<HttpEvent<unknown>>;

    await run(req, next);

    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
