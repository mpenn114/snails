// Snails controller service worker (hand-written, served as-is from /sw.js).
// - Precaches the app shell on install.
// - Navigations: network first, falling back to the cached shell when offline.
// - /assets/*: cache first (Vite emits content-hashed file names, so entries never go stale).
// - /api and /ws are never cached or intercepted: live game traffic always hits the network.

const VERSION = 'v1';
const SHELL_CACHE = `snails-shell-${VERSION}`;
const ASSET_CACHE = `snails-assets-${VERSION}`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon-180.png',
];

/** True for paths that must bypass the cache entirely (live API and WebSocket traffic). */
function isLivePath(pathname) {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/ws' ||
    pathname.startsWith('/ws/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Network first for a navigation; on failure serve the cached shell. */
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match('/index.html')) ?? Response.error();
  }
}

/** Cache first for hashed assets; fill the cache on a miss. */
async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Shell and other static files: cache first, falling back to the network. */
async function handleStatic(request) {
  const cached = await caches.match(request);
  return cached ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isLivePath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(request));
  } else {
    event.respondWith(handleStatic(request));
  }
});
