import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { Glossary } from '../../../core/models/glossary.model';
import { GlossariesService } from '../../../core/services/glossaries.service';
import { GlossaryFormComponent } from './glossary-form';
import { environment } from '@env';

function makeGlossary(overrides: Partial<Glossary> = {}): Glossary {
  return {
    id: 'g-1',
    glossaryName: 'en_az_glossary',
    setType: ['localization', 'glossary', 'en_az'],
    allGlossRules: {
      entries: [],
      purpose: 'Standardize EN -> AZ terminology.',
      instructions: { tone: 'formal', register: 'neutral' },
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

function configure(routeId: string | null): void {
  TestBed.configureTestingModule({
    imports: [GlossaryFormComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } },
      },
    ],
  });
}

describe('GlossaryFormComponent (create mode)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure(null);
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('does not submit while required fields are empty', () => {
    const fixture = TestBed.createComponent(GlossaryFormComponent);
    fixture.componentInstance.submit();

    httpMock.expectNone(`${environment.apiBaseUrl}/glossaries`);
    expect(fixture.componentInstance['form'].controls.glossaryName.touched).toBe(true);
  });

  it('creates a glossary from the form fields and instructions rows, then navigates to it', () => {
    const fixture = TestBed.createComponent(GlossaryFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const form = fixture.componentInstance['form'];
    form.controls.glossaryName.setValue('en_az_glossary');
    form.controls.languagePair.setValue('en_az');
    form.controls.sourceLanguage.setValue('EN');
    form.controls.targetLanguage.setValue('AZ');
    form.controls.setType.setValue('localization\nglossary\nen_az');
    form.controls.purpose.setValue('Standardize EN -> AZ terminology.');
    fixture.componentInstance['instructions'].set([{ id: 'a', key: 'tone', isGroup: false, value: 'formal', children: [] }]);

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`);
    expect(req.request.body).toEqual({
      glossaryName: 'en_az_glossary',
      setType: ['localization', 'glossary', 'en_az'],
      allGlossRules: {
        purpose: 'Standardize EN -> AZ terminology.',
        instructions: { tone: 'formal' },
        language_pair: 'en_az',
        schema_version: '1.0',
        source_language: 'EN',
        target_language: 'AZ',
      },
    });
    req.flush(makeGlossary());

    expect(navigateSpy).toHaveBeenCalledWith('/glossary/g-1');
  });
});

describe('GlossaryFormComponent (edit mode)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure('g-1');
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(GlossariesService).glossaries.set([makeGlossary()]);
  });

  afterEach(() => httpMock.verify());

  it('patches the form and instructions rows from the existing glossary', () => {
    const fixture = TestBed.createComponent(GlossaryFormComponent);

    const form = fixture.componentInstance['form'];
    expect(form.controls.glossaryName.value).toBe('en_az_glossary');
    expect(form.controls.languagePair.value).toBe('en_az');
    expect(form.controls.targetLanguage.value).toBe('AZ');
    expect(fixture.componentInstance['instructions']()).toEqual([
      { id: expect.any(String), key: 'tone', isGroup: false, value: 'formal', children: [] },
      { id: expect.any(String), key: 'register', isGroup: false, value: 'neutral', children: [] },
    ]);
  });

  it('sends a PATCH on submit and navigates back to the glossary', () => {
    const fixture = TestBed.createComponent(GlossaryFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].controls.glossaryName.setValue('en_az_glossary_v2');
    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.glossaryName).toBe('en_az_glossary_v2');
    req.flush(makeGlossary({ glossaryName: 'en_az_glossary_v2' }));

    expect(navigateSpy).toHaveBeenCalledWith('/glossary/g-1');
  });
});
