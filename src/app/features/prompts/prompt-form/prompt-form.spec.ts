import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { PromptsService } from '../../../core/services/prompts.service';
import { PromptFormComponent } from './prompt-form';

function configure(routeId: string | null, kind?: 'seo'): void {
  TestBed.configureTestingModule({
    imports: [PromptFormComponent],
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

describe('PromptFormComponent (create mode)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure(null);
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('does not submit while the form is invalid', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.componentInstance.submit();

    expect(fixture.componentInstance['form'].controls.name.touched).toBe(true);
  });

  it('creates a prompt and navigates to /prompts on valid submit', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    const promptsService = TestBed.inject(PromptsService);
    const router = TestBed.inject(Router);
    // navigateByUrl actually performs a route match against provideRouter([])
    // otherwise, which has nothing to match and rejects - mock it out so the
    // test only asserts that navigation was requested, not that it succeeded.
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ name: 'Welcome message', message: 'Hello there!' });
    fixture.componentInstance.submit();

    const req = httpMock.expectOne('http://localhost:3000/prompts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Welcome message', message: 'Hello there!' });
    req.flush({ id: 'p-1', name: 'Welcome message', message: 'Hello there!' });

    expect(promptsService.prompts().length).toBe(1);
    expect(promptsService.prompts()[0].name).toBe('Welcome message');
    expect(promptsService.prompts()[0].message).toBe('Hello there!');
    expect(navigateSpy).toHaveBeenCalledWith('/prompts');
  });

  it('shows an error toast and does not navigate when creating fails', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance['form'].setValue({ name: 'Welcome message', message: 'Hello there!' });
    fixture.componentInstance.submit();

    httpMock.expectOne('http://localhost:3000/prompts').flush('down', { status: 500, statusText: 'Error' });

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

describe('PromptFormComponent (edit mode)', () => {
  it('loads the existing prompt into the form and saves changes to it', () => {
    configure('p-1');
    TestBed.compileComponents();
    const httpMock = TestBed.inject(HttpTestingController);

    const promptsService = TestBed.inject(PromptsService);
    promptsService.prompts.set([{ id: 'p-1', name: 'Welcome message', message: 'Hello there!' }]);

    const fixture = TestBed.createComponent(PromptFormComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    expect(fixture.componentInstance['form'].controls.name.value).toBe('Welcome message');
    expect(fixture.componentInstance['form'].controls.message.value).toBe('Hello there!');

    fixture.componentInstance['form'].controls.message.setValue('Hello again!');
    fixture.componentInstance.submit();

    const req = httpMock.expectOne('http://localhost:3000/prompts/p-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Welcome message', message: 'Hello again!' });
    req.flush({ id: 'p-1', name: 'Welcome message', message: 'Hello again!' });

    expect(promptsService.prompts().length).toBe(1);
    expect(promptsService.prompts()[0].message).toBe('Hello again!');
    expect(navigateSpy).toHaveBeenCalledWith('/prompts');

    httpMock.verify();
  });

  it('redirects to the list when the prompt does not exist locally', () => {
    configure('missing');
    TestBed.compileComponents();
    const httpMock = TestBed.inject(HttpTestingController);

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(PromptFormComponent);

    expect(navigateSpy).toHaveBeenCalledWith('/prompts');

    httpMock.verify();
  });
});

describe('PromptFormComponent (auto-closing prompt tags)', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    configure(null);
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function textareaOf(fixture: ReturnType<typeof TestBed.createComponent>): HTMLTextAreaElement {
    return fixture.nativeElement.querySelector('#promptContent') as HTMLTextAreaElement;
  }

  // Simulates typing by setting the textarea's value/caret the way the
  // browser would right before it fires 'input', then dispatching it -
  // this is what the component's handler actually reacts to.
  function typeInto(textarea: HTMLTextAreaElement, value: string, cursor = value.length): void {
    textarea.value = value;
    textarea.setSelectionRange(cursor, cursor);
    textarea.dispatchEvent(new Event('input'));
  }

  it('mirrors a completed opening tag as a closing tag on the next line', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.detectChanges();
    const textarea = textareaOf(fixture);

    typeInto(textarea, '<system>');

    expect(textarea.value).toBe('<system>\n</system>');
    expect(fixture.componentInstance['form'].controls.message.value).toBe('<system>\n</system>');
    // caret stays right after the opening tag so typing continues inside it
    expect(textarea.selectionStart).toBe('<system>'.length);
  });

  it('mirrors an opening tag whose label contains spaces', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.detectChanges();
    const textarea = textareaOf(fixture);

    typeInto(textarea, '<some label>');

    expect(textarea.value).toBe('<some label>\n</some label>');
  });

  it('inserts the closing tag ahead of whatever already follows the caret', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.detectChanges();
    const textarea = textareaOf(fixture);

    // simulates typing the opening tag's '>' in the middle of existing text
    typeInto(textarea, '<system>rest of the prompt', '<system>'.length);

    expect(textarea.value).toBe('<system>\n</system>rest of the prompt');
  });

  it('does nothing when typing a closing tag', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.detectChanges();
    const textarea = textareaOf(fixture);

    typeInto(textarea, '<system>\n</system>');

    expect(textarea.value).toBe('<system>\n</system>');
  });

  it('does nothing for a self-closing tag', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.detectChanges();
    const textarea = textareaOf(fixture);

    typeInto(textarea, '<br/>');

    expect(textarea.value).toBe('<br/>');
  });

  it('does not duplicate the closing tag when it is already right there', () => {
    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.detectChanges();
    const textarea = textareaOf(fixture);

    // caret placed right after re-typing the opening tag's '>', with its
    // closing tag already sitting on the next line
    typeInto(textarea, '<system>\n</system>', '<system>'.length);

    expect(textarea.value).toBe('<system>\n</system>');
  });
});

describe('PromptFormComponent (SEO section)', () => {
  it('creates an SEO prompt with kind: "seo" in the body and goes back to the SEO prompts list', () => {
    configure(null, 'seo');
    TestBed.compileComponents();
    const httpMock = TestBed.inject(HttpTestingController);
    const promptsService = TestBed.inject(PromptsService);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PromptFormComponent);
    fixture.componentInstance['form'].setValue({ name: 'R048 brief', message: 'Write a page' });
    fixture.componentInstance.submit();

    const req = httpMock.expectOne('http://localhost:3000/prompts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'R048 brief', message: 'Write a page', kind: 'seo' });
    req.flush({ id: 's-1', name: 'R048 brief', message: 'Write a page', kind: 'seo' });

    expect(promptsService.seoPrompts().map((prompt) => prompt.id)).toEqual(['s-1']);
    expect(promptsService.prompts()).toEqual([]);
    expect(navigateSpy).toHaveBeenCalledWith('/seo/prompts');
    httpMock.verify();
  });

  it('edits an SEO prompt found in the SEO list (without re-sending kind) and goes back to the SEO list', () => {
    configure('s-1', 'seo');
    TestBed.compileComponents();
    const httpMock = TestBed.inject(HttpTestingController);
    const promptsService = TestBed.inject(PromptsService);
    promptsService.seoPrompts.set([{ id: 's-1', name: 'R048 brief', message: 'Write a page', kind: 'seo' }]);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PromptFormComponent);
    expect(fixture.componentInstance['form'].controls.name.value).toBe('R048 brief');

    fixture.componentInstance['form'].controls.message.setValue('Write a better page');
    fixture.componentInstance.submit();

    const req = httpMock.expectOne('http://localhost:3000/prompts/s-1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'R048 brief', message: 'Write a better page' });
    req.flush({ id: 's-1', name: 'R048 brief', message: 'Write a better page', kind: 'seo' });

    expect(promptsService.seoPrompts()[0].message).toBe('Write a better page');
    expect(navigateSpy).toHaveBeenCalledWith('/seo/prompts');
    httpMock.verify();
  });

  it('goes back to the SEO list when the prompt is not among the SEO prompts', () => {
    configure('c-1', 'seo');
    TestBed.compileComponents();
    const httpMock = TestBed.inject(HttpTestingController);
    // A communication prompt with that id exists, but this is the SEO section.
    TestBed.inject(PromptsService).prompts.set([{ id: 'c-1', name: 'Mailing', message: 'x' }]);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    TestBed.createComponent(PromptFormComponent);

    expect(navigateSpy).toHaveBeenCalledWith('/seo/prompts');
    httpMock.verify();
  });
});
