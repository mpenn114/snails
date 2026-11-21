// Fails if any source file exceeds 500 lines.
// Function length (<= 60 lines) is enforced by ESLint `max-lines-per-function`, so this
// script only needs to count file lines.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MAX_LINES = 500;
const ROOTS = ['apps', 'packages', 'scripts'];
const EXTS = new Set(['.ts', '.tsx', '.mjs']);
const SKIP = new Set(['node_modules', 'dist']);

/** Recursively collect source files under a directory. */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r, []));
const bad = files
  .map((f) => ({ f, n: readFileSync(f, 'utf8').split('\n').length }))
  .filter(({ n }) => n > MAX_LINES);
for (const { f, n } of bad) console.error(`${f}: ${n} lines (max ${MAX_LINES})`);
if (bad.length > 0) process.exit(1);
console.log(`check-limits: ${files.length} files OK`);
