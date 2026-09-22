import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { JobsService } from '../../../core/services/jobs.service';
import { ToastService } from '../../../core/services/toast.service';
import { AddJobComponent } from './add-job';

const N8N_URL = 'https://royaleteam.app.n8n.cloud/webhook-test/6b74d4ba-f397-4534-83ef-7bffe54d1a6f';

// AddJobComponent's JobsService dependency now injects AuthService (for
// the jobs websocket, see JobsService.connectJobUpdates) and issues real
// HTTP calls on submit - provide the testing HttpClient so nothing here
// attempts a real network call.
describe('AddJobComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddJobComponent],
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

  it('does not submit while required fields are empty', () => {
    const fixture = TestBed.createComponent(AddJobComponent);
    fixture.componentInstance.submit();

    expect(fixture.componentInstance['form'].controls.mainRuleSetId.touched).toBe(true);
  });

  it('creates a job on valid submit: posts the backend and n8n bodies and navigates to /jobs', () => {
    const fixture = TestBed.createComponent(AddJobComponent);
    const jobsService = TestBed.inject(JobsService);
    const toastService = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);
    // navigateByUrl actually performs a route match against provideRouter([])
    // otherwise, which has nothing to match and rejects - mock it out so the
    // test only asserts that navigation was requested, not that it succeeded.
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({
      jobType: 'sms',
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'Welcome message',
      mainRuleSetId: 'rule-1',
      toneOfVoiceRuleSetId: 'rule-2',
      humanizerRuleSetId: 'rule-3',
      promptId: 'prompt-1',
      glossaryId: '',
    });
    fixture.componentInstance.submit();

    const backendReq = httpMock.expectOne('http://localhost:3000/jobs');
    expect(backendReq.request.method).toBe('POST');
    expect(backendReq.request.body).toEqual({
      steps: { step1: { status: 'pending' } },
      jobType: 'sms',
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'Welcome message',
      ruleIds: ['rule-1', 'rule-2', 'rule-3'],
      sm: 'prompt-1',
    });
    backendReq.flush({
      id: 'new-1',
      steps: { step1: { status: 'pending' } },
      jobType: 'sms',
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'Welcome message',
      status: 'pending',
      runDate: null,
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
      runnedById: 'user-1',
      ruleIds: ['rule-1', 'rule-2', 'rule-3'],
    });

    const n8nReq = httpMock.expectOne(N8N_URL);
    expect(n8nReq.request.method).toBe('POST');
    expect(n8nReq.request.body).toEqual({
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'Welcome message',
      mainRuleSet: 'rule-1',
      toneOfVoice: 'rule-2',
      humanizer: 'rule-3',
      sm: 'prompt-1',
      jobId: 'new-1',
    });
    n8nReq.flush({});

    expect(jobsService.jobRuns().length).toBe(1);
    expect(toastService.toasts()[0]?.type).toBe('success');
    expect(navigateSpy).toHaveBeenCalledWith('/jobs');
  });

  it('shows an error toast (without blocking navigation setup) when the n8n trigger fails', () => {
    const fixture = TestBed.createComponent(AddJobComponent);
    const toastService = TestBed.inject(ToastService);
    // Backend still succeeds here, so the component still navigates - mock
    // navigateByUrl for the same reason as above (nothing for it to match).
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({
      jobType: 'sms',
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'Welcome message',
      mainRuleSetId: 'rule-1',
      toneOfVoiceRuleSetId: '',
      humanizerRuleSetId: '',
      promptId: 'prompt-1',
      glossaryId: '',
    });
    fixture.componentInstance.submit();

    httpMock.expectOne('http://localhost:3000/jobs').flush({
      id: 'new-1',
      steps: { step1: { status: 'pending' } },
      jobType: 'sms',
      taskStatus: 'new',
      messageType: 'email',
      board: 'ONBOARDING',
      taskDescription: 'Welcome message',
      status: 'pending',
      runDate: null,
      createdAt: '2026-09-14T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
      runnedById: 'user-1',
      ruleIds: ['rule-1'],
    });
    httpMock.expectOne(N8N_URL).flush('down', { status: 500, statusText: 'Error' });

    expect(toastService.toasts().some((toast) => toast.type === 'error')).toBe(true);
  });

  it('only offers rule sets tagged for the tone-of-voice / humanizer roles in those fields', () => {
    const fixture = TestBed.createComponent(AddJobComponent);
    // ngOnInit calls ruleSetsService.loadRuleSets(), which issues a real GET -
    // flush it with the fixture data this test cares about before reading the DOM.
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([
      { id: 'rule-1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] },
      { id: 'rule-2', ruleName: 'Friendly tone', ruleSet: {}, setType: ['toneOfVoice'] },
      { id: 'rule-3', ruleName: 'Simplifier', ruleSet: {}, setType: ['humanaizer'] },
    ]);
    httpMock.expectOne('http://localhost:3000/prompts').flush([{ id: 'prompt-1', name: 'Default', message: 'Hi' }]);
    httpMock.expectOne('http://localhost:3000/glossaries').flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toneOptions = Array.from(el.querySelector('#toneOfVoiceRuleSet')!.querySelectorAll('option')).map((o) =>
      o.textContent?.trim(),
    );
    const humanizerOptions = Array.from(el.querySelector('#humanizerRuleSet')!.querySelectorAll('option')).map(
      (o) => o.textContent?.trim(),
    );

    expect(toneOptions).toEqual(expect.arrayContaining(['Friendly tone']));
    expect(toneOptions).not.toContain('Simplifier');
    expect(humanizerOptions).toEqual(expect.arrayContaining(['Simplifier']));
    expect(humanizerOptions).not.toContain('Friendly tone');
  });

  it('only offers rule sets tagged for the selected job type in the main rule set field, and updates when the job type changes', () => {
    const fixture = TestBed.createComponent(AddJobComponent);
    fixture.detectChanges();
    httpMock.expectOne('http://localhost:3000/rules').flush([
      { id: 'rule-1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] },
      { id: 'rule-2', ruleName: 'Friendly tone', ruleSet: {}, setType: ['toneOfVoice'] },
      { id: 'rule-3', ruleName: 'Simplifier', ruleSet: {}, setType: ['humanaizer'] },
      { id: 'rule-4', ruleName: 'SMS blast', ruleSet: {}, setType: ['sms'] },
    ]);
    httpMock.expectOne('http://localhost:3000/prompts').flush([{ id: 'prompt-1', name: 'Default', message: 'Hi' }]);
    httpMock.expectOne('http://localhost:3000/glossaries').flush([]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const mainOptionsFor = () =>
      Array.from(el.querySelector('#mainRuleSet')!.querySelectorAll('option')).map((o) => o.textContent?.trim());

    // Default job type is 'email' - only the email-tagged rule set qualifies.
    expect(mainOptionsFor()).toContain('Default routing');
    expect(mainOptionsFor()).not.toContain('Friendly tone');
    expect(mainOptionsFor()).not.toContain('Simplifier');
    expect(mainOptionsFor()).not.toContain('SMS blast');

    fixture.componentInstance['form'].controls.mainRuleSetId.setValue('rule-1');
    fixture.componentInstance['form'].controls.jobType.setValue('sms');
    fixture.detectChanges();

    // Switching job type re-filters the list to the sms-tagged rule set...
    expect(mainOptionsFor()).toContain('SMS blast');
    expect(mainOptionsFor()).not.toContain('Default routing');
    // ...and clears the previous selection, since it's no longer offered.
    expect(fixture.componentInstance['form'].controls.mainRuleSetId.value).toBe('');
  });

  describe('localization task status', () => {
    function loadFixtureData(fixture: ReturnType<typeof TestBed.createComponent<AddJobComponent>>): void {
      fixture.detectChanges();
      httpMock.expectOne('http://localhost:3000/rules').flush([
        { id: 'rule-1', ruleName: 'Default routing', ruleSet: {}, setType: ['email'] },
        { id: 'rule-2', ruleName: 'Friendly tone', ruleSet: {}, setType: ['toneOfVoice'] },
        { id: 'rule-3', ruleName: 'Simplifier', ruleSet: {}, setType: ['humanaizer'] },
      ]);
      httpMock.expectOne('http://localhost:3000/prompts').flush([{ id: 'prompt-1', name: 'Default', message: 'Hi' }]);
      httpMock.expectOne('http://localhost:3000/glossaries').flush([
        {
          id: 'glossary-1',
          glossaryName: 'en_az_glossary',
          setType: [],
          allGlossRules: {
            entries: [],
            purpose: '',
            instructions: {},
            language_pair: 'en_az',
            schema_version: '1.0',
            source_language: 'EN',
            target_language: 'AZ',
          },
          createdAt: '2026-09-14T00:00:00.000Z',
          updatedAt: '2026-09-14T00:00:00.000Z',
        },
      ]);
      fixture.detectChanges();
    }

    it('swaps the main rule set field for a glossary field once the task status is localization', () => {
      const fixture = TestBed.createComponent(AddJobComponent);
      loadFixtureData(fixture);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('#mainRuleSet')).toBeTruthy();
      expect(el.querySelector('#glossary')).toBeNull();

      fixture.componentInstance['form'].controls.mainRuleSetId.setValue('rule-1');
      fixture.componentInstance['form'].controls.taskStatus.setValue('localization');
      fixture.detectChanges();

      expect(el.querySelector('#mainRuleSet')).toBeNull();
      expect(el.querySelector('#glossary')).toBeTruthy();
      // The now-hidden main rule set is cleared and no longer required...
      expect(fixture.componentInstance['form'].controls.mainRuleSetId.value).toBe('');
      expect(fixture.componentInstance['form'].controls.mainRuleSetId.valid).toBe(true);
      // ...while the glossary field is required in its place.
      expect(fixture.componentInstance['form'].controls.glossaryId.valid).toBe(false);

      fixture.componentInstance['form'].controls.taskStatus.setValue('new');
      fixture.detectChanges();

      expect(el.querySelector('#mainRuleSet')).toBeTruthy();
      expect(el.querySelector('#glossary')).toBeNull();
      expect(fixture.componentInstance['form'].controls.mainRuleSetId.valid).toBe(false);
      expect(fixture.componentInstance['form'].controls.glossaryId.valid).toBe(true);
    });

    it('posts the localization-shaped n8n body (glossaries instead of mainRuleSet)', () => {
      const fixture = TestBed.createComponent(AddJobComponent);
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      loadFixtureData(fixture);

      fixture.componentInstance['form'].setValue({
        jobType: 'sms',
        taskStatus: 'localization',
        messageType: 'email',
        board: 'ONBOARDING',
        taskDescription: 'id 13 ru',
        mainRuleSetId: '',
        toneOfVoiceRuleSetId: 'rule-2',
        humanizerRuleSetId: 'rule-3',
        promptId: 'prompt-1',
        glossaryId: 'glossary-1',
      });
      // setValue() alone doesn't re-run syncLocalizationFields (an effect,
      // flushed by change detection) - without this, mainRuleSetId would
      // still carry its stale "required" validator from before the task
      // status flipped, and the form would wrongly report itself invalid.
      fixture.detectChanges();
      fixture.componentInstance.submit();

      const backendReq = httpMock.expectOne('http://localhost:3000/jobs');
      expect(backendReq.request.body.ruleIds).toEqual(['rule-2', 'rule-3']);
      backendReq.flush({
        id: 'new-2',
        steps: { step1: { status: 'pending' } },
        jobType: 'sms',
        taskStatus: 'localization',
        messageType: 'email',
        board: 'ONBOARDING',
        taskDescription: 'id 13 ru',
        status: 'pending',
        runDate: null,
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
        runnedById: 'user-1',
        ruleIds: ['rule-2', 'rule-3'],
      });

      const n8nReq = httpMock.expectOne(N8N_URL);
      expect(n8nReq.request.body).toEqual({
        taskStatus: 'localization',
        messageType: 'email',
        board: 'ONBOARDING',
        taskDescription: 'id 13 ru',
        mainRuleSet: '',
        toneOfVoice: 'rule-2',
        humanizer: 'rule-3',
        glossaries: 'glossary-1',
        sm: 'prompt-1',
        jobId: 'new-2',
      });
      n8nReq.flush({});
    });
  });
});
