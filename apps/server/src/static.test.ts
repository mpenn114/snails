import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from './app.js';
import { cacheControlFor } from './static.js';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const HTML = { accept: 'text/html,application/xhtml+xml' };

let base: string;
let controller: string;
let display: string;
let app: FastifyInstance;

function makeBundle(dir: string, tag: string): void {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), `<!doctype html><title>${tag}</title>`);
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), `console.log('${tag}')`);
  writeFileSync(join(dir, 'sw.js'), '// sw');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
}

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'snails-static-'));
  controller = join(base, 'controller');
  display = join(base, 'display');
  makeBundle(controller, 'controller');
  makeBundle(display, 'display');
  app = await buildServer({
    staticDir: controller,
    displayDir: display,
    networkInterfaces: () => ({}),
  });
});

afterEach(async () => {
  await app.close();
  rmSync(base, { recursive: true, force: true });
});

describe('cacheControlFor', () => {
  it('marks hashed assets immutable and everything else revalidated', () => {
    expect(cacheControlFor('/r', '/r/assets/x.js')).toBe(IMMUTABLE);
    expect(cacheControlFor('/r', '/r/index.html')).toBe('no-cache');
    expect(cacheControlFor('/r', '/r/sw.js')).toBe('no-cache');
  });
});

describe('static serving', () => {
  it('serves index.html at / with no-cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('controller');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets with long immutable caching', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(IMMUTABLE);
  });

  it('serves sw.js and manifest with no-cache', async () => {
    for (const url of ['/sw.js', '/manifest.webmanifest']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('serves the display bundle under /display/', async () => {
    const res = await app.inject({ method: 'GET', url: '/display/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('display');
    const asset = await app.inject({ method: 'GET', url: '/display/assets/app-abc123.js' });
    expect(asset.headers['cache-control']).toBe(IMMUTABLE);
  });
});

describe('SPA fallback', () => {
  it('returns controller index.html for unknown HTML routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/room/ABCD', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('controller');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('returns display index.html for unknown routes under /display', async () => {
    const res = await app.inject({ method: 'GET', url: '/display/some/page', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('display');
  });

  it('returns JSON 404 for unknown /api routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope', headers: HTML });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not-found' });
  });

  it('returns JSON 404 for non-HTML requests to unknown routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nothing',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not-found' });
  });

  it('returns JSON 404 for POST to unknown routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/nothing', headers: HTML });
    expect(res.statusCode).toBe(404);
  });

  it('does not fall back to HTML for /ws', async () => {
    const res = await app.inject({ method: 'GET', url: '/ws', headers: HTML });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('controller');
  });
});

describe('missing bundles', () => {
  it('404s the SPA when no bundle directory exists', async () => {
    const bare = await buildServer({ staticDir: '/nonexistent-x', displayDir: '/nonexistent-y' });
    const res = await bare.inject({ method: 'GET', url: '/', headers: HTML });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not-found' });
    await bare.close();
  });
});
