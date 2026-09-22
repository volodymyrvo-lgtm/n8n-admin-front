import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { RuleSetsService } from '../../../core/services/rule-sets.service';
import { RuleSetFormComponent } from './rule-set-form';

// RuleSetFormComponent never issues an HTTP call itself, but it injects
// RuleSetsService, which does (for loadRuleSets/deleteRuleSet) - providing
// the testing HttpClient here keeps this spec isolated from any real
// network call regardless of what else is going on in the test run.
function configure(routeId: string | null, queryParams: Record<string, string> = {}): void {
  TestBed.configureTestingModule({
    imports: [RuleSetFormComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(routeId ? { id: routeId } : {}),
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  });
}

describe('RuleSetFormComponent (create mode)', () => {
  beforeEach(async () => {
    configure(null);
    await TestBed.compileComponents();
  });

  it('does not submit while the name is empty', () => {
    const fixture = TestBed.createComponent(RuleSetFormComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.componentInstance.submit();

    expect(ruleSetsService.ruleSets().length).toBe(0);
  });

  it('does not submit while no setType is selected, even with a valid name', () => {
    const fixture = TestBed.createComponent(RuleSetFormComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    fixture.componentInstance['form'].controls.name.setValue('Deposit Count = 0');

    fixture.componentInstance.submit();

    expect(ruleSetsService.ruleSets().length).toBe(0);
    expect(fixture.componentInstance['form'].controls.setType.touched).toBe(true);
  });

  it('saves flat and nested fields as a plain object, along with the selected setTypes', () => {
    const fixture = TestBed.createComponent(RuleSetFormComponent);
    const ruleSetsService = TestBed.inject(RuleSetsService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    fixture.componentInstance['form'].controls.name.setValue('Deposit Count = 0');
    fixture.componentInstance['form'].controls.setType.controls.email.setValue(true);
    fixture.componentInstance['form'].controls.setType.controls.push.setValue(true);
    fixture.componentInstance['fields'].set([
      { id: 'a', key: 'Segment', isGroup: false, value: 'Deposit Count = 0', children: [] },
      { id: 'b', key: '', isGroup: false, value: '', children: [] },
      {
        id: 'c',
        key: 'Bonus Block',
        isGroup: true,
        value: '',
        children: [
          {
            id: 'd',
            key: 'bonus 1',
            isGroup: true,
            value: '',
            children: [{ id: 'e', key: 'Min Deposit', isGroup: false, value: '10', children: [] }],
          },
        ],
      },
    ]);

    fixture.componentInstance.submit();

    expect(ruleSetsService.ruleSets().length).toBe(1);
    const saved = ruleSetsService.ruleSets()[0];
    expect(saved.ruleName).toBe('Deposit Count = 0');
    expect(saved.ruleSet).toEqual({
      Segment: 'Deposit Count = 0',
      'Bonus Block': { 'bonus 1': { 'Min Deposit': '10' } },
    });
    expect(saved.setType).toEqual(['email', 'push']);
    expect(navigateSpy).toHaveBeenCalledWith('/rule-sets');
  });
});

describe('RuleSetFormComponent (edit mode)', () => {
  it('loads the existing rule set into the form, including its setTypes, and saves changes to it', async () => {
    configure('rs-1');
    await TestBed.compileComponents();

    const ruleSetsService = TestBed.inject(RuleSetsService);
    ruleSetsService.ruleSets.set([
      {
        id: 'rs-1',
        ruleName: 'Deposit Count = 0',
        ruleSet: {
          Segment: 'Deposit Count = 0',
          'Bonus Block': { 'bonus 1': { 'Min Deposit': '10' } },
        },
        setType: ['sms'],
      },
    ]);

    const fixture = TestBed.createComponent(RuleSetFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    expect(fixture.componentInstance['form'].controls.name.value).toBe('Deposit Count = 0');
    expect(fixture.componentInstance['form'].controls.setType.value).toEqual({
      email: false,
      sms: true,
      push: false,
      toneOfVoice: false,
      humanaizer: false,
      web_push: false,
      in_app: false,
      notification_center: false,
    });
    expect(fixture.componentInstance['fields']()).toEqual([
      { id: expect.any(String), key: 'Segment', isGroup: false, value: 'Deposit Count = 0', children: [] },
      {
        id: expect.any(String),
        key: 'Bonus Block',
        isGroup: true,
        value: '',
        children: [
          {
            id: expect.any(String),
            key: 'bonus 1',
            isGroup: true,
            value: '',
            children: [
              { id: expect.any(String), key: 'Min Deposit', isGroup: false, value: '10', children: [] },
            ],
          },
        ],
      },
    ]);

    fixture.componentInstance['form'].controls.name.setValue('Deposit Count = 1');
    fixture.componentInstance.submit();

    // updateRuleSet does a real PATCH and, on success, reloads the whole
    // list from the backend rather than patching local state in place.
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne('http://localhost:3000/rules/rs-1').flush({});
    httpMock.expectOne('http://localhost:3000/rules').flush([
      {
        id: 'rs-1',
        ruleName: 'Deposit Count = 1',
        ruleSet: { Segment: 'Deposit Count = 0', 'Bonus Block': { 'bonus 1': { 'Min Deposit': '10' } } },
        setType: ['sms'],
      },
    ]);

    expect(ruleSetsService.ruleSets().length).toBe(1);
    expect(ruleSetsService.ruleSets()[0].ruleName).toBe('Deposit Count = 1');
    expect(ruleSetsService.ruleSets()[0].setType).toEqual(['sms']);
    expect(navigateSpy).toHaveBeenCalledWith('/rule-sets');
  });

  it('redirects to the list when the rule set does not exist locally', async () => {
    configure('missing');
    await TestBed.compileComponents();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    TestBed.createComponent(RuleSetFormComponent);

    expect(navigateSpy).toHaveBeenCalledWith('/rule-sets');
  });
});

describe('RuleSetFormComponent (duplicate mode)', () => {
  it('pre-fills the form from the source rule set with a "(copy)" name, and saves it as a new rule set', async () => {
    configure(null, { duplicateFrom: 'rs-1' });
    await TestBed.compileComponents();

    const ruleSetsService = TestBed.inject(RuleSetsService);
    ruleSetsService.ruleSets.set([
      {
        id: 'rs-1',
        ruleName: 'Deposit Count = 0',
        ruleSet: { Segment: 'Deposit Count = 0' },
        setType: ['sms'],
      },
    ]);

    const fixture = TestBed.createComponent(RuleSetFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    // Duplicate mode is not edit mode - it produces a new rule set on submit.
    expect(fixture.componentInstance['isEditMode']).toBe(false);
    expect(fixture.componentInstance['isDuplicateMode']).toBe(true);
    // No translation loader is configured in tests, so compare against
    // instant() with the same key/params rather than a hardcoded string -
    // the real app resolves this to e.g. "Deposit Count = 0 (copy)".
    const translate = TestBed.inject(TranslateService);
    expect(fixture.componentInstance['form'].controls.name.value).toBe(
      translate.instant('ruleSets.copyName', { name: 'Deposit Count = 0' }),
    );
    expect(fixture.componentInstance['form'].controls.setType.value.sms).toBe(true);
    expect(fixture.componentInstance['fields']()).toEqual([
      { id: expect.any(String), key: 'Segment', isGroup: false, value: 'Deposit Count = 0', children: [] },
    ]);

    fixture.componentInstance.submit();

    expect(ruleSetsService.ruleSets().length).toBe(2);
    const created = ruleSetsService.ruleSets()[1];
    expect(created.id).toBeUndefined();
    expect(created.ruleName).toBe(translate.instant('ruleSets.copyName', { name: 'Deposit Count = 0' }));
    expect(created.ruleSet).toEqual({ Segment: 'Deposit Count = 0' });
    expect(navigateSpy).toHaveBeenCalledWith('/rule-sets');
  });

  it('falls back to a blank form when the source rule set is not loaded locally', async () => {
    configure(null, { duplicateFrom: 'missing' });
    await TestBed.compileComponents();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    const fixture = TestBed.createComponent(RuleSetFormComponent);

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance['form'].controls.name.value).toBe('');
  });
});
