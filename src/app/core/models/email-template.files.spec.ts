import { TestBed } from '@angular/core/testing';
import { EmailTemplateManifest, defaultEmailValues, emailTemplateIssues, renderEmailTemplate } from './email-template.model';
import { MjmlCompilerService } from '../services/mjml-compiler.service';
import welcomePackSource from '../../../../public/email-templates/welcome-pack/template.mjml';
import welcomePackManifest from '../../../../public/email-templates/welcome-pack/template.json';
import rewardEnSource from '../../../../public/email-templates/reward-in-play-en/template.mjml';
import rewardEnManifest from '../../../../public/email-templates/reward-in-play-en/template.json';
import rewardAzSource from '../../../../public/email-templates/reward-in-play-az/template.mjml';
import rewardAzManifest from '../../../../public/email-templates/reward-in-play-az/template.json';
import rewardRuSource from '../../../../public/email-templates/reward-in-play-ru/template.mjml';
import rewardRuManifest from '../../../../public/email-templates/reward-in-play-ru/template.json';

/**
 * Every template shipped in public/email-templates. Add a new template's two
 * files here: the test then checks its manifest matches its MJML and that the
 * default values compile into an email.
 */
const TEMPLATES: { folder: string; source: string; manifest: EmailTemplateManifest }[] = [
  { folder: 'welcome-pack', source: welcomePackSource, manifest: welcomePackManifest as EmailTemplateManifest },
  { folder: 'reward-in-play-en', source: rewardEnSource, manifest: rewardEnManifest as EmailTemplateManifest },
  { folder: 'reward-in-play-az', source: rewardAzSource, manifest: rewardAzManifest as EmailTemplateManifest },
  { folder: 'reward-in-play-ru', source: rewardRuSource, manifest: rewardRuManifest as EmailTemplateManifest },
];

describe.each(TEMPLATES)('email template $folder', ({ folder, source, manifest }) => {
  it('has an id equal to its folder name', () => {
    expect(manifest.id).toBe(folder);
  });

  it('declares every variable it uses, and uses every variable it declares', () => {
    expect(emailTemplateIssues(source, manifest)).toEqual({ unknown: [], unused: [] });
  });

  it('is filled in completely by the default values', () => {
    const { mjml, unknown } = renderEmailTemplate(source, manifest, defaultEmailValues(manifest));

    expect(unknown).toEqual([]);
    expect(mjml).not.toMatch(/\[\[|<!--\s*(repeat|separator|\/repeat)/);
  });

  it('compiles with the default values and with no repeated blocks at all', async () => {
    const compiler = TestBed.inject(MjmlCompilerService);
    const withDefaults = defaultEmailValues(manifest);
    const withoutGroups = { ...withDefaults, groups: Object.fromEntries(Object.keys(withDefaults.groups).map((key) => [key, []])) };

    for (const values of [withDefaults, withoutGroups]) {
      const result = await compiler.compile(renderEmailTemplate(source, manifest, values).mjml);
      expect(result.errors).toEqual([]);
      expect(result.html).toContain('<html');
    }
  });

  it('leaves the Customer.io tokens (greeting snippet, unsubscribe link) untouched', async () => {
    const compiler = TestBed.inject(MjmlCompilerService);
    const { mjml } = renderEmailTemplate(source, manifest, defaultEmailValues(manifest));
    const { html } = await compiler.compile(mjml);

    for (const token of source.match(/\{\{[^}]+\}\}|%%[a-z_]+%%/g) ?? []) {
      expect(html, token).toContain(token);
    }
  });
});
