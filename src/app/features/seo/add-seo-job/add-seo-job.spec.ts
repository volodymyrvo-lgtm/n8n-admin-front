import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { SEO_WEBHOOK_URLS } from '../../../core/services/seo-jobs.service';
import { ToastService } from '../../../core/services/toast.service';
import { AddSeoJobComponent } from './add-seo-job';

const API = 'http://localhost:3000';
const LIVE_URL = 'https://n8n.example/webhook/seo';
const TEST_URL = 'https://n8n.example/webhook-test/seo';

const PROMPTS = [
  { id: 'prompt-1', name: 'Keno landing', content: 'x', kind: 'seo', createdAt: '', updatedAt: '' },
  { id: 'prompt-2', name: 'Lottery landing', content: 'y', kind: 'seo', createdAt: '', updatedAt: '' },
];

const RULES = [
  { id: 'rule-1', ruleName: 'SEO tone', ruleSet: { a: 'b' }, setType: ['toneOfVoice'], kind: 'seo' },
  { id: 'rule-2', ruleName: 'SEO humanizer', ruleSet: { a: 'c' }, setType: ['humanaizer'], kind: 'seo' },
  { id: 'rule-3', ruleName: 'Other SEO rule', ruleSet: { a: 'd' }, setType: ['email'], kind: 'seo' },
];

function createdJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seo-1',
    kind: 'seo',
    steps: { step1: { status: 'pending' } },
    status: 'pending',
    runDate: '2026-10-14T12:30:00.000Z',
    createdAt: '2026-10-14T12:30:00.000Z',
    updatedAt: '2026-10-14T12:30:00.000Z',
    runnedById: 'user-1',
    llm: 'gpt_5_6_sol',
    spend: {},
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

describe('AddSeoJobComponent', () => {
  let httpMock: HttpTestingController;

  function setup(options: { webhooks?: { live: string; test: string }; isAdmin?: boolean; prompts?: unknown[]; rules?: unknown[] } = {}) {
    TestBed.configureTestingModule({
      imports: [AddSeoJobComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SEO_WEBHOOK_URLS, useValue: options.webhooks ?? { live: LIVE_URL, test: TEST_URL } },
        { provide: AuthService, useValue: { isAdmin: () => options.isAdmin ?? true, getToken: () => 't' } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    // The /seo/jobs route doesn't exist in these tests - never really navigate.
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AddSeoJobComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url === `${API}/prompts`);
    expect(req.request.params.get('kind')).toBe('seo');
    req.flush(options.prompts ?? PROMPTS);

    // Only SEO rules: the same endpoint without ?kind=seo would return communication ones.
    const rulesReq = httpMock.expectOne((r) => r.url === `${API}/rules`);
    expect(rulesReq.request.params.get('kind')).toBe('seo');
    rulesReq.flush(options.rules ?? RULES);
    fixture.detectChanges();
    return fixture;
  }

  function fill(fixture: ReturnType<typeof setup>, values: { llm?: string; prompt?: string; pageTask?: string; language?: string; tone?: string; humanizer?: string }) {
    const el: HTMLElement = fixture.nativeElement;
    const set = (selector: string, value: string) => {
      const control = el.querySelector(selector) as HTMLSelectElement | HTMLInputElement;
      control.value = value;
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input'));
    };
    if (values.language !== undefined) set('#seoLanguage', values.language);
    if (values.llm !== undefined) set('#seoLlm', values.llm);
    if (values.prompt !== undefined) set('#seoPrompt', values.prompt);
    if (values.pageTask !== undefined) set('#seoPageTask', values.pageTask);
    if (values.tone !== undefined) set('#seoToneOfVoiceRuleSet', values.tone);
    if (values.humanizer !== undefined) set('#seoHumanizerRuleSet', values.humanizer);
    fixture.detectChanges();
  }

  function submit(fixture: ReturnType<typeof setup>) {
    fixture.componentInstance.submit();
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('offers EN, AZ and RU, defaulting to EN, and the SEO prompts by name', () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement;

    const languages = Array.from(el.querySelectorAll('#seoLanguage option')).map((o) => o.textContent?.trim());
    expect(languages).toEqual(['EN', 'AZ', 'RU']);
    expect((el.querySelector('#seoLanguage') as HTMLSelectElement).value).toBe('EN');

    const prompts = Array.from(el.querySelectorAll('#seoPrompt option')).map((o) => o.textContent?.trim());
    expect(prompts.slice(1)).toEqual(['Keno landing', 'Lottery landing']);
  });

  it('does not submit while required fields are empty and shows errors', () => {
    const fixture = setup();
    submit(fixture);

    httpMock.expectNone(`${API}/jobs/seo`);
    const errors = fixture.nativeElement.querySelectorAll('.form__error');
    expect(errors.length).toBe(4);
  });

  it('offers SEO rules by role - tone of voice and humanizer only, no main rule set', () => {
    const fixture = setup();
    const el: HTMLElement = fixture.nativeElement;
    const names = (selector: string) => Array.from(el.querySelectorAll(`${selector} option`)).map((o) => o.textContent?.trim());

    expect(names('#seoToneOfVoiceRuleSet').slice(1)).toEqual(['SEO tone']);
    expect(names('#seoHumanizerRuleSet').slice(1)).toEqual(['SEO humanizer']);
    expect(el.querySelector('#mainRuleSet, #seoMainRuleSet')).toBeNull();
  });

  it('requires at least one of tone of voice / humanizer, but either alone is enough', () => {
    const fixture = setup();
    const form = fixture.componentInstance['form'];

    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: 'R048' });
    submit(fixture);
    httpMock.expectNone(`${API}/jobs/seo`);
    expect(form.hasError('noRule')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('seoAdd.rulesError');

    fill(fixture, { humanizer: 'rule-2' });
    expect(form.hasError('noRule')).toBe(false);
    submit(fixture);
    const req = httpMock.expectOne(`${API}/jobs/seo`);
    expect(req.request.body.ruleIds).toEqual(['rule-2']);
    req.flush(createdJob());
    httpMock.expectOne(LIVE_URL).flush({});
  });

  it('treats a whitespace-only page task as empty', () => {
    const fixture = setup();
    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: '   ' });
    submit(fixture);

    httpMock.expectNone(`${API}/jobs/seo`);
    expect(fixture.componentInstance['form'].controls.pageTask.hasError('required')).toBe(true);
  });

  it('rejects a page task longer than 500 characters but accepts exactly 500', () => {
    const fixture = setup();
    const control = fixture.componentInstance['form'].controls.pageTask;

    control.setValue('a'.repeat(501));
    expect(control.hasError('maxlength')).toBe(true);
    control.setValue('a'.repeat(500));
    expect(control.valid).toBe(true);
    control.setValue(` ${'a'.repeat(500)} `);
    expect(control.valid).toBe(true);
  });

  it('POSTs exactly {steps, language, llm, prompt, pageTask, ruleIds} with the prompt as "<LANG> <id>", then triggers the live webhook', () => {
    const fixture = setup();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.mocked(router.navigateByUrl);
    const toast = TestBed.inject(ToastService);

    fill(fixture, { language: 'AZ', llm: 'gpt_5_6_sol', prompt: 'prompt-2', pageTask: '  R048 · Кено  ', tone: 'rule-1', humanizer: 'rule-2' });
    submit(fixture);

    const req = httpMock.expectOne(`${API}/jobs/seo`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      steps: { step1: { status: 'pending' } },
      language: 'AZ',
      llm: 'gpt_5_6_sol',
      prompt: 'AZ prompt-2',
      pageTask: 'R048 · Кено',
      ruleIds: ['rule-1', 'rule-2'],
    });
    req.flush(createdJob({ language: 'AZ', prompt: 'AZ prompt-2' }));

    const hook = httpMock.expectOne(LIVE_URL);
    expect(hook.request.body).toEqual({
      jobId: 'seo-1',
      language: 'AZ',
      llm: 'gpt_5_6_sol',
      prompt: 'AZ prompt-2',
      pageTask: 'R048 · Кено',
      toneOfVoice: 'rule-1',
      humanizer: 'rule-2',
    });
    hook.flush({});

    expect(navigateSpy).toHaveBeenCalledWith('/seo/jobs');
    expect(toast.toasts().some((t) => t.type === 'success')).toBe(true);
  });

  it('uses the test webhook when the test environment toggle is on', () => {
    const fixture = setup();
    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: 'R048', tone: 'rule-1' });
    fixture.componentInstance['form'].controls.isTesting.setValue(true);
    submit(fixture);

    const req = httpMock.expectOne(`${API}/jobs/seo`);
    expect(req.request.body).not.toHaveProperty('isTesting');
    req.flush(createdJob());
    httpMock.expectOne(TEST_URL).flush({});
  });

  it('still creates the job and warns when the SEO webhook is not configured', () => {
    const fixture = setup({ webhooks: { live: '', test: '' } });
    const toast = TestBed.inject(ToastService);

    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: 'R048', tone: 'rule-1' });
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/seo`).flush(createdJob());

    expect(toast.toasts().some((t) => t.type === 'error')).toBe(true);
  });

  it('shows an error toast when the n8n trigger fails but the job was saved', () => {
    const fixture = setup();
    const toast = TestBed.inject(ToastService);

    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: 'R048', tone: 'rule-1' });
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/seo`).flush(createdJob());
    httpMock.expectOne(LIVE_URL).flush('boom', { status: 500, statusText: 'Server Error' });

    expect(toast.toasts().some((t) => t.type === 'error')).toBe(true);
  });

  it('re-enables the form after a backend error and does not call the webhook', () => {
    const fixture = setup();
    const navigateSpy = vi.mocked(TestBed.inject(Router).navigateByUrl);

    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: 'R048', tone: 'rule-1' });
    submit(fixture);
    httpMock.expectOne(`${API}/jobs/seo`).flush({ message: ['bad'] }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance['submitting']()).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first request is in flight', () => {
    const fixture = setup();

    fill(fixture, { llm: 'gpt_5_6_sol', prompt: 'prompt-1', pageTask: 'R048', tone: 'rule-1' });
    submit(fixture);
    submit(fixture);

    const req = httpMock.expectOne(`${API}/jobs/seo`);
    req.flush(createdJob());
    httpMock.expectOne(LIVE_URL).flush({});
  });

  describe('when there are no SEO prompts', () => {
    it('hints at it and links admins to the prompt form', () => {
      const fixture = setup({ prompts: [], isAdmin: true });
      const hint = fixture.nativeElement.querySelector('[data-testid="no-prompts-hint"]');
      expect(hint).not.toBeNull();
      expect(hint.querySelector('a')?.getAttribute('href')).toBe('/seo/prompts/new');
    });

    it('does not offer the link to non-admins', () => {
      const fixture = setup({ prompts: [], isAdmin: false });
      const hint = fixture.nativeElement.querySelector('[data-testid="no-prompts-hint"]');
      expect(hint).not.toBeNull();
      expect(hint.querySelector('a')).toBeNull();
    });
  });

  describe('when there are no SEO rule sets', () => {
    it('hints at it and links admins to the SEO rule form', () => {
      const fixture = setup({ rules: [], isAdmin: true });
      const hint = fixture.nativeElement.querySelector('[data-testid="no-rules-hint"]');
      expect(hint).not.toBeNull();
      expect(hint.querySelector('a')?.getAttribute('href')).toBe('/seo/rule-sets/new');
    });

    it('does not offer the link to non-admins', () => {
      const fixture = setup({ rules: [], isAdmin: false });
      const hint = fixture.nativeElement.querySelector('[data-testid="no-rules-hint"]');
      expect(hint).not.toBeNull();
      expect(hint.querySelector('a')).toBeNull();
    });
  });
});
