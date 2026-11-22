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
      entries: [
        {
          id: 'entry-1',
          status: 'standardized',
          usage_note: null,
          english_term: 'onboarding',
          source_forms_found: ['onboarding'],
          recommended_azerbaijani: ['qeydiyyat'],
          do_not_use_azerbaijani: [],
        },
      ],
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

function configure(routeId: string | null, kind?: 'blog_ai'): void {
  TestBed.configureTestingModule({
    imports: [GlossaryFormComponent],
    providers: [
      provideTranslateService(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}), data: kind ? { kind } : {} },
        },
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

  it('echoes the glossary\'s current entries back on PATCH, so editing its fields never wipes its terms', () => {
    const fixture = TestBed.createComponent(GlossaryFormComponent);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-1`);
    expect(req.request.body.allGlossRules.entries).toEqual(makeGlossary().allGlossRules.entries);
    req.flush(makeGlossary());
  });
});

describe('GlossaryFormComponent (Blog AI)', () => {
  let httpMock: HttpTestingController;

  afterEach(() => httpMock.verify());

  it('creates a Blog AI glossary with kind: "blog_ai" in the body and opens it under /blog-ai/glossary', async () => {
    configure(null, 'blog_ai');
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GlossaryFormComponent);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].patchValue({
      glossaryName: 'blog_en_az',
      languagePair: 'en_az',
      sourceLanguage: 'EN',
      targetLanguage: 'AZ',
    });
    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.kind).toBe('blog_ai');
    expect(req.request.body.glossaryName).toBe('blog_en_az');
    req.flush(makeGlossary({ id: 'g-9', glossaryName: 'blog_en_az', kind: 'blog_ai' }));

    expect(TestBed.inject(GlossariesService).blogAiGlossaries().map((g) => g.id)).toEqual(['g-9']);
    expect(TestBed.inject(GlossariesService).glossaries()).toEqual([]);
    expect(navigateSpy).toHaveBeenCalledWith('/blog-ai/glossary/g-9');
  });

  it('edits a Blog AI glossary from the Blog AI list and goes back to it', async () => {
    configure('g-9', 'blog_ai');
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(GlossariesService).blogAiGlossaries.set([makeGlossary({ id: 'g-9', glossaryName: 'blog_en_az', kind: 'blog_ai' })]);
    const fixture = TestBed.createComponent(GlossaryFormComponent);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    expect(fixture.componentInstance['form'].controls.glossaryName.value).toBe('blog_en_az');
    fixture.componentInstance.submit();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/glossaries/g-9`);
    expect(req.request.method).toBe('PATCH');
    req.flush(makeGlossary({ id: 'g-9', glossaryName: 'blog_en_az', kind: 'blog_ai' }));

    expect(navigateSpy).toHaveBeenCalledWith('/blog-ai/glossary/g-9');
  });
});
