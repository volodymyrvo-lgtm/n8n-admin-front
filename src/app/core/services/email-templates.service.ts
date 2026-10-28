import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
import { EmailTemplateListItem, EmailTemplateManifest } from '../models/email-template.model';

const TEMPLATES_URL = '/email-templates';

/** A template as the page edits it: its manifest, and the MJML source. */
export interface EmailTemplate {
  manifest: EmailTemplateManifest;
  source: string;
}

/**
 * The email templates, which are plain files shipped with the app
 * (`public/email-templates/<id>/template.mjml` + `template.json`, listed in
 * the generated `index.json`) - see `scripts/generate-email-templates-index.js`.
 */
@Injectable({ providedIn: 'root' })
export class EmailTemplatesService {
  private readonly http = inject(HttpClient);

  list(): Observable<EmailTemplateListItem[]> {
    return this.http.get<EmailTemplateListItem[]>(`${TEMPLATES_URL}/index.json`);
  }

  load(id: string): Observable<EmailTemplate> {
    const base = `${TEMPLATES_URL}/${encodeURIComponent(id)}`;
    return forkJoin({
      manifest: this.http.get<EmailTemplateManifest>(`${base}/template.json`),
      source: this.http.get(`${base}/template.mjml`, { responseType: 'text' }),
    }).pipe(map(({ manifest, source }) => ({ manifest, source })));
  }
}
