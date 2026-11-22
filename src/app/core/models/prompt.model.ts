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

/** Prompts are split by the flow that uses them: CRM mailings (the default), SEO generation or the Blog AI assistant. */
export type PromptKind = 'communication' | 'seo' | 'blog_ai';

/** Where each kind's own list/form pages live (see app.routes.ts) - the form pages are `<base>/new` and `<base>/:id/edit`. */
export const PROMPT_BASE_PATHS: Record<PromptKind, string> = {
  communication: '/prompts',
  seo: '/seo/prompts',
  blog_ai: '/blog-ai/prompts',
};

/** Reads a route's `data.kind`; anything but `seo` / `blog_ai` is the default communication kind. */
export function promptKindOf(value: unknown): PromptKind {
  return value === 'seo' || value === 'blog_ai' ? value : 'communication';
}

export interface CreatePromptInput {
  name: string;
  message: string;
  /** Optional - leave it out for a communication prompt (the backend's default); SEO prompts send `'seo'`, Blog AI ones `'blog_ai'` (on edit too). */
  kind?: PromptKind;
}
