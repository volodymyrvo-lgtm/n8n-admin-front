import { Component, computed, input } from '@angular/core';
import { RuleSetFields, RuleSetValue } from '../../../core/models/rule-set.model';

interface TreeEntry {
  key: string;
  value: string;
  children: RuleSetFields | null;
}

/**
 * A rule set's fields (`{ key: "text" | { nested... } }`, any depth) as an
 * indented read-only tree. Recursive: a nested object renders another
 * tree under its key.
 */
@Component({
  selector: 'app-rule-tree',
  templateUrl: './rule-tree.html',
  styleUrl: './rule-tree.css',
})
export class RuleTreeComponent {
  readonly fields = input.required<RuleSetFields>();

  protected readonly entries = computed<TreeEntry[]>(() =>
    Object.entries(this.fields()).map(([key, value]: [string, RuleSetValue]) =>
      typeof value === 'string' ? { key, value, children: null } : { key, value: '', children: value },
    ),
  );
}
