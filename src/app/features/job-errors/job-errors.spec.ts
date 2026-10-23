import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { JobErrorsComponent } from './job-errors';

const API = 'http://localhost:3000';

const LOGS = {
  items: [
    {
      id: 'e1',
      jobId: 'j-seo',
      error: { message: 'missing ) after argument list', workflow: 'NEWCRM_PPLEN_SMS_Generation', failedNode: 'Resolve Onboarding Scenario2', executionId: '7014' },
      createdAt: '2026-10-21T19:28:24.813Z',
    },
    { id: 'e2', jobId: 'j-comm', error: { key1: 'value', key2: 'value2' }, createdAt: '2026-10-21T18:47:38.822Z' },
    { id: 'e3', jobId: 'j-gone', error: 'plain text failure', createdAt: '2026-10-21T17:00:00.000Z' },
  ],
  total: 23,
  page: 1,
  limit: 10,
};

const SEO_JOB = {
  id: 'j-seo', kind: 'seo', status: 'failed', language: 'AZ', llm: 'gpt_5_6_sol', prompt: 'AZ prompt-1', pageTask: 'R048 · Keno',
  runDate: '2026-10-21T19:20:00.000Z', steps: {}, spend: {}, ruleIds: [],
};
const COMM_JOB = {
  id: 'j-comm', kind: 'communication', status: 'success', jobType: 'sms', taskStatus: 'new', messageType: 'sms', board: 'ONBOARDING',
  taskDescription: 'Welcome message for new signups', llm: 'claude_sonnet_5', runDate: '2026-10-21T18:40:00.000Z', steps: {}, spend: {}, ruleIds: [],
};

describe('JobErrorsComponent', () => {
  let httpMock: HttpTestingController;

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [JobErrorsComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(JobErrorsComponent);
    fixture.detectChanges();
    const list = httpMock.expectOne((r) => r.url === `${API}/job-errors`);
    expect(list.request.params.get('page')).toBe('1');
    expect(list.request.params.get('limit')).toBe('10');
    list.flush(LOGS);
    httpMock.expectOne(`${API}/jobs/j-seo`).flush(SEO_JOB);
    httpMock.expectOne(`${API}/jobs/j-comm`).flush(COMM_JOB);
    httpMock.expectOne(`${API}/jobs/j-gone`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    return fixture;
  }

  const open = (fixture: Awaited<ReturnType<typeof setup>>, index: number) => {
    (fixture.nativeElement.querySelectorAll('.job-card__header')[index] as HTMLButtonElement).click();
    fixture.detectChanges();
    return fixture.nativeElement.querySelectorAll('.job-card')[index] as HTMLElement;
  };

  afterEach(() => httpMock.verify());

  it('renders a card per log: the workflow as its title and the failed node and message as its subtitle', async () => {
    const fixture = await setup();
    const el: HTMLElement = fixture.nativeElement;

    const titles = Array.from(el.querySelectorAll('.job-card__title')).map((n) => n.textContent?.trim());
    expect(titles).toEqual(['NEWCRM_PPLEN_SMS_Generation', 'jobErrors.unknownWorkflow', 'jobErrors.unknownWorkflow']);
    const subtitles = Array.from(el.querySelectorAll('.job-card__subtitle')).map((n) => n.textContent?.trim());
    expect(subtitles[0]).toBe('Resolve Onboarding Scenario2 · missing ) after argument list');
    expect(subtitles[1]).toBe('key1: value, key2: value2');
    expect(el.querySelector('app-paginator')).not.toBeNull();
  });

  it('shows the kind of job on the card once its details have loaded', async () => {
    const fixture = await setup();
    const badges = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="job-kind"]')).map((n) => n.textContent?.trim());
    expect(badges).toEqual(['jobErrors.kind.seo', 'jobErrors.kind.communication']);
  });

  it('expands a card to show the parsed error and the SEO job it belongs to', async () => {
    const fixture = await setup();
    const card = open(fixture, 0);

    expect(card.querySelector('[data-testid="error-message"]')?.textContent).toBe('missing ) after argument list');
    expect(card.textContent).toContain('NEWCRM_PPLEN_SMS_Generation');
    expect(card.textContent).toContain('Resolve Onboarding Scenario2');
    expect(card.textContent).toContain('7014');

    const job = card.querySelector('[data-testid="job-section"]') as HTMLElement;
    expect(job.textContent).toContain('j-seo');
    expect(job.textContent).toContain('R048 · Keno');
    expect(job.textContent).toContain('AZ');
    expect(job.textContent).toContain('gpt_5_6_sol');
    expect(job.textContent).toContain('jobs.status.failed');
  });

  it('shows every key of an unstructured error and the details of a Content job', async () => {
    const fixture = await setup();
    const card = open(fixture, 1);

    expect(card.querySelector('[data-testid="error-message"]')).toBeNull();
    expect(card.textContent).toContain('key1');
    expect(card.textContent).toContain('value2');

    const job = card.querySelector('[data-testid="job-section"]') as HTMLElement;
    expect(job.textContent).toContain('sms');
    expect(job.textContent).toContain('ONBOARDING');
    expect(job.textContent).toContain('Welcome message for new signups');
    expect(job.textContent).toContain('claude_sonnet_5');
  });

  it('treats a plain-text error as the message, and says so when the job was deleted', async () => {
    const fixture = await setup();
    const card = open(fixture, 2);

    expect(card.querySelector('[data-testid="error-message"]')?.textContent).toBe('plain text failure');
    expect(card.querySelector('[data-testid="job-missing"]')).not.toBeNull();
    expect(card.querySelector('[data-testid="job-section"]')?.textContent).toContain('j-gone');
  });

  it('copies the raw error as JSON', async () => {
    const fixture = await setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const card = open(fixture, 1);

    (card.querySelector('[data-testid="copy-error"]') as HTMLButtonElement).click();
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ key1: 'value', key2: 'value2' }, null, 2));
  });

  it('asks for the clicked page', async () => {
    const fixture = await setup();
    fixture.componentInstance['goToPage'](3);

    const req = httpMock.expectOne((r) => r.url === `${API}/job-errors`);
    expect(req.request.params.get('page')).toBe('3');
    req.flush({ ...LOGS, items: [], page: 3 });
  });

  it('shows the empty state when there are no logs', async () => {
    await TestBed.configureTestingModule({
      imports: [JobErrorsComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(JobErrorsComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush({ items: [], total: 0, page: 1, limit: 10 });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-empty-state')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.job-card')).toBeNull();
  });

  it('offers a retry when the logs fail to load', async () => {
    await TestBed.configureTestingModule({
      imports: [JobErrorsComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(JobErrorsComponent);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush('x', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('.err-alert') as HTMLElement;
    expect(alert).not.toBeNull();
    (alert.querySelector('button') as HTMLButtonElement).click();
    httpMock.expectOne((r) => r.url === `${API}/job-errors`).flush({ items: [], total: 0, page: 1, limit: 10 });
  });

  it('logs out and goes to /login', async () => {
    const fixture = await setup();
    const auth = TestBed.inject(AuthService);
    const logout = vi.spyOn(auth, 'logout');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['logout']();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('shows the details of a design job: kind badge, status, description and model', async () => {
    await TestBed.configureTestingModule({
      imports: [JobErrorsComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(JobErrorsComponent);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === `${API}/job-errors`)
      .flush({ items: [{ id: 'e9', jobId: 'j-design', error: { message: 'boom' }, createdAt: '2026-10-21T19:28:24.813Z' }], total: 1, page: 1, limit: 10 });
    httpMock.expectOne(`${API}/jobs/j-design`).flush({
      id: 'j-design', kind: 'design', status: 'failed', taskDescription: 'Autumn promo banner', llm: 'gpt_5_6_sol',
      runDate: '2026-10-21T19:20:00.000Z', steps: {}, spend: {}, tableUrl: null, runnedById: null,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="job-kind"]')?.textContent?.trim()).toBe('jobErrors.kind.design');
    const card = open(fixture as never, 0);
    const job = card.querySelector('[data-testid="job-section"]') as HTMLElement;
    expect(job.textContent).toContain('j-design');
    expect(job.textContent).toContain('Autumn promo banner');
    expect(job.textContent).toContain('gpt_5_6_sol');
    expect(job.textContent).toContain('jobs.status.failed');
  });
});
