import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { DesignJobRun } from '../../../core/models/job.model';
import { DesignJobListComponent } from './design-job-list';

const API = 'http://localhost:3000';

const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = { on: vi.fn(), disconnect: vi.fn() };
  return { mockSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function makeJob(overrides: Partial<DesignJobRun> = {}): DesignJobRun {
  return {
    id: 'design-1',
    kind: 'design',
    steps: { step1: { status: 'success' }, step2: { status: 'pending' } },
    status: 'pending',
    runDate: '2026-10-14T12:30:00.000Z',
    createdAt: '2026-10-14T12:30:00.000Z',
    updatedAt: '2026-10-14T12:30:00.000Z',
    runnedById: 'user-1',
    llm: null,
    spend: { gpt_5_6_sol: 0.5 },
    tableUrl: null,
    taskDescription: 'Autumn promo banner, 1200x628',
    ...overrides,
  };
}

describe('DesignJobListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    ioMock.mockClear();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();

    await TestBed.configureTestingModule({
      imports: [DesignJobListComponent],
      providers: [provideTranslateService(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createAndLoad(items: DesignJobRun[], options: { total?: number } = {}) {
    const fixture = TestBed.createComponent(DesignJobListComponent);
    fixture.detectChanges();

    const jobsReq = httpMock.expectOne((r) => r.url === `${API}/jobs`);
    expect(jobsReq.request.params.get('kind')).toBe('design');
    expect(jobsReq.request.params.get('page')).toBe('1');
    expect(jobsReq.request.params.get('limit')).toBe('10');
    jobsReq.flush({ items, total: options.total ?? items.length, page: 1, limit: 10 });

    httpMock.expectOne(`${API}/users`).flush([{ id: 'user-1', username: 'ada.lovelace', role: 'admin' }]);

    fixture.detectChanges();
    return fixture;
  }

  it('renders a card per design job with the task description as its title', () => {
    const fixture = createAndLoad([makeJob(), makeJob({ id: 'design-2', taskDescription: 'Winter banner', llm: 'gpt_5_6_sol' })]);
    const el: HTMLElement = fixture.nativeElement;

    const titles = Array.from(el.querySelectorAll('.job-card__title')).map((node) => node.textContent?.trim());
    expect(titles).toEqual(['Autumn promo banner, 1200x628', 'Winter banner']);
    const subtitles = Array.from(el.querySelectorAll('.job-card__subtitle')).map((node) => node.textContent ?? '');
    expect(subtitles[1]).toContain('gpt_5_6_sol');
    expect(subtitles[0]).not.toContain('·');
  });

  it('expands a card to show the full description, runner and spend', () => {
    const fixture = createAndLoad([makeJob()]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('.job-card__body')).toBeNull();
    (el.querySelector('.job-card__header') as HTMLButtonElement).click();
    fixture.detectChanges();

    const body = el.querySelector('.job-card__body');
    expect(body?.querySelector('[data-testid="task-description"]')?.textContent?.trim()).toBe('Autumn promo banner, 1200x628');
    expect(body?.textContent).toContain('ada.lovelace');
    expect(body?.textContent).toContain('$0.50');
  });

  it('shows the table link only when tableUrl is set', () => {
    const fixture = createAndLoad([makeJob({ tableUrl: 'https://docs.example/t' })]);
    const el: HTMLElement = fixture.nativeElement;

    (el.querySelector('.job-card__header') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.job-card__table-link')?.getAttribute('href')).toBe('https://docs.example/t');
  });

  it('shows the empty state when there are no design jobs', () => {
    const fixture = createAndLoad([]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('app-empty-state')).not.toBeNull();
    expect(el.querySelector('.job-card')).toBeNull();
  });

  it('links to the new design job form', () => {
    const fixture = createAndLoad([]);
    expect(fixture.nativeElement.querySelector('a.page-btn')?.getAttribute('href')).toBe('/design/jobs/new');
  });

  it('loads the requested page through the paginator', () => {
    const fixture = createAndLoad([makeJob()], { total: 25 });
    fixture.componentInstance['goToPage'](2);

    const req = httpMock.expectOne((r) => r.url === `${API}/jobs`);
    expect(req.request.params.get('kind')).toBe('design');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [makeJob({ id: 'design-11' })], total: 25, page: 2, limit: 10 });
    expect(fixture.componentInstance['totalPages']()).toBe(3);
  });

  it('connects to the jobs websocket on init and disconnects on destroy', () => {
    const fixture = createAndLoad([]);
    expect(ioMock).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
