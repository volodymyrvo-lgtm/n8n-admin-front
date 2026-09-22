import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { JobRun } from '../../../core/models/job.model';
import { JobsService } from '../../../core/services/jobs.service';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { UsersService } from '../../../core/services/users.service';
import { JobListComponent } from './job-list';

// JobListComponent connects to the jobs websocket on init and disconnects
// on destroy (see JobsService.connectJobUpdates/disconnectJobUpdates) -
// stub socket.io-client so these tests never attempt a real connection.
const { mockSocket, ioMock } = vi.hoisted(() => {
  const socket = { on: vi.fn(), disconnect: vi.fn() };
  return { mockSocket: socket, ioMock: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({
  io: ioMock,
}));

function makeRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: '1',
    steps: { step1: { status: 'success' }, step2: { status: 'success' } },
    jobType: 'email',
    taskStatus: 'new',
    messageType: 'email',
    board: 'ONBOARDING',
    taskDescription: 'id 2',
    status: 'success',
    runDate: '2026-09-10T17:06:05.331Z',
    createdAt: '2026-09-10T17:05:31.419Z',
    updatedAt: '2026-09-10T17:06:19.640Z',
    runnedById: 'user-1',
    ruleIds: ['rule-1'],
    ...overrides,
  };
}

describe('JobListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    ioMock.mockClear();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();

    await TestBed.configureTestingModule({
      imports: [JobListComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createAndLoad(runs: JobRun[]): { fixture: ReturnType<typeof TestBed.createComponent> } {
    const fixture = TestBed.createComponent(JobListComponent);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/jobs').flush(runs);
    httpMock.expectOne('http://localhost:3000/users').flush([{ id: 'user-1', username: 'ada.lovelace', role: 'admin' }]);
    httpMock
      .expectOne('http://localhost:3000/rules')
      .flush([{ id: 'rule-1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] }]);
    fixture.detectChanges();
    return { fixture };
  }

  it('shows the empty state when there are no job runs', () => {
    const { fixture } = createAndLoad([]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-empty-state')).toBeTruthy();
    expect(el.querySelector('.job-card')).toBeNull();
  });

  it('shows a card per job run, with the overall status reflected in the border', () => {
    const { fixture } = createAndLoad([makeRun({ id: '1', status: 'success' }), makeRun({ id: '2', status: 'failed' })]);

    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.job-card');
    expect(cards.length).toBe(2);
    expect(cards[0].classList).toContain('job-card--success');
    expect(cards[1].classList).toContain('job-card--failed');
  });

  it('expands a card to reveal who ran it and the linked rule sets, and collapses again', () => {
    const { fixture } = createAndLoad([makeRun()]);

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.job-card__body')).toBeNull();

    const header = el.querySelector('.job-card__header') as HTMLButtonElement;
    header.click();
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ada.lovelace');
    const ruleLink = el.querySelector('.job-card__rule-link') as HTMLAnchorElement;
    expect(ruleLink.textContent?.trim()).toBe('Default routing');
    expect(ruleLink.getAttribute('href')).toBe('/rule-sets/rule-1/edit');

    header.click();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.job-card__body')).toBeNull();
  });

  it('filters by job type', () => {
    const { fixture } = createAndLoad([
      makeRun({ id: '1', jobType: 'email', taskDescription: 'Email run' }),
      makeRun({ id: '2', jobType: 'sms', taskDescription: 'SMS run' }),
    ]);

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.job-card').length).toBe(2);

    const smsChip = Array.from(el.querySelectorAll('.type-filter__chip')).find(
      (chip) => chip.textContent?.trim() === 'sms',
    ) as HTMLButtonElement;
    smsChip.click();
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.job-card').length).toBe(1);
    expect(el.textContent).toContain('SMS run');
    expect(el.textContent).not.toContain('Email run');
  });

  it('filters by the user who ran the job', () => {
    const { fixture } = createAndLoad([
      makeRun({ id: '1', runnedById: 'user-1', taskDescription: 'Run by ada' }),
      makeRun({ id: '2', runnedById: 'user-2', taskDescription: 'Run by grace' }),
    ]);

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.job-card').length).toBe(2);

    const userChip = Array.from(el.querySelectorAll('.type-filter__chip')).find(
      (chip) => chip.textContent?.trim() === 'ada.lovelace',
    ) as HTMLButtonElement;
    userChip.click();
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.job-card').length).toBe(1);
    expect(el.textContent).toContain('Run by ada');
    expect(el.textContent).not.toContain('Run by grace');
  });

  it('connects to live job updates on init and disconnects when the page is left', () => {
    const { fixture } = createAndLoad([makeRun()]);

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(mockSocket.on).toHaveBeenCalledWith('job.updated', expect.any(Function));

    fixture.destroy();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reflects a job.updated event pushed over the socket without a page reload', () => {
    const { fixture } = createAndLoad([makeRun({ id: '1', status: 'pending' })]);

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.job-card--pending')).toBeTruthy();

    const jobsService = TestBed.inject(JobsService);
    const handler = mockSocket.on.mock.calls.find(([event]) => event === 'job.updated')?.[1] as (
      run: JobRun,
    ) => void;
    handler(makeRun({ id: '1', status: 'success' }));
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.job-card--pending')).toBeNull();
    expect(el.querySelector('.job-card--success')).toBeTruthy();
    expect(jobsService.jobRuns()[0].status).toBe('success');
  });
});
