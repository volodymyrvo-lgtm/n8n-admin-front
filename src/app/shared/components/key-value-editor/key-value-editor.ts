import { Component, input, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * One row in the editor: either a plain key/value pair, or a "group"
 * row whose value is itself a nested list of rows (recursively, to any
 * depth) - this is what lets the editor build structures like:
 *
 *   { "Bonus Block": { "bonus 1": { "Min Deposit": "10", ... }, ... } }
 */
export interface KeyValueRow {
  id: string;
  key: string;
  isGroup: boolean;
  value: string;
  children: KeyValueRow[];
}

let nextRowId = 0;

export function createRow(overrides: Partial<KeyValueRow> = {}): KeyValueRow {
  nextRowId += 1;
  return {
    id: `kv-${Date.now()}-${nextRowId}`,
    key: '',
    isGroup: false,
    value: '',
    children: [],
    ...overrides,
  };
}

@Component({
  selector: 'app-key-value-editor',
  imports: [TranslatePipe, KeyValueEditorComponent],
  templateUrl: './key-value-editor.html',
  styleUrl: './key-value-editor.css',
})
export class KeyValueEditorComponent {
  readonly rows = model.required<KeyValueRow[]>();
  readonly depth = input(0);

  addField(): void {
    this.rows.update((rows) => [...rows, createRow()]);
  }

  addGroup(): void {
    this.rows.update((rows) => [...rows, createRow({ isGroup: true })]);
  }

  removeRow(id: string): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }
}
