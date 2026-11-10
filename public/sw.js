// TenderAgent PWA Service Worker (v3.0.0)
//
// Privacy boundary (review finding on v2): v2 cached EVERY successful /api/
// GET persistently and never purged on logout, so account data (profile incl.
// TCS PIN, tenant feeds) survived sign-out and could be served to the next
// account on a shared browser. v3 rules:
//   1. /api/ responses are NEVER cached. Offline API calls fail honestly.
//   2. On activation, legacy tenderagent-* caches (incl. all v2 API entries)
//      are purged; the freshly installed shell is left intact.
//   3. On 'CLEAR_CACHES' (sent by the page at sign-out), this app's caches are
//      purged. Only tenderagent-* keys are touched, never other origin tooling.
//   4. Only same-origin, non-API static assets and the app shell are cached.
const CACHE_NAME = 'tenderagent-pwa-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/tenderagentfavicon.png',
  '/tenderagentlogo.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Only caches this app created. Legacy v2 (tenderagent-pwa-v2) matches the
// prefix, so the upgrade purge still wipes every v2-cached /api/ entry, while
// unrelated same-origin tooling keeps its own caches.
const CACHE_PREFIX = 'tenderagent-';

function purgeOwnCaches() {
  return caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))));
}

function purgeLegacyCaches() {
  return caches.keys().then((keys) =>
    Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
    ));
}

// Install: Pre-cache core app shell safely without aborting on missing single file
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        STATIC_ASSETS.map(async (assetUrl) => {
          try {
            await cache.add(assetUrl);
          } catch (err) {
            console.warn('[SW] Optional pre-cache skip:', assetUrl, err);
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge only LEGACY tenderagent caches (this wipes all v2-cached
// /api/ entries and anything else older builds stored). The current shell was
// pre-cached during install with per-asset fallbacks, so it is left intact -
// activation never destroys the fresh shell it depends on.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    purgeLegacyCaches().then(() => self.clients.claim())
  );
});

// Sign-out hook: the page posts CLEAR_CACHES so no account data outlives the session.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(purgeOwnCaches());
  }
});

// Fetch: shell/static stale-while-revalidate; /api/ strictly network-only.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API Requests: network only. Never cached, never served from cache -
  // account data must not persist beyond the session or leak across accounts.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({
          success: false,
          offline: true,
          message: 'You are offline. Your private account data needs a connection - it is never stored on this device.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Static Assets & Navigation: Stale-While-Revalidate, same-origin only
  if (url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
