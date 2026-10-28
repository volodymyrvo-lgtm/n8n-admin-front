import { CdkDropList } from '@angular/cdk/drag-drop';
import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { EmailTemplateManifest } from '../../../core/models/email-template.model';
import { MjmlCompileResult, MjmlCompilerService } from '../../../core/services/mjml-compiler.service';
import { CodeEditorComponent } from '../../../shared/components/code-editor/code-editor';
import { EmailGenerationComponent } from './email-generation';

/** CodeMirror has its own spec; here the editor is a plain stand-in that shows the value it is given. */
@Component({ selector: 'app-code-editor', template: '<pre data-testid="editor">{{ value() }}</pre>' })
class StubCodeEditorComponent {
  readonly value = input.required<string>();
  readonly ariaLabel = input<string>('');
  readonly valueChange = output<string>();
}

const MANIFEST: EmailTemplateManifest = {
  id: 'demo',
  name: 'Demo',
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Hello', section: 'Content' },
    { key: 'intro', label: 'Intro', type: 'textarea', default: 'Welcome', section: 'Content' },
    { key: 'link', label: 'Link', type: 'url', default: 'https://example.com', section: 'Links' },
  ],
  groups: [
    {
      key: 'bonuses',
      label: 'Bonus blocks',
      addLabel: 'Add bonus block',
      itemLabel: 'Bonus',
      min: 1,
      max: 3,
      fields: [{ key: 'name', label: 'Name', type: 'text', default: 'New bonus' }],
      defaults: [{ name: 'First' }, { name: 'Second' }],
    },
  ],
};

const SOURCE = '<mjml>[[title]] [[intro]] <a href="[[link]]">x</a><!-- repeat:bonuses -->[[name]];<!-- /repeat --></mjml>';

describe('EmailGenerationComponent', () => {
  let httpMock: HttpTestingController;
  const compile = vi.fn<(mjml: string) => Promise<MjmlCompileResult>>();

  beforeEach(() => {
    vi.useFakeTimers();
    compile.mockReset();
    compile.mockImplementation(async (mjml) => ({ html: `<html><head></head><body>${mjml}</body></html>`, errors: [] }));
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  async function setup(options: { templates?: { id: string; name: string }[]; manifest?: EmailTemplateManifest } = {}) {
    TestBed.configureTestingModule({
      imports: [EmailGenerationComponent],
      providers: [provideTranslateService(), provideHttpClient(), provideHttpClientTesting(), { provide: MjmlCompilerService, useValue: { compile } }],
    });
    TestBed.overrideComponent(EmailGenerationComponent, { remove: { imports: [CodeEditorComponent] }, add: { imports: [StubCodeEditorComponent] } });
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(EmailGenerationComponent);
    fixture.detectChanges();
    httpMock.expectOne('/email-templates/index.json').flush(options.templates ?? [{ id: 'demo', name: 'Demo' }]);
    fixture.detectChanges();
    if ((options.templates ?? [1]).length > 0) {
      httpMock.expectOne('/email-templates/demo/template.json').flush(options.manifest ?? MANIFEST);
      httpMock.expectOne('/email-templates/demo/template.mjml').flush(SOURCE);
      fixture.detectChanges();
    }
    await settle(fixture);
    return fixture;
  }

  /** Lets the debounced compile run, then renders what it produced. */
  async function settle(fixture: { detectChanges: () => void }) {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(400);
    fixture.detectChanges();
  }

  const q = <T extends HTMLElement>(fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as T | null;
  const frameDoc = (fixture: { nativeElement: HTMLElement }) => (q<HTMLIFrameElement>(fixture, 'preview')!).srcdoc;

  function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  }

  it('loads the first template and builds the form from its manifest, grouping fields by section', async () => {
    const fixture = await setup();
    const el: HTMLElement = fixture.nativeElement;

    expect(Array.from(el.querySelectorAll('.email-section legend')).map((n) => n.textContent?.trim())).toEqual(['Content', 'Links', 'Bonus blocks']);
    expect(q<HTMLInputElement>(fixture, 'field-title')!.value).toBe('Hello');
    expect(q<HTMLTextAreaElement>(fixture, 'field-intro')!.tagName).toBe('TEXTAREA');
    expect(el.querySelectorAll('[data-testid="group-item"]')).toHaveLength(2);
  });

  it('compiles the filled-in MJML and shows it in the sandboxed preview', async () => {
    const fixture = await setup();

    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile.mock.calls[0][0]).toBe('<mjml>Hello Welcome <a href="https://example.com">x</a>First;Second;</mjml>');
    expect(q(fixture, 'preview')!.getAttribute('sandbox')).toBe('');
    expect(frameDoc(fixture)).toContain('Hello Welcome');
    expect(frameDoc(fixture)).toContain('<base target="_blank">');
  });

  it('recompiles once after a burst of typing, not on every keystroke', async () => {
    const fixture = await setup();
    compile.mockClear();

    const title = q<HTMLInputElement>(fixture, 'field-title')!;
    for (const value of ['H', 'He', 'Hey']) {
      type(title, value);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(100);
    }
    await settle(fixture);

    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile.mock.calls[0][0]).toContain('Hey Welcome');
  });

  it('adds a bonus block with the "Add" button and shows it in the MJML', async () => {
    const fixture = await setup();

    q<HTMLButtonElement>(fixture, 'add-item')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="group-item"]')).toHaveLength(3);
    await settle(fixture);

    expect(compile.mock.calls.at(-1)![0]).toContain('First;Second;New bonus;');
    expect(q<HTMLButtonElement>(fixture, 'add-item')!.disabled).toBe(true);
  });

  it('edits a field of one block only', async () => {
    const fixture = await setup();

    const second = fixture.nativeElement.querySelectorAll('[data-testid="group-item"]')[1].querySelector('input') as HTMLInputElement;
    type(second, 'Changed');
    await settle(fixture);

    expect(compile.mock.calls.at(-1)![0]).toContain('First;Changed;');
  });

  it('removes the block whose button was pressed', async () => {
    const fixture = await setup({ manifest: { ...MANIFEST, groups: [{ ...MANIFEST.groups![0], min: 0 }] } });

    (fixture.nativeElement.querySelectorAll('[data-testid="remove-item"]')[1] as HTMLButtonElement).click();
    await settle(fixture);

    expect(compile.mock.calls.at(-1)![0]).toContain('First;</mjml>');
    expect(compile.mock.calls.at(-1)![0]).not.toContain('Second');
  });

  it('removes a block, but not below the minimum', async () => {
    const fixture = await setup();

    q<HTMLButtonElement>(fixture, 'remove-item')!.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="group-item"]')).toHaveLength(1);
    expect(q<HTMLButtonElement>(fixture, 'remove-item')!.disabled).toBe(true);
    await settle(fixture);

    expect(compile.mock.calls.at(-1)![0]).toContain('Second;');
    expect(compile.mock.calls.at(-1)![0]).not.toContain('First;');
  });

  it('warns about a link that can not be used and leaves it out of the email', async () => {
    const fixture = await setup();

    type(q<HTMLInputElement>(fixture, 'field-link')!, 'javascript:alert(1)');
    await settle(fixture);

    expect(q(fixture, 'bad-url')).not.toBeNull();
    expect(compile.mock.calls.at(-1)![0]).toContain('<a href="">');
  });

  it('resets all fields to their defaults', async () => {
    const fixture = await setup();
    type(q<HTMLInputElement>(fixture, 'field-title')!, 'Changed');
    q<HTMLButtonElement>(fixture, 'add-item')!.click();
    fixture.detectChanges();

    q<HTMLButtonElement>(fixture, 'reset-values')!.click();
    fixture.detectChanges();

    expect(q<HTMLInputElement>(fixture, 'field-title')!.value).toBe('Hello');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="group-item"]')).toHaveLength(2);
  });

  it('shows the template source on the MJML tab, notes an edit and resets it', async () => {
    const fixture = await setup();

    q<HTMLButtonElement>(fixture, 'tab-mjml')!.click();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();
    expect(q(fixture, 'mjml-panel')).not.toBeNull();
    expect(q(fixture, 'fields-panel')).toBeNull();
    expect(q(fixture, 'editor')!.textContent).toBe(SOURCE);
    expect(q(fixture, 'source-edited')).toBeNull();

    const editor = fixture.debugElement.query((d) => d.name === 'app-code-editor');
    editor.componentInstance.valueChange.emit('<mjml>[[title]] changed [[oops]]</mjml>');
    await settle(fixture);

    expect(q(fixture, 'source-edited')).not.toBeNull();
    expect(compile.mock.calls.at(-1)![0]).toBe('<mjml>Hello changed [[oops]]</mjml>');
    expect(q(fixture, 'unknown-variables')!.textContent).toContain('oops');

    q<HTMLButtonElement>(fixture, 'reset-source')!.click();
    await settle(fixture);
    expect(q(fixture, 'source-edited')).toBeNull();
    expect(q(fixture, 'unknown-variables')).toBeNull();
    expect(compile.mock.calls.at(-1)![0]).toContain('Hello Welcome');
  });

  it('switches the preview between desktop and mobile width', async () => {
    const fixture = await setup();
    const frame = () => fixture.nativeElement.querySelector('.email-frame') as HTMLElement;
    expect(frame().classList).not.toContain('email-frame--mobile');

    q<HTMLButtonElement>(fixture, 'device-mobile')!.click();
    fixture.detectChanges();
    expect(frame().classList).toContain('email-frame--mobile');

    q<HTMLButtonElement>(fixture, 'device-desktop')!.click();
    fixture.detectChanges();
    expect(frame().classList).not.toContain('email-frame--mobile');
  });

  it('lists MJML errors and keeps the last good preview', async () => {
    const fixture = await setup();
    const good = frameDoc(fixture);

    compile.mockResolvedValueOnce({ html: '', errors: [{ message: 'Unclosed tag', line: 3 }] });
    type(q<HTMLInputElement>(fixture, 'field-title')!, 'x');
    await settle(fixture);

    expect(q(fixture, 'compile-errors')!.textContent).toContain('L3: Unclosed tag');
    expect(frameDoc(fixture)).toBe(good);
  });

  it('ignores a compile that finishes after a newer one was started', async () => {
    const fixture = await setup();
    let finishSlow!: (r: MjmlCompileResult) => void;
    compile.mockReset();
    compile.mockImplementationOnce(() => new Promise((resolve) => (finishSlow = resolve)));
    compile.mockImplementation(async (mjml) => ({ html: `<html><head></head><body>FAST ${mjml}</body></html>`, errors: [] }));

    type(q<HTMLInputElement>(fixture, 'field-title')!, 'one');
    await settle(fixture);
    type(q<HTMLInputElement>(fixture, 'field-title')!, 'two');
    await settle(fixture);
    finishSlow({ html: '<html><head></head><body>SLOW</body></html>', errors: [] });
    await vi.advanceTimersByTimeAsync(10);
    fixture.detectChanges();

    expect(frameDoc(fixture)).toContain('FAST');
    expect(frameDoc(fixture)).not.toContain('SLOW');
  });

  it('says so when the template list can not be loaded', async () => {
    TestBed.configureTestingModule({
      imports: [EmailGenerationComponent],
      providers: [provideTranslateService(), provideHttpClient(), provideHttpClientTesting(), { provide: MjmlCompilerService, useValue: { compile } }],
    });
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EmailGenerationComponent);
    fixture.detectChanges();

    httpMock.expectOne('/email-templates/index.json').flush('nope', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(q(fixture, 'list-failed')).not.toBeNull();
  });

  it('says so when a template can not be loaded', async () => {
    TestBed.configureTestingModule({
      imports: [EmailGenerationComponent],
      providers: [provideTranslateService(), provideHttpClient(), provideHttpClientTesting(), { provide: MjmlCompilerService, useValue: { compile } }],
    });
    await TestBed.compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EmailGenerationComponent);
    fixture.detectChanges();
    httpMock.expectOne('/email-templates/index.json').flush([{ id: 'demo', name: 'Demo' }]);
    httpMock.expectOne('/email-templates/demo/template.json').flush('x', { status: 500, statusText: 'Server Error' });
    httpMock.match('/email-templates/demo/template.mjml');
    fixture.detectChanges();

    expect(q(fixture, 'template-failed')).not.toBeNull();
  });

  it('loads another template when it is picked, starting from its defaults', async () => {
    const fixture = await setup({ templates: [{ id: 'demo', name: 'Demo' }, { id: 'other', name: 'Other' }] });
    type(q<HTMLInputElement>(fixture, 'field-title')!, 'Changed');

    const select = q<HTMLSelectElement>(fixture, 'template-select')!;
    select.value = 'other';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    httpMock.expectOne('/email-templates/other/template.json').flush({ ...MANIFEST, id: 'other', name: 'Other' });
    httpMock.expectOne('/email-templates/other/template.mjml').flush(SOURCE);
    fixture.detectChanges();

    expect(q<HTMLInputElement>(fixture, 'field-title')!.value).toBe('Hello');
  });
  describe('ordering the blocks', () => {
    const order = () => compile.mock.calls.at(-1)![0].match(/(First|Second|New bonus);/g);
    const dropList = (fixture: { debugElement: import('@angular/core').DebugElement }) => fixture.debugElement.query(By.directive(CdkDropList));

    it('shows a group right after the field it names, and the rest at the end', async () => {
      const fixture = await setup({ manifest: { ...MANIFEST, groups: [{ ...MANIFEST.groups![0], after: 'title' }] } });

      // title is the first "Content" field; the group splits the section, so intro continues under its own run of fields.
      const parts = Array.from(fixture.nativeElement.querySelectorAll('.email-section')).map((n) => (n as HTMLElement).querySelector('legend')?.textContent?.trim() ?? '(fields)');
      expect(parts).toEqual(['Content', 'Bonus blocks', '(fields)', 'Links']);
    });

    it('moves a block to where it was dropped', async () => {
      const fixture = await setup();

      dropList(fixture).triggerEventHandler('cdkDropListDropped', { previousIndex: 0, currentIndex: 1 });
      await settle(fixture);

      expect(order()).toEqual(['Second;', 'First;']);
      const inputs = fixture.nativeElement.querySelectorAll('[data-testid="group-item"] input') as NodeListOf<HTMLInputElement>;
      expect(Array.from(inputs).map((i) => i.value)).toEqual(['Second', 'First']);
    });

    it('moves a block with the arrow keys on its handle, keeping the focus on it', async () => {
      const fixture = await setup();
      const handles = () => fixture.nativeElement.querySelectorAll('[data-testid="drag-handle"]') as NodeListOf<HTMLButtonElement>;

      handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle(fixture);

      expect(order()).toEqual(['Second;', 'First;']);
      expect(document.activeElement).toBe(handles()[1]);

      // Already last: nothing moves any further.
      handles()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle(fixture);
      expect(order()).toEqual(['Second;', 'First;']);

      handles()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await settle(fixture);
      expect(order()).toEqual(['First;', 'Second;']);
    });

    it('has no drag handle while there is only one block', async () => {
      const fixture = await setup({ manifest: { ...MANIFEST, groups: [{ ...MANIFEST.groups![0], min: 0, defaults: [{ name: 'Solo' }] }] } });

      expect(fixture.nativeElement.querySelector('[data-testid="drag-handle"]')).toBeNull();

      q<HTMLButtonElement>(fixture, 'add-item')!.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('[data-testid="drag-handle"]')).toHaveLength(2);
    });

    it('keeps the typed text with its block after a move', async () => {
      const fixture = await setup();
      const first = fixture.nativeElement.querySelectorAll('[data-testid="group-item"] input')[0] as HTMLInputElement;
      type(first, 'Edited first');
      fixture.detectChanges();

      dropList(fixture).triggerEventHandler('cdkDropListDropped', { previousIndex: 0, currentIndex: 1 });
      await settle(fixture);

      expect(compile.mock.calls.at(-1)![0]).toContain('Second;Edited first;');
    });
  });
});
