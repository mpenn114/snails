import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';

/** Static roots served by the server. A missing directory disables that bundle. */
export interface StaticRoots {
  /** Built controller bundle, served at `/`. */
  controllerDir?: string | undefined;
  /** Built display bundle, served at `/display/`. */
  displayDir?: string | undefined;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/**
 * Picks the Cache-Control value for a file inside a static root.
 * Hashed files under `assets/` are immutable; everything else (index.html,
 * service worker, manifest) must be revalidated.
 * @param root the static root the file was served from
 * @param filePath absolute path of the served file
 * @returns the Cache-Control header value
 */
export function cacheControlFor(root: string, filePath: string): string {
  const first = relative(root, filePath).split(sep)[0];
  return first === 'assets' ? IMMUTABLE : REVALIDATE;
}

/**
 * Registers @fastify/static for each existing root. Controller at `/`, display at `/display/`.
 * @param app the Fastify instance (root encapsulation)
 * @param roots the directories to serve
 */
export async function registerStaticRoots(app: FastifyInstance, roots: StaticRoots): Promise<void> {
  const { controllerDir, displayDir } = roots;
  if (controllerDir && existsSync(controllerDir)) {
    await app.register(fastifyStatic, {
      root: controllerDir,
      prefix: '/',
      cacheControl: false,
      setHeaders: (res, filePath) =>
        res.setHeader('Cache-Control', cacheControlFor(controllerDir, filePath)),
    });
  }
  if (displayDir && existsSync(displayDir)) {
    await app.register(fastifyStatic, {
      root: displayDir,
      prefix: '/display/',
      decorateReply: false,
      cacheControl: false,
      setHeaders: (res, filePath) =>
        res.setHeader('Cache-Control', cacheControlFor(displayDir, filePath)),
    });
  }
}

/** True for paths owned by the API or WebSocket, which must never fall back to HTML. */
function isApiPath(path: string): boolean {
  return ['/api', '/ws'].some((p) => path === p || path.startsWith(`${p}/`));
}

/** True when the request asks for an HTML document. */
function acceptsHtml(req: FastifyRequest): boolean {
  return (req.headers.accept ?? '').includes('text/html');
}

/**
 * Installs the not-found handler implementing the SPA fallback: unknown GET
 * document requests get the index.html of the bundle they fall under, `/api/*`
 * and `/ws*` unknowns get a JSON 404.
 * @param app the Fastify instance
 * @param roots the static roots used to find index.html
 */
export function installSpaFallback(app: FastifyInstance, roots: StaticRoots): void {
  app.setNotFoundHandler(async (req, reply) => {
    const path = (req.url.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
    const notFound = () => reply.code(404).send({ error: 'not-found' });
    if (isApiPath(path) || req.method !== 'GET' || !acceptsHtml(req)) return notFound();

    const inDisplay = path === '/display' || path.startsWith('/display/');
    const root = inDisplay ? roots.displayDir : roots.controllerDir;
    if (!root || !existsSync(join(root, 'index.html'))) return notFound();
    const html = await readFile(join(root, 'index.html'));
    return reply.type('text/html; charset=utf-8').header('Cache-Control', REVALIDATE).send(html);
  });
}
