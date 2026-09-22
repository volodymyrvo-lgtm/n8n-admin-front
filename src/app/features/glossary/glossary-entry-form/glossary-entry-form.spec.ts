import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { Glossary, GlossaryEntry } from '../../../core/models/glossary.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { GlossaryEntryFormComponent } from './glossary-entry-form';
import { environment } from '@env';

function makeGlossary(overrides: Partial<Glossary> = {}): Glossary {
  return {
    id: 'g-1',
    glossaryName: 'en_az_glossary',
    setType: ['localization', 'glossary', 'en_az'],
    allGlossRules: {
      entries: [],
      purpose: '',
      instructions: {},
      language_pair: 'en_az',
      schema_version: '1.0',
      source_language: 'EN',
      target_language: 'AZ',
    },
    createdAt: '2026-08-13T14:44:50.619Z',
    updatedAt: '2026-08-13T14:44:50.619Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: 'e-1',
    status: 'standardized',
    usage_note: null,
    english_term: 'Deposit',
    source_forms_found: ['depozit'],
    do_not_use_azerbaijani: ['əmanət'],
    recommended_azerbaijani: ['depozit'],
    ...overrides,
  };
}

function configure(entryId: string | null): void {
  TestBed.configureTestingModule({
    imports: [GlossaryEntryFormComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap(entryId ? { id: 'g-1', entryId } : { id: 'g-1' }) },
        },
      },
    ],
  });
}

describe('GlossaryEntryFormComponent (create mode)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure(null);
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(GlossariesService).glossaries.set([makeGlossary()]);
  });

  afterEach(() => httpMock.verify());

  it('does not submit while the english term and recommended terms are empty', () => {
    const fixture = TestBed.createComponent(GlossaryEntryFormComponent);
    fixture.componentInstance.submit();

    httpMock.expectNone(`${environment.apiBaseUrl}/glossaries/g-1/entries`);
    expect(fixture.componentInstance['form'].controls.englishTerm.touched).toBe(true);
  });

  it('sends the target-language-specific field names for the EN -> AZ glossary', () => {
    const fixture = TestBed.createComponent(GlossaryEntryFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const form = fixture.componentInstance['form'];
    form.controls.englishTerm.setValue('Deposit');
    form.controls.recommended.setValue('depozit');
    form.controls.doNotUse.setValue('əmanət');
    form.controls.sourceForms.setValue('depozit');

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries`);
    expect(req.request.body).toEqual({
      english_term: 'Deposit',
      status: 'standardized',
      usage_note: null,
      source_forms_found: ['depozit'],
      recommended_azerbaijani: ['depozit'],
      do_not_use_azerbaijani: ['əmanət'],
    });
    req.flush(makeEntry());

    expect(navigateSpy).toHaveBeenCalledWith('/glossary/g-1');
  });

});

describe('GlossaryEntryFormComponent (EN -> RU glossary)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GlossaryEntryFormComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'g-2' }) } } },
      ],
    });
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(GlossariesService).glossaries.set([
      makeGlossary({
        id: 'g-2',
        allGlossRules: { ...makeGlossary().allGlossRules, language_pair: 'en_ru', target_language: 'RU' },
      }),
    ]);
  });

  afterEach(() => httpMock.verify());

  it('sends recommended_russian/do_not_use_russian rather than the AZ field names', () => {
    const fixture = TestBed.createComponent(GlossaryEntryFormComponent);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const form = fixture.componentInstance['form'];
    form.controls.englishTerm.setValue('Deposit');
    form.controls.recommended.setValue('депозит');

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-2/entries`);
    expect(req.request.body.recommended_russian).toEqual(['депозит']);
    expect(req.request.body.do_not_use_russian).toEqual([]);
    expect(req.request.body.recommended_azerbaijani).toBeUndefined();
    req.flush(makeEntry({ id: 'e-2' }));
  });
});

describe('GlossaryEntryFormComponent (edit mode)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure('e-1');
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const glossariesService = TestBed.inject(GlossariesService);
    glossariesService.glossaries.set([makeGlossary()]);
    glossariesService.entries.set([makeEntry()]);
  });

  afterEach(() => httpMock.verify());

  it('patches the form from the existing entry', () => {
    const fixture = TestBed.createComponent(GlossaryEntryFormComponent);

    const form = fixture.componentInstance['form'];
    expect(form.controls.englishTerm.value).toBe('Deposit');
    expect(form.controls.recommended.value).toBe('depozit');
    expect(form.controls.doNotUse.value).toBe('əmanət');
  });

  it('sends a PATCH to the nested entry endpoint on submit', () => {
    const fixture = TestBed.createComponent(GlossaryEntryFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].controls.recommended.setValue('depozit\ndepozitlər');
    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1/entries/e-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.recommended_azerbaijani).toEqual(['depozit', 'depozitlər']);
    req.flush(makeEntry({ recommended_azerbaijani: ['depozit', 'depozitlər'] }));

    expect(navigateSpy).toHaveBeenCalledWith('/glossary/g-1');
  });
});
