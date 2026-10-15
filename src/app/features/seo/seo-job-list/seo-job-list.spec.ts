import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { SeoJobRun } from '../../../core/models/job.model';
import { SeoJobListComponent } from './seo-job-list';

const API = 'http://localhost:3000';

const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = { on: vi.fn(), disconnect: vi.fn() };
  return { mockSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function makeSeoJob(overrides: Partial<SeoJobRun> = {}): SeoJobRun {
  return {
    id: 'seo-1',
    kind: 'seo',
    steps: { step1: { status: 'success' }, step2: { status: 'pending' } },
    status: 'pending',
    runDate: '2026-10-14T12:30:00.000Z',
    createdAt: '2026-10-14T12:30:00.000Z',
    updatedAt: '2026-10-14T12:30:00.000Z',
    runnedById: 'user-1',
    llm: 'gpt_5_6_sol',
    spend: { gpt_5_6_sol: 0.5 },
    tableUrl: null,
    language: 'EN',
    prompt: 'EN prompt-1',
    pageTask: 'R048 · Кено',
    jobType: null,
    taskStatus: null,
    messageType: null,
    board: null,
    taskDescription: null,
    ruleIds: [],
    sm: null,
    glossaryId: null,
    ...overrides,
  };
}

describe('SeoJobListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    ioMock.mockClear();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();

    await TestBed.configureTestingModule({
      imports: [SeoJobListComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createAndLoad(items: SeoJobRun[], options: { total?: number } = {}) {
    const fixture = TestBed.createComponent(SeoJobListComponent);
    fixture.detectChanges();

    const jobsReq = httpMock.expectOne((r) => r.url === `${API}/jobs`);
    expect(jobsReq.request.params.get('kind')).toBe('seo');
    expect(jobsReq.request.params.get('page')).toBe('1');
    expect(jobsReq.request.params.get('limit')).toBe('10');
    jobsReq.flush({ items, total: options.total ?? items.length, page: 1, limit: 10 });

    httpMock.expectOne(`${API}/users`).flush([{ id: 'user-1', username: 'ada.lovelace', role: 'admin' }]);
    const promptsReq = httpMock.expectOne((r) => r.url === `${API}/prompts`);
    expect(promptsReq.request.params.get('kind')).toBe('seo');
    promptsReq.flush([{ id: 'prompt-1', name: 'Keno landing', content: 'x', createdAt: '', updatedAt: '' }]);

    const rulesReq = httpMock.expectOne((r) => r.url === `${API}/rules`);
    expect(rulesReq.request.params.get('kind')).toBe('seo');
    rulesReq.flush([{ id: 'rule-1', ruleName: 'SEO tone', ruleSet: {}, setType: ['email'], kind: 'seo' }]);

    fixture.detectChanges();
    return fixture;
  }

  it('renders a card per SEO job with the page task as its title and language · model as subtitle', () => {
    const fixture = createAndLoad([makeSeoJob(), makeSeoJob({ id: 'seo-2', pageTask: 'R049', language: 'AZ' })]);
    const el: HTMLElement = fixture.nativeElement;

    const titles = Array.from(el.querySelectorAll('.job-card__title')).map((node) => node.textContent?.trim());
    expect(titles).toEqual(['R048 · Кено', 'R049']);
    expect(el.querySelector('.job-card__subtitle')?.textContent?.trim()).toBe('EN · gpt_5_6_sol');
  });

  it('expands a card to show runner, prompt name and spend', () => {
    const fixture = createAndLoad([makeSeoJob()]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.job-card__body')).toBeNull();
    (el.querySelector('.job-card__header') as HTMLButtonElement).click();
    fixture.detectChanges();

    const body = el.querySelector('.job-card__body');
    expect(body?.textContent).toContain('ada.lovelace');
    expect(body?.querySelector('.job-card__prompt')?.textContent?.trim()).toBe('Keno landing');
    expect(body?.querySelector('.job-card__prompt')?.getAttribute('title')).toBe('EN prompt-1');
    expect(body?.textContent).toContain('$0.50');
  });

  it('lists the job\'s rule sets by name, linking to the SEO rule form, or a note when it has none', () => {
    const fixture = createAndLoad([makeSeoJob({ ruleIds: ['rule-1', 'gone'] }), makeSeoJob({ id: 'seo-2', ruleIds: [] })]);
    const el: HTMLElement = fixture.nativeElement;

    const headers = el.querySelectorAll<HTMLButtonElement>('.job-card__header');
    headers[0].click();
    headers[1].click();
    fixture.detectChanges();

    const links = Array.from(el.querySelectorAll('.job-card__rule-link'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(['SEO tone', 'gone']);
    expect(links[0].getAttribute('href')).toBe('/seo/rule-sets/rule-1/edit');
    expect(el.querySelectorAll('.job-card__empty-note').length).toBe(1);
  });

  it('falls back to the raw prompt string when the prompt cannot be found', () => {
    const fixture = createAndLoad([makeSeoJob({ prompt: 'EN unknown-id' })]);
    const el: HTMLElement = fixture.nativeElement;

    (el.querySelector('.job-card__header') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.job-card__prompt')?.textContent?.trim()).toBe('EN unknown-id');
  });

  it('shows the table link only when tableUrl is set', () => {
    const fixture = createAndLoad([makeSeoJob({ tableUrl: 'https://docs.example/t' })]);
    const el: HTMLElement = fixture.nativeElement;

    (el.querySelector('.job-card__header') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.job-card__table-link')?.getAttribute('href')).toBe('https://docs.example/t');
  });

  it('shows the empty state when there are no SEO jobs', () => {
    const fixture = createAndLoad([]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('app-empty-state')).not.toBeNull();
    expect(el.querySelector('.job-card')).toBeNull();
  });

  it('links to the new SEO job form', () => {
    const fixture = createAndLoad([]);
    expect(fixture.nativeElement.querySelector('a.page-btn')?.getAttribute('href')).toBe('/seo/jobs/new');
  });

  it('loads the requested page through the paginator', () => {
    const fixture = createAndLoad([makeSeoJob()], { total: 25 });
    fixture.componentInstance['goToPage'](2);

    const req = httpMock.expectOne((r) => r.url === `${API}/jobs`);
    expect(req.request.params.get('kind')).toBe('seo');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [makeSeoJob({ id: 'seo-11' })], total: 25, page: 2, limit: 10 });
    expect(fixture.componentInstance['totalPages']()).toBe(3);
  });

  it('connects to the jobs websocket on init and disconnects on destroy', () => {
    const fixture = createAndLoad([]);
    expect(ioMock).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
