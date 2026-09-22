/**
 * A glossary - one row in the backend's `glossaries` table (e.g. the
 * EN->AZ or EN->RU glossary). Its terms live in
 * `allGlossRules.entries` and are managed through their own nested
 * endpoints, not through the glossary's own PATCH - see
 * GlossariesService.
 */
export type GlossaryStatus = 'standardized' | 'normalize' | 'context_dependent';

export const GLOSSARY_STATUSES: readonly GlossaryStatus[] = ['standardized', 'normalize', 'context_dependent'];

/**
 * One term inside a glossary's `allGlossRules.entries`. The
 * "do not use"/"recommended" fields are named after the glossary's
 * target language (e.g. `recommended_azerbaijani`/`do_not_use_russian`)
 * rather than being generic - `targetLanguageFieldKey()` below maps a
 * glossary's `target_language` to the right suffix so the UI can read
 * and write these dynamically-named fields.
 */
export interface GlossaryEntry {
  id: string;
  status: GlossaryStatus;
  usage_note: string | null;
  english_term: string;
  source_forms_found: string[];
  do_not_use_azerbaijani?: string[];
  recommended_azerbaijani?: string[];
  do_not_use_russian?: string[];
  recommended_russian?: string[];
}

export interface GlossaryRules {
  entries: GlossaryEntry[];
  purpose: string;
  instructions: Record<string, string>;
  language_pair: string;
  schema_version: string;
  source_language: string;
  target_language: string;
}

/** GET /glossaries item. */
export interface Glossary {
  id: string;
  glossaryName: string;
  setType: string[];
  allGlossRules: GlossaryRules;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for POST/PATCH /glossaries - only the glossary's own fields.
 * `entries` is intentionally left out: terms are created, updated and
 * deleted through their own nested endpoints (see GlossariesService),
 * never by PATCHing the glossary itself.
 */
export interface GlossaryRulesInput {
  purpose: string;
  instructions: Record<string, string>;
  language_pair: string;
  schema_version: string;
  source_language: string;
  target_language: string;
}

export interface CreateGlossaryInput {
  glossaryName: string;
  setType: string[];
  allGlossRules: GlossaryRulesInput;
}

/**
 * Body for POST/PATCH /glossaries/:id/entries[/:entryId]. The
 * language-specific `do_not_use_*`/`recommended_*` keys are built
 * dynamically (see targetLanguageFieldKey()), so this is intentionally
 * loose beyond the fields every entry always has.
 */
export type GlossaryEntryInput = {
  status: GlossaryStatus;
  usage_note: string | null;
  english_term: string;
  source_forms_found: string[];
} & Record<string, unknown>;

/**
 * Maps a glossary's `target_language` (e.g. "AZ", "RU") to the
 * field-name suffix its entries use for `do_not_use_*`/`recommended_*`
 * (e.g. "azerbaijani", "russian"). Falls back to the lowercased
 * language code itself for a target language not in this list yet, so
 * a future glossary still gets *a* consistent pair of field names
 * rather than crashing.
 */
const TARGET_LANGUAGE_FIELD_KEY: Record<string, string> = {
  AZ: 'azerbaijani',
  RU: 'russian',
};

export function targetLanguageFieldKey(targetLanguage: string): string {
  return TARGET_LANGUAGE_FIELD_KEY[targetLanguage] ?? targetLanguage.toLowerCase();
}
