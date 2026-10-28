import {
  defaultEmailValues,
  emailTemplateIssues,
  EmailTemplateManifest,
  escapeHtml,
  isSafeUrl,
  moveItem,
  newGroupItem,
  renderEmailTemplate,
} from './email-template.model';

const MANIFEST: EmailTemplateManifest = {
  id: 't',
  name: 'T',
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Hello' },
    { key: 'about', label: 'About', type: 'textarea', default: 'a\nb' },
    { key: 'link', label: 'Link', type: 'url', default: 'https://example.com/?a=1&b=2' },
  ],
  groups: [
    {
      key: 'bonuses',
      label: 'Bonuses',
      addLabel: 'Add bonus',
      itemLabel: 'Bonus',
      fields: [
        { key: 'name', label: 'Name', type: 'text', default: 'New' },
        { key: 'deposit', label: 'Deposit', type: 'text', default: '10' },
      ],
      defaults: [{ name: 'A', deposit: '1' }, { name: 'B', deposit: '2' }],
    },
  ],
};

const SOURCE = `<h>[[title]]</h><a href="[[link]]">x</a><p>[[about]]</p>
<!-- repeat:bonuses -->
<b>[[name]]:[[deposit]] ([[title]])</b>
<!-- separator -->
<hr/>
<!-- /repeat -->
<end/>`;

describe('email template model', () => {
  describe('escapeHtml', () => {
    it('escapes everything that could break markup or an attribute', () => {
      expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
    });
  });

  describe('isSafeUrl', () => {
    it.each(['https://example.com', 'mailto:a@b.c', '#', '/path', '%%unsub_url%%', '{{ url }}', 'tel:+1'])('accepts %s', (url) => {
      expect(isSafeUrl(url)).toBe(true);
    });

    it.each(['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x'])('rejects %s', (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  });

  describe('defaults', () => {
    it('starts from the declared defaults, copying the group items', () => {
      const values = defaultEmailValues(MANIFEST);

      expect(values.fields).toEqual({ title: 'Hello', about: 'a\nb', link: 'https://example.com/?a=1&b=2' });
      expect(values.groups['bonuses']).toEqual([{ name: 'A', deposit: '1' }, { name: 'B', deposit: '2' }]);
      values.groups['bonuses'][0]['name'] = 'changed';
      expect(MANIFEST.groups![0].defaults[0]['name']).toBe('A');
    });

    it('makes a new group item from the field defaults', () => {
      expect(newGroupItem(MANIFEST.groups![0])).toEqual({ name: 'New', deposit: '10' });
    });
  });

  describe('renderEmailTemplate', () => {
    it('fills variables, escaping text and attribute values, and turning textarea line breaks into <br />', () => {
      const values = defaultEmailValues(MANIFEST);
      values.fields['title'] = 'A <b> & "c"';

      const { mjml } = renderEmailTemplate(SOURCE, MANIFEST, values);

      expect(mjml).toContain('<h>A &lt;b&gt; &amp; &quot;c&quot;</h>');
      expect(mjml).toContain('<a href="https://example.com/?a=1&amp;b=2">');
      expect(mjml).toContain('<p>a<br />b</p>');
    });

    it('drops a link that would run code', () => {
      const values = defaultEmailValues(MANIFEST);
      values.fields['link'] = 'javascript:alert(1)';

      expect(renderEmailTemplate(SOURCE, MANIFEST, values).mjml).toContain('<a href="">');
    });

    it('writes a repeat once per item with the separator only between items', () => {
      const { mjml } = renderEmailTemplate(SOURCE, MANIFEST, defaultEmailValues(MANIFEST));

      expect(mjml.replace(/\s+/g, ' ')).toContain('<b>A:1 (Hello)</b> <hr/> <b>B:2 (Hello)</b> <end/>');
      expect(mjml.match(/<hr\/>/g)).toHaveLength(1);
      expect(mjml).not.toContain('repeat');
      expect(mjml).not.toContain('separator');
    });

    it('writes one item without any separator, and none for an empty group', () => {
      const values = defaultEmailValues(MANIFEST);
      values.groups['bonuses'] = [{ name: 'Only', deposit: '5' }];
      expect(renderEmailTemplate(SOURCE, MANIFEST, values).mjml).not.toContain('<hr/>');

      values.groups['bonuses'] = [];
      const empty = renderEmailTemplate(SOURCE, MANIFEST, values).mjml;
      expect(empty).not.toContain('<b>');
      expect(empty).toContain('<end/>');
    });

    it('works without a separator in the repeat', () => {
      const source = '<!-- repeat:bonuses --><i>[[name]]</i><!-- /repeat -->';

      expect(renderEmailTemplate(source, MANIFEST, defaultEmailValues(MANIFEST)).mjml).toBe('<i>A</i><i>B</i>');
    });

    it('never fills in a variable that came out of a value', () => {
      const values = defaultEmailValues(MANIFEST);
      values.fields['title'] = '[[about]]';
      values.groups['bonuses'][0]['name'] = '[[title]]';

      const { mjml } = renderEmailTemplate(SOURCE, MANIFEST, values);

      expect(mjml).toContain('<h>[[about]]</h>');
      expect(mjml).toContain('<b>[[title]]:1');
    });

    it('leaves personalization tokens alone', () => {
      const source = '{{snippets.greetings_en}} %fs_title% <a href="%%unsub_url%%">[[title]]</a>';

      expect(renderEmailTemplate(source, MANIFEST, defaultEmailValues(MANIFEST)).mjml).toBe(
        '{{snippets.greetings_en}} %fs_title% <a href="%%unsub_url%%">Hello</a>',
      );
    });

    it('leaves a variable the manifest does not declare as it is and reports it', () => {
      const result = renderEmailTemplate('[[title]] [[nope]] <!-- repeat:ghost -->[[x]]<!-- /repeat -->', MANIFEST, defaultEmailValues(MANIFEST));

      expect(result.mjml).toBe('Hello [[nope]] ');
      expect(result.unknown).toEqual(['nope', 'repeat:ghost']);
    });

    it('tolerates spaces inside the brackets and in the markers', () => {
      const source = '[[ title ]]<!--repeat:bonuses--><i>[[ name ]]</i><!--  /repeat  -->';

      expect(renderEmailTemplate(source, MANIFEST, defaultEmailValues(MANIFEST)).mjml).toBe('Hello<i>A</i><i>B</i>');
    });
  });

  describe('emailTemplateIssues', () => {
    it('finds nothing wrong with a template that matches its manifest', () => {
      expect(emailTemplateIssues(SOURCE, MANIFEST)).toEqual({ unknown: [], unused: [] });
    });

    it('finds undeclared variables - also inside a repeat that has no items - and declared fields nobody uses', () => {
      const issues = emailTemplateIssues('[[title]] [[typo]] <!-- repeat:bonuses -->[[name]] [[missing]]<!-- /repeat -->', MANIFEST);

      expect(issues.unknown).toEqual(['typo', 'missing']);
      expect(issues.unused).toEqual(['about', 'link', 'deposit']);
    });
  });

  describe('moveItem', () => {
    it('moves an item down and up, as dragging does', () => {
      expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
      expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
      expect(moveItem(['a', 'b', 'c'], 1, 2)).toEqual(['a', 'c', 'b']);
    });

    it('returns an unchanged copy for the same or an impossible position', () => {
      const list = ['a', 'b'];

      expect(moveItem(list, 1, 1)).toEqual(['a', 'b']);
      expect(moveItem(list, 0, 5)).toEqual(['a', 'b']);
      expect(moveItem(list, -1, 0)).toEqual(['a', 'b']);
      expect(moveItem(list, 1, 1)).not.toBe(list);
    });
  });
});
