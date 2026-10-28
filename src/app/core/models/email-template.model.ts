/** How a template field is edited, and how its value is made safe when it is put into the MJML. */
export type EmailFieldType = 'text' | 'textarea' | 'url';

/** One variable of a template: `[[key]]` in `template.mjml`. */
export interface EmailTemplateField {
  key: string;
  label: string;
  type: EmailFieldType;
  /** The value the form starts with. */
  default: string;
  /** Fields with the same `section` are shown together under that heading. */
  section?: string;
  hint?: string;
}

/**
 * A block that can be repeated, e.g. the bonuses: the part of the template
 * between `<!-- repeat:key -->` and `<!-- /repeat -->` is written once per
 * item (and an optional `<!-- separator -->` inside it only between items).
 */
export interface EmailTemplateGroup {
  key: string;
  /** Heading of the group in the form. */
  label: string;
  /** Text of the "add" button, e.g. "Add bonus block". */
  addLabel: string;
  /** Name of one item, numbered in the form: "Bonus" -> "Bonus 1". */
  itemLabel: string;
  /** The variables of one item - they are the `[[key]]`s inside the repeat. */
  fields: EmailTemplateField[];
  /** The items the form starts with. */
  defaults: Record<string, string>[];
  /** Where the group is shown in the form: right after the field with this key (default: at the end, after all fields). */
  after?: string;
  min?: number;
  max?: number;
}

/** `template.json` next to a `template.mjml`. */
export interface EmailTemplateManifest {
  id: string;
  name: string;
  description?: string;
  fields: EmailTemplateField[];
  groups?: EmailTemplateGroup[];
}

/** An entry of `email-templates/index.json` (generated from the folders by `npm run email-templates:index`). */
export interface EmailTemplateListItem {
  id: string;
  name: string;
  description?: string;
}

/** What the form holds: the single variables, and the items of every repeatable group. */
export interface EmailTemplateValues {
  fields: Record<string, string>;
  groups: Record<string, Record<string, string>[]>;
}

export interface EmailTemplateRender {
  /** The MJML with every variable filled in and the repeats expanded. */
  mjml: string;
  /** `[[variables]]` (and `repeat:` groups) the template uses that the manifest doesn't declare; they are left as they are. */
  unknown: string[];
}

export function defaultEmailValues(manifest: EmailTemplateManifest): EmailTemplateValues {
  const fields: Record<string, string> = {};
  for (const field of manifest.fields) {
    fields[field.key] = field.default;
  }
  const groups: Record<string, Record<string, string>[]> = {};
  for (const group of manifest.groups ?? []) {
    groups[group.key] = group.defaults.map((item) => ({ ...item }));
  }
  return { fields, groups };
}

/** A new, empty item of a group (its fields start from their defaults). */
export function newGroupItem(group: EmailTemplateGroup): Record<string, string> {
  return Object.fromEntries(group.fields.map((field) => [field.key, field.default]));
}

/** A copy of `list` with the item at `from` moved to `to` (what dragging an item in the form does); out-of-range indexes change nothing. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Whether a link can be put into the email: anything except the schemes
 * that run code or embed data (also when hidden behind whitespace or control
 * characters). Personalization tokens like `%%unsub_url%%` or `{{ url }}`
 * are fine - they are filled in later by the sending service.
 */
export function isSafeUrl(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  const compact = value.replace(/[\u0000-  ]/g, '').toLowerCase();
  return !/^(javascript|vbscript|data):/.test(compact);
}

const PLACEHOLDER = /\[\[\s*([A-Za-z0-9_]+)\s*\]\]/g;
const REPEAT_BLOCK = /<!--\s*repeat:([A-Za-z0-9_]+)\s*-->([\s\S]*?)<!--\s*\/repeat\s*-->/g;
const SEPARATOR = /<!--\s*separator\s*-->/;

function renderValue(field: EmailTemplateField, value: string): string {
  if (field.type === 'url') {
    return isSafeUrl(value) ? escapeHtml(value.trim()) : '';
  }
  const escaped = escapeHtml(value);
  return field.type === 'textarea' ? escaped.replace(/\r?\n/g, '<br />') : escaped;
}

/** Fills the `[[variables]]` of one piece of template in a single pass (so a value that looks like a variable is never filled in again). */
function fill(text: string, fields: ReadonlyMap<string, EmailTemplateField>, lookup: (key: string) => string | undefined): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    const field = fields.get(key);
    return field ? renderValue(field, lookup(key) ?? '') : whole;
  });
}

/**
 * Turns a template and the form's values into the MJML to compile: every
 * repeat block is written out once per item (a group with no items leaves
 * nothing behind), and every `[[variable]]` is replaced by its value - text
 * is HTML-escaped, links are checked - so what is typed in the form can't
 * break the markup. Personalization tokens (`{{ ... }}`, `%x%`, `%%x%%`) are
 * left alone for the sending service, and so is a `[[variable]]` the manifest
 * doesn't declare (reported in `unknown`).
 */
export function renderEmailTemplate(source: string, manifest: EmailTemplateManifest, values: EmailTemplateValues): EmailTemplateRender {
  const globalFields = new Map(manifest.fields.map((field) => [field.key, field]));
  const groups = new Map((manifest.groups ?? []).map((group) => [group.key, group]));

  let mjml = '';
  let last = 0;
  for (const match of source.matchAll(REPEAT_BLOCK)) {
    const [block, key, body] = match;
    mjml += fill(source.slice(last, match.index), globalFields, (k) => values.fields[k]);
    last = match.index + block.length;

    const group = groups.get(key);
    if (!group) {
      continue;
    }
    const [itemTemplate, separatorTemplate = ''] = body.split(SEPARATOR);
    // Inside a repeat, `[[x]]` is the item's own field; a variable that is not one of the item's falls back to the global one.
    const itemKeys = new Set(group.fields.map((field) => field.key));
    const fields = new Map([...globalFields, ...group.fields.map((field): [string, EmailTemplateField] => [field.key, field])]);
    const items = values.groups[key] ?? [];
    mjml += items
      .map((item, index) => {
        const lookup = (k: string) => (itemKeys.has(k) ? item[k] : values.fields[k]);
        const separator = index < items.length - 1 ? fill(separatorTemplate, fields, lookup) : '';
        return fill(itemTemplate, fields, lookup) + separator;
      })
      .join('');
  }
  mjml += fill(source.slice(last), globalFields, (k) => values.fields[k]);

  return { mjml, unknown: emailTemplateIssues(source, manifest).unknown };
}

/**
 * What a template and its manifest disagree on, found by reading the template
 * alone (so also for a repeat that has no items right now): `unknown` are
 * variables or repeat groups the template uses but the manifest doesn't
 * declare, `unused` are declared fields the template never mentions.
 */
export function emailTemplateIssues(source: string, manifest: EmailTemplateManifest): { unknown: string[]; unused: string[] } {
  const globalKeys = new Set(manifest.fields.map((field) => field.key));
  const groups = new Map((manifest.groups ?? []).map((group) => [group.key, group]));
  const unknown = new Set<string>();
  const used = new Set<string>();

  const scan = (text: string, known: ReadonlySet<string>) => {
    for (const found of text.matchAll(PLACEHOLDER)) {
      used.add(found[1]);
      if (!known.has(found[1])) {
        unknown.add(found[1]);
      }
    }
  };

  let last = 0;
  for (const match of source.matchAll(REPEAT_BLOCK)) {
    scan(source.slice(last, match.index), globalKeys);
    last = match.index + match[0].length;
    const group = groups.get(match[1]);
    if (!group) {
      unknown.add(`repeat:${match[1]}`);
      continue;
    }
    scan(match[2], new Set([...globalKeys, ...group.fields.map((field) => field.key)]));
  }
  scan(source.slice(last), globalKeys);

  const declared = [...manifest.fields, ...(manifest.groups ?? []).flatMap((group) => group.fields)];
  return { unknown: [...unknown], unused: declared.map((field) => field.key).filter((key) => !used.has(key)) };
}
