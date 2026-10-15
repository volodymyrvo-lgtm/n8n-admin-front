/**
 * A prompt used somewhere in the n8n flows this admin panel configures.
 *
 * The exact shape (extra metadata, variables, versioning, etc.) is not
 * decided yet - for now a prompt is just a name plus its raw text, and
 * this will grow once that's figured out.
 */
export interface Prompt {
  id: string;
  name: string;
  message: string;
  /** Which part of the app the prompt belongs to; the backend defaults it to `communication`. */
  kind?: PromptKind;
}

/** Prompts are split by the flow that uses them: CRM mailings (the default) or SEO generation. */
export type PromptKind = 'communication' | 'seo';

export interface CreatePromptInput {
  name: string;
  message: string;
  /** Optional - leave it out for a communication prompt (the backend's default); SEO prompts send `'seo'`. */
  kind?: PromptKind;
}
