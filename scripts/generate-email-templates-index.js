/*
 * Writes public/email-templates/index.json - the list of email templates the
 * Email Generation page offers - from the template folders.
 *
 * A template is a folder in public/email-templates/ holding `template.mjml`
 * and `template.json` (see EmailTemplateManifest). The browser can't list a
 * folder, so this runs before `start`, `build`, `watch` and `test` (npm
 * pre-scripts) and the result is not committed.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'public', 'email-templates');
const items = [];
const problems = [];

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const dir = path.join(root, entry.name);
  const manifestPath = path.join(dir, 'template.json');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(path.join(dir, 'template.mjml'))) {
    problems.push(`${entry.name}: needs both template.mjml and template.json`);
    continue;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    problems.push(`${entry.name}/template.json is not valid JSON: ${error.message}`);
    continue;
  }
  if (manifest.id !== entry.name) {
    problems.push(`${entry.name}/template.json: "id" must equal the folder name (got "${manifest.id}")`);
    continue;
  }
  const item = { id: manifest.id, name: manifest.name || manifest.id };
  if (manifest.description) {
    item.description = manifest.description;
  }
  items.push(item);
}

if (problems.length > 0) {
  console.error(`[email-templates] ${problems.join('\n[email-templates] ')}`);
  process.exit(1);
}

items.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(root, 'index.json'), `${JSON.stringify(items, null, 2)}\n`);
console.log(`[email-templates] index.json: ${items.length} template(s)`);
