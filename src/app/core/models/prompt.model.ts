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
}

export interface CreatePromptInput {
  name: string;
  message: string;
}
