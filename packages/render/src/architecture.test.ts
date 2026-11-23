import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface Boundary {
  forbiddenCoreNames: string[];
  forbiddenPackages: string[];
  forbiddenPathSegments: string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const boundary = JSON.parse(
  readFileSync(join(repoRoot, 'scripts/render-boundary.json'), 'utf8'),
) as Boundary;

const SCANNED_ROOTS = [resolve(here), resolve(repoRoot, 'apps/display/src')];
const BUILTINS = new Set(builtinModules);
const CORE_NAMES = new Set(boundary.forbiddenCoreNames);

/** Lists .ts/.tsx sources under a directory, excluding tests (they may use node:fs). */
function listSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    const isSource = /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

/** Returns true for specifiers that reach outside the allowed render/display boundary. */
function isForbiddenSpecifier(spec: string): boolean {
  if (spec.startsWith('node:') || BUILTINS.has(spec)) return true;
  if (spec.startsWith('@snails/core/')) return true;
  if (boundary.forbiddenPackages.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) {
    return true;
  }
  if (!spec.startsWith('.')) return false;
  return boundary.forbiddenPathSegments.some((seg) => spec.split('/').includes(seg));
}

/** Extracts the imported names of a `{ a, b as c }` clause, ignoring `type` modifiers. */
function namedImports(clause: string): string[] {
  const braced = /\{([^}]*)\}/.exec(clause);
  if (!braced?.[1]) return [];
  return braced[1]
    .split(',')
    .map(
      (part) =>
        part
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0] ?? '',
    )
    .filter((name) => name.length > 0);
}

/**
 * The display harness (apps/display/src/harness) is a local fake server: it legitimately creates
 * and steps a sim to feed the renderer, so it may import core's driving API. Everything else in
 * render/display (and all package/Node-builtin bans) still applies to it.
 */
function isHarnessFile(file: string): boolean {
  return file.split(sep).join('/').includes('apps/display/src/harness/');
}

/** Collects human-readable boundary violations for one source file's text. */
function violationsIn(file: string, text: string): string[] {
  const allowDriving = isHarnessFile(file);
  const where = relative(repoRoot, file);
  const found: string[] = [];
  const fromRe = /\b(?:import|export)\s+(?:type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(fromRe)) {
    const clause = match[1] ?? '';
    const spec = match[2] ?? '';
    if (isForbiddenSpecifier(spec)) found.push(`${where}: import from '${spec}'`);
    if (spec !== '@snails/core') continue;
    if (/\*\s*as\s/.test(clause)) found.push(`${where}: namespace import of @snails/core`);
    for (const name of namedImports(clause)) {
      if (!allowDriving && CORE_NAMES.has(name))
        found.push(`${where}: imports mutating core API '${name}'`);
    }
  }
  const bareRe = /(?:\bimport\s*\(?|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of text.matchAll(bareRe)) {
    const spec = match[1] ?? '';
    if (isForbiddenSpecifier(spec)) found.push(`${where}: import of '${spec}'`);
  }
  return found;
}

describe('render/display architecture boundary', () => {
  const files = SCANNED_ROOTS.flatMap(listSources);

  it('scans a non-empty set of source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('has no forbidden imports or mutating core API usage', () => {
    const violations = files.flatMap((file) => violationsIn(file, readFileSync(file, 'utf8')));
    expect(violations).toEqual([]);
  });

  it('does not depend on AI, content, server or controller packages', () => {
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    const forbidden = declared.filter((name) => boundary.forbiddenPackages.includes(name));
    expect(forbidden).toEqual([]);
  });

  it('detects a forbidden import when one is present', () => {
    const sample = "import { Simulation } from '@snails/core';\nimport fs from 'node:fs';";
    const found = violationsIn('/x/render/src/bad.ts', sample);
    expect(found.some((line) => line.includes("'Simulation'"))).toBe(true);
    expect(found.some((line) => line.includes("'node:fs'"))).toBe(true);
  });
});
