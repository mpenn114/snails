// Prints the CHANGELOG.md section for a version (empty output if none).
// Usage: node scripts/changelog-section.mjs <version> [changelog-path]
import { existsSync, readFileSync } from 'node:fs';

const [version, file = 'CHANGELOG.md'] = process.argv.slice(2);
if (!version) {
  console.error('usage: changelog-section.mjs <version> [file]');
  process.exit(1);
}
if (existsSync(file)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const isHeading = (l) => l.startsWith('## ');
  const matches = (l) => {
    if (!isHeading(l)) return false;
    const rest = l.replace(/^##\s*\[?v?/, '');
    return rest.startsWith(version) && /^(\]|\s|$)/.test(rest.slice(version.length));
  };
  const start = lines.findIndex(matches);
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(isHeading);
    console.log((end < 0 ? rest : rest.slice(0, end)).join('\n').trim());
  }
}
