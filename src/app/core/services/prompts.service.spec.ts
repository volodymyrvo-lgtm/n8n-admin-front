import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Prompt } from '../models/prompt.model';
import { PromptsService } from './prompts.service';

const API = 'http://localhost:3000/prompts';

const prompt = (id: string, extra: Partial<Prompt> = {}): Prompt => ({ id, name: `P ${id}`, message: 'text', ...extra });

describe('PromptsService', () => {
  let service: PromptsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PromptsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads communication prompts with the original, parameterless request', () => {
    service.loadPrompts();

    const req = httpMock.expectOne(API);
    expect(req.request.params.keys()).toEqual([]);
    req.flush([prompt('a')]);

    expect(service.prompts().map((p) => p.id)).toEqual(['a']);
    expect(service.seoPrompts()).toEqual([]);
    expect(service.loading()).toBe(false);
  });

  it('loads SEO prompts with ?kind=seo into their own list, leaving the communication one alone', () => {
    service.prompts.set([prompt('a')]);
    service.loadPrompts('seo');

    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('kind')).toBe('seo');
    req.flush([prompt('s1', { kind: 'seo' })]);

    expect(service.seoPrompts().map((p) => p.id)).toEqual(['s1']);
    expect(service.prompts().map((p) => p.id)).toEqual(['a']);
  });

  it('sends kind: "seo" when creating an SEO prompt and files it under the SEO list', () => {
    service.addPrompt({ name: 'N', message: 'M', kind: 'seo' });

    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'N', message: 'M', kind: 'seo' });
    req.flush(prompt('s2', { kind: 'seo' }));

    expect(service.seoPrompts().map((p) => p.id)).toEqual(['s2']);
    expect(service.prompts()).toEqual([]);
  });

  it('creates a communication prompt exactly as before - no kind in the body', () => {
    service.addPrompt({ name: 'N', message: 'M' });

    const req = httpMock.expectOne(API);
    expect(req.request.body).toEqual({ name: 'N', message: 'M' });
    req.flush(prompt('c1'));

    expect(service.prompts().map((p) => p.id)).toEqual(['c1']);
    expect(service.seoPrompts()).toEqual([]);
  });

  it('updates and deletes a prompt in whichever list holds it', () => {
    service.prompts.set([prompt('a')]);
    service.seoPrompts.set([prompt('s1', { kind: 'seo' })]);

    service.updatePrompt('s1', { name: 'Renamed', message: 'M2' });
    const patch = httpMock.expectOne(`${API}/s1`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(prompt('s1', { name: 'Renamed', kind: 'seo' }));
    expect(service.seoPrompts()[0].name).toBe('Renamed');
    expect(service.prompts()[0].name).toBe('P a');

    service.deletePrompt('s1');
    httpMock.expectOne(`${API}/s1`).flush(null);
    expect(service.seoPrompts()).toEqual([]);
    expect(service.prompts()).toHaveLength(1);
  });

  it('promptsFor returns the list of the requested kind', () => {
    expect(service.promptsFor('seo')).toBe(service.seoPrompts);
    expect(service.promptsFor('communication')).toBe(service.prompts);
  });
});
