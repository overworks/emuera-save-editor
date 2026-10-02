// VERSION and ASSETS are generated from the complete production build.
const base = self.registration.scope;
const prefix = `emuera-save-studio:app:${base}:`;
const cacheName = prefix + VERSION;
const assets = new Map(ASSETS.map(asset => [new URL(asset.url, base).href, asset.integrity]));
const indexUrl = new URL('index.html', base).href;

function assetRequest(url) {
  return new Request(url, { cache: 'reload', credentials: 'same-origin', integrity: assets.get(url) });
}

async function prepare() {
  const existed = await caches.has(cacheName);
  try {
    const cache = await caches.open(cacheName);
    // addAll commits the batch together. Integrity checks reject partial/mixed deployments.
    await cache.addAll([...assets.keys()].map(assetRequest));
  } catch (error) {
    if (!existed) await caches.delete(cacheName);
    throw error;
  }
}

async function ready() {
  if (!await caches.has(cacheName)) return false;
  const cache = await caches.open(cacheName);
  const present = await Promise.all([...assets.keys()].map(url => cache.match(url)));
  return present.every(Boolean);
}

self.addEventListener('install', event => {
  event.waitUntil(prepare());
  // Never skip waiting: all old app windows must close before an update activates.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Only the two real entry points are navigation fallbacks. Query strings such
  // as ?lang=ko are never stored, and unknown routes still reach the static host.
  const entry = request.mode === 'navigate' && (url.pathname === new URL(base).pathname || url.pathname === new URL(indexUrl).pathname);
  const key = entry ? indexUrl : url.href;
  if (!assets.has(key)) return;
  event.respondWith((async () => {
    try {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(key);
      if (cached) return cached;
      const response = await fetch(assetRequest(key));
      if (!response.ok) throw new Error('Asset unavailable');
      await cache.put(key, response.clone());
      return response;
    } catch {
      // Storage denial/eviction must not prevent using an available online app.
      // Do not cache an unverified response or an arbitrary user file request.
      return fetch(request);
    }
  })());
});

self.addEventListener('message', event => {
  if (!event.ports[0] || !['OFFLINE_STATUS', 'PREPARE_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'PREPARE_OFFLINE') await prepare();
      event.ports[0].postMessage({ ready: await ready() });
    } catch {
      event.ports[0].postMessage({ ready: false });
    }
  })());
});
