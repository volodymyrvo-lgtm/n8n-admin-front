import { Injectable } from '@angular/core';

export interface MjmlCompileError {
  message: string;
  line?: number;
}

export interface MjmlCompileResult {
  /** The email HTML; empty when MJML couldn't produce any. */
  html: string;
  errors: MjmlCompileError[];
}

interface MjmlResult {
  html: string;
  errors?: { message?: string; formattedMessage?: string; line?: number }[];
}
type Mjml2Html = (mjml: string, options?: Record<string, unknown>) => Promise<MjmlResult> | MjmlResult;

/**
 * Compiles MJML to email HTML in the browser (`mjml-browser`, loaded only
 * when the first compile is asked for, so it stays out of the main bundle).
 * Problems with the markup come back as `errors` instead of being thrown -
 * MJML's "soft" validation still returns HTML when it can.
 */
@Injectable({ providedIn: 'root' })
export class MjmlCompilerService {
  private mjml2html: Promise<Mjml2Html> | null = null;

  async compile(mjml: string): Promise<MjmlCompileResult> {
    try {
      const compile = await this.load();
      const result = await compile(mjml, { validationLevel: 'soft' });
      return {
        html: result.html ?? '',
        errors: (result.errors ?? []).map((error) => ({
          message: error.message ?? error.formattedMessage ?? 'Unknown MJML error',
          line: error.line,
        })),
      };
    } catch (error) {
      return { html: '', errors: [{ message: error instanceof Error ? error.message : String(error) }] };
    }
  }

  private load(): Promise<Mjml2Html> {
    this.mjml2html ??= import('mjml-browser').then((module) => {
      const exported = module as unknown as { default?: Mjml2Html } & Mjml2Html;
      return exported.default ?? exported;
    });
    return this.mjml2html;
  }
}
