/**
 * A rule set's fields are a plain object keyed by field name, matching
 * exactly what the backend sends/expects - e.g.
 *
 *   { "Segment": "Deposit Count = 0", "Bonus Block": { "bonus 1": { ... } } }
 *
 * A value is either a plain string, or a nested object of the same
 * shape - this is what lets "Bonus Block" be a group of named
 * sub-groups (bonus 1, bonus 2, ...), each itself a flat set of
 * key/value pairs, to any depth.
 */
export type RuleSetValue = string | RuleSetFields;

export interface RuleSetFields {
  [key: string]: RuleSetValue;
}

/** A channel a rule set can be delivered through. Multiple can be selected at once. */
export type SetType =
  | 'email'
  | 'sms'
  | 'push'
  | 'toneOfVoice'
  | 'humanaizer'
  | 'web_push'
  | 'in_app'
  | 'notification_center';

export const SET_TYPES: readonly SetType[] = [
  'email',
  'sms',
  'toneOfVoice',
  'humanaizer',
  'web_push',
  'in_app',
  'notification_center',
];

/** SEO rules only come in the two roles the SEO job form picks by - tone of voice and humanizer (there is no main rule set). */
export const SEO_SET_TYPES: readonly SetType[] = ['toneOfVoice', 'humanaizer'];

/** Rule sets are split by the flow that uses them: CRM mailings (the default) or SEO generation. The kind is set by the route a rule is created through, never by the client. */
export type RuleSetKind = 'communication' | 'seo';

export interface RuleSet {
  id?: string;
  /** Which part of the app the rule belongs to (the backend fills it in); read-only on the client. */
  kind?: RuleSetKind;
  ruleName: string;
  ruleSet: RuleSetFields;
  setType: SetType[];
}

export interface CreateRuleSetInput {
  ruleName: string;
  ruleSet: RuleSetFields;
  setType: SetType[];
}
