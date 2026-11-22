import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env';
import { CreateGlossaryInput, Glossary, UpdateGlossaryInput } from '../models/glossary.model';
import { GlossariesService } from './glossaries.service';

const API = `${environment.apiBaseUrl}/glossaries`;

const glossary = (id: string, extra: Partial<Glossary> = {}): Glossary => ({
  id,
  glossaryName: `G ${id}`,
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
  createdAt: '',
  updatedAt: '',
  ...extra,
});

const input = (extra: Partial<CreateGlossaryInput> = {}): CreateGlossaryInput => ({
  glossaryName: 'New',
  setType: [],
  allGlossRules: {
    purpose: '',
    instructions: {},
    language_pair: 'en_az',
    schema_version: '1.0',
    source_language: 'EN',
    target_language: 'AZ',
  },
  ...extra,
});

describe('GlossariesService', () => {
  let service: GlossariesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GlossariesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads Content glossaries with the original, parameterless request', () => {
    service.loadGlossaries();

    const req = httpMock.expectOne(API);
    expect(req.request.params.keys()).toEqual([]);
    req.flush([glossary('a')]);

    expect(service.glossaries().map((g) => g.id)).toEqual(['a']);
    expect(service.blogAiGlossaries()).toEqual([]);
    expect(service.loading()).toBe(false);
  });

  it('loads Blog AI glossaries with ?kind=blog_ai into their own list, leaving the Content one alone', () => {
    service.glossaries.set([glossary('a')]);
    service.loadGlossaries('blog_ai');

    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('kind')).toBe('blog_ai');
    req.flush([glossary('b1', { kind: 'blog_ai' })]);

    expect(service.blogAiGlossaries().map((g) => g.id)).toEqual(['b1']);
    expect(service.glossaries().map((g) => g.id)).toEqual(['a']);
  });

  it('creates a Blog AI glossary with kind: "blog_ai" in the body and files it under the Blog AI list', () => {
    service.addGlossary(input({ kind: 'blog_ai' }));

    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.kind).toBe('blog_ai');
    req.flush(glossary('b2', { kind: 'blog_ai' }));

    expect(service.blogAiGlossaries().map((g) => g.id)).toEqual(['b2']);
    expect(service.glossaries()).toEqual([]);
  });

  it('creates a Content glossary exactly as before - no kind in the body', () => {
    service.addGlossary(input());

    const req = httpMock.expectOne(API);
    expect('kind' in req.request.body).toBe(false);
    req.flush(glossary('c1'));

    expect(service.glossaries().map((g) => g.id)).toEqual(['c1']);
    expect(service.blogAiGlossaries()).toEqual([]);
  });

  it('updates and deletes a glossary in whichever list holds it', () => {
    service.glossaries.set([glossary('a')]);
    service.blogAiGlossaries.set([glossary('b1', { kind: 'blog_ai' })]);

    const update: UpdateGlossaryInput = { ...input(), allGlossRules: { ...input().allGlossRules, entries: [] } };
    service.updateGlossary('b1', update);
    const patch = httpMock.expectOne(`${API}/b1`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(glossary('b1', { glossaryName: 'Renamed', kind: 'blog_ai' }));
    expect(service.blogAiGlossaries()[0].glossaryName).toBe('Renamed');
    expect(service.glossaries()[0].glossaryName).toBe('G a');

    service.deleteGlossary('b1');
    httpMock.expectOne(`${API}/b1`).flush(null);
    expect(service.blogAiGlossaries()).toEqual([]);
    expect(service.glossaries()).toHaveLength(1);
  });

  it('glossariesFor returns the list of the requested kind', () => {
    expect(service.glossariesFor('blog_ai')).toBe(service.blogAiGlossaries);
    expect(service.glossariesFor('communication')).toBe(service.glossaries);
  });

  it('loads a glossary\'s entries from the same nested endpoint for both kinds', () => {
    service.loadEntries('b1');

    httpMock.expectOne(`${API}/b1/entries`).flush([]);
    expect(service.entries()).toEqual([]);
  });
});
