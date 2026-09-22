import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { errorToastInterceptor } from './error-toast.interceptor';

describe('errorToastInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService()],
    });
  });

  function run(req: HttpRequest<unknown>, next: HttpHandlerFn): Promise<void> {
    return new Promise((resolve) => {
      TestBed.runInInjectionContext(() => errorToastInterceptor(req, next)).subscribe({
        next: () => resolve(),
        error: () => resolve(),
      });
    });
  }

  it('shows an error toast with the server message when a request fails', async () => {
    const toast = TestBed.inject(ToastService);
    const req = new HttpRequest('GET', '/api/jobs');
    const error = new HttpErrorResponse({ error: { message: 'Jobs are unavailable' }, status: 503 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    expect(toast.toasts()[0].type).toBe('error');
    expect(toast.toasts()[0].message).toBe('Jobs are unavailable');
  });

  it('falls back to a generic message when the server gives none', async () => {
    const toast = TestBed.inject(ToastService);
    const req = new HttpRequest('GET', '/api/jobs');
    const error = new HttpErrorResponse({ status: 500 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    const translate = TestBed.inject(TranslateService);
    expect(toast.toasts()[0].message).toBe(translate.instant('toast.genericError'));
  });

  it('does not toast for the login endpoint, which shows its own inline error', async () => {
    const toast = TestBed.inject(ToastService);
    const req = new HttpRequest('POST', 'http://localhost:3000/auth/login', {});
    const error = new HttpErrorResponse({ status: 401 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    expect(toast.toasts().length).toBe(0);
  });

  it('does not toast for translation file requests, which fail silently by design', async () => {
    const toast = TestBed.inject(ToastService);
    const req = new HttpRequest('GET', '/i18n/en.json');
    const error = new HttpErrorResponse({ status: 404 });
    const next: HttpHandlerFn = () => throwError(() => error);

    await run(req, next);

    expect(toast.toasts().length).toBe(0);
  });

  it('passes successful responses through untouched', async () => {
    const toast = TestBed.inject(ToastService);
    const req = new HttpRequest('GET', '/api/jobs');
    const next: HttpHandlerFn = () => of({} as HttpEvent<unknown>) as Observable<HttpEvent<unknown>>;

    await run(req, next);

    expect(toast.toasts().length).toBe(0);
  });
});
