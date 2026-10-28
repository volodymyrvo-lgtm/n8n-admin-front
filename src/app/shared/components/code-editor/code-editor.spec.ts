import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { CodeEditorComponent } from './code-editor';

@Component({
  imports: [CodeEditorComponent],
  template: `<app-code-editor [value]="text()" ariaLabel="MJML" (valueChange)="changes.push($event); text.set($event)" />`,
})
class HostComponent {
  readonly text = signal('<mjml></mjml>');
  readonly changes: string[] = [];
}

describe('CodeEditorComponent', () => {
  it('shows the value, reports edits and takes a new value from outside', async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const view = EditorView.findFromDOM(el.querySelector('.cm-editor') as HTMLElement)!;

    expect(view.state.doc.toString()).toBe('<mjml></mjml>');
    expect(el.querySelector('.cm-content')?.getAttribute('aria-label')).toBe('MJML');

    view.dispatch({ changes: { from: 0, insert: '<!-- x -->' } });
    expect(fixture.componentInstance.changes).toEqual(['<!-- x --><mjml></mjml>']);

    fixture.componentInstance.text.set('<mjml>reset</mjml>');
    fixture.detectChanges();
    expect(view.state.doc.toString()).toBe('<mjml>reset</mjml>');
    // Taking the value from outside is not an edit.
    expect(fixture.componentInstance.changes).toHaveLength(1);
  });
});
