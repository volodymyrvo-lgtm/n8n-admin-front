import { AfterViewInit, Component, effect, ElementRef, input, OnDestroy, output, viewChild } from '@angular/core';
import { html } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';

/**
 * A code editor (CodeMirror 6, HTML/XML highlighting - fine for MJML) that
 * behaves like a form control: it shows `value` and reports edits through
 * `valueChange`. A `value` that differs from what is in the editor (e.g.
 * after "reset") replaces the text.
 */
@Component({
  selector: 'app-code-editor',
  template: '<div class="code-editor" #host></div>',
  styles: ':host { display: block; min-width: 0; } .code-editor { height: 100%; }',
})
export class CodeEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input.required<string>();
  readonly ariaLabel = input<string>('');
  readonly valueChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private view: EditorView | null = null;
  /** True while `value` is being written into the editor: that is not an edit by the user. */
  private applyingValue = false;

  constructor() {
    effect(() => {
      const value = this.value();
      const view = this.view;
      if (view && view.state.doc.toString() !== value) {
        this.applyingValue = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
        this.applyingValue = false;
      }
    });
  }

  ngAfterViewInit(): void {
    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: EditorState.create({
        doc: this.value(),
        extensions: [
          basicSetup,
          html(),
          oneDark,
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { height: '100%', maxHeight: '70vh', fontSize: '12.5px', borderRadius: '8px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', monospace" },
          }),
          EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.applyingValue) {
              this.valueChange.emit(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }
}
