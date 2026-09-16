import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Loads every top-level docs/*.md file (skips docs/archive/ since those specs
// are superseded and shouldn't inform triage) into one bundle for the model.
export function loadDocsBundle(docsDir) {
  const files = readdirSync(docsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md'))
    .map((d) => d.name)
    .sort();

  return files
    .map((name) => `# ${name}\n\n${readFileSync(join(docsDir, name), 'utf8')}`)
    .join('\n\n---\n\n');
}
