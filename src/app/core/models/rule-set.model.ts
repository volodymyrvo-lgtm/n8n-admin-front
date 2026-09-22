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

export interface RuleSet {
  id?: string;
  ruleName: string;
  ruleSet: RuleSetFields;
  setType: SetType[];
}

export interface CreateRuleSetInput {
  ruleName: string;
  ruleSet: RuleSetFields;
  setType: SetType[];
}
