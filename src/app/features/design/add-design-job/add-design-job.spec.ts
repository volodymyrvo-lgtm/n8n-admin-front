import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { DESIGN_WEBHOOK_URLS } from '../../../core/services/design-jobs.service';
import { ToastService } from '../../../core/services/toast.service';
import { AddDesignJobComponent } from './add-design-job';

const API = 'http://localhost:3000';
const LIVE_URL = 'https://n8n.example/webhook/design';
const TEST_URL = 'https://n8n.example/webhook-test/design';

function createdJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'design-1',
    kind: 'design',
    steps: { step1: { status: 'pending' } },
    status: 'pending',
    runDate: '2026-10-14T12:30:00.000Z',
    createdAt: '2026-10-14T12:30:00.000Z',
    updatedAt: '2026-10-14T12:30:00.000Z',
    runnedById: 'user-1',
    llm: null,
    spend: {},
    tableUrl: null,
    taskDescription: 'Autumn promo banner',
    ...overrides,
  };
}

describe('AddDesignJobComponent', () => {
  let httpMock: HttpTestingController;

  function setup(webhooks: { live: string; test: string } = { live: LIVE_URL, test: TEST_URL }) {
    TestBed.configureTestingModule({
      imports: [AddDesignJobComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DESIGN_WEBHOOK_URLS, useValue: webhooks },
        { provide: AuthService, useValue: { getToken: () => 't' } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    // The /design/jobs route doesn't exist in these tests - never really navigate.
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AddDesignJobComponent);
    fixture.detectChanges();
    return fixture;
  }

  function fill(fixture: ReturnType<typeof setup>, taskDescription: string) {
    const control = (fixture.nativeElement as HTMLElement).querySelector('#designTaskDescription') as HTMLTextAreaElement;
    control.value = taskDescription;
    control.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(fixture: ReturnType<typeof setup>) {
    fixture.componentInstance.submit();
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('is made of the task description and the testing toggle - nothing else', () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('textarea, select, input[type="text"]').length).toBe(1);
    expect(el.querySelector('#designTaskDescription')).not.toBeNull();
    expect(el.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it('does not submit an empty or whitespace-only description and shows the error', () => {
    const fixture = setup();
    submit(fixture);
    httpMock.expectNone(`${API}/jobs/design`);
    expect(fixture.nativeElement.querySelectorAll('.form__error').length).toBe(1);

    fill(fixture, '   ');
    submit(fixture);
    httpMock.expectNone(`${API}/jobs/design`);
  });

  it('rejects a description over the limit but accepts exactly the limit', () => {
    const fixture = setup();
    const max = fixture.componentInstance['taskDescriptionMaxLength'];

    fill(fixture, 'x'.repeat(max + 1));
    submit(fixture);
    httpMock.expectNone(`${API}/jobs/design`);

    fill(fixture, 'x'.repeat(max));
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/design`).flush(createdJob());
    httpMock.expectOne(LIVE_URL).flush({});
  });

  it('POSTs exactly {taskDescription} to the backend, then the same body plus jobId to the live webhook', () => {
    const fixture = setup();
    const navigateSpy = vi.mocked(TestBed.inject(Router).navigateByUrl);
    const toast = TestBed.inject(ToastService);

    fill(fixture, '  Autumn promo banner  ');
    submit(fixture);

    const req = httpMock.expectOne(`${API}/jobs/design`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ taskDescription: 'Autumn promo banner' });
    req.flush(createdJob());

    const hook = httpMock.expectOne(LIVE_URL);
    expect(hook.request.body).toEqual({ taskDescription: 'Autumn promo banner', jobId: 'design-1' });
    hook.flush({});

    expect(navigateSpy).toHaveBeenCalledWith('/design/jobs');
    expect(toast.toasts().some((t) => t.type === 'success')).toBe(true);
  });

  it('uses the test webhook when the testing toggle is on, without sending the toggle anywhere', () => {
    const fixture = setup();
    fill(fixture, 'Autumn promo banner');
    fixture.componentInstance['form'].controls.isTesting.setValue(true);
    submit(fixture);

    const req = httpMock.expectOne(`${API}/jobs/design`);
    expect(req.request.body).not.toHaveProperty('isTesting');
    req.flush(createdJob());
    const hook = httpMock.expectOne(TEST_URL);
    expect(hook.request.body).not.toHaveProperty('isTesting');
    hook.flush({});
  });

  it('still creates the job and warns when the design webhook is not configured', () => {
    const fixture = setup({ live: '', test: '' });
    const toast = TestBed.inject(ToastService);

    fill(fixture, 'Autumn promo banner');
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/design`).flush(createdJob());

    expect(toast.toasts().some((t) => t.type === 'error')).toBe(true);
  });

  it('shows an error toast when the n8n trigger fails but the job was saved', () => {
    const fixture = setup();
    const toast = TestBed.inject(ToastService);

    fill(fixture, 'Autumn promo banner');
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/design`).flush(createdJob());
    httpMock.expectOne(LIVE_URL).flush('boom', { status: 500, statusText: 'Server Error' });

    expect(toast.toasts().some((t) => t.type === 'error')).toBe(true);
  });

  it('re-enables the form after a backend error and does not call the webhook', () => {
    const fixture = setup();
    const navigateSpy = vi.mocked(TestBed.inject(Router).navigateByUrl);

    fill(fixture, 'Autumn promo banner');
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/design`).flush({ message: ['bad'] }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance['submitting']()).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first request is in flight', () => {
    const fixture = setup();

    fill(fixture, 'Autumn promo banner');
    submit(fixture);
    submit(fixture);

    httpMock.expectOne(`${API}/jobs/design`).flush(createdJob());
    httpMock.expectOne(LIVE_URL).flush({});
  });
});
