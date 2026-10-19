// TenderAgent PWA Service Worker (v2.0.0)
const CACHE_NAME = 'tenderagent-pwa-v2';
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

// Activate: Clean up old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Resilient Stale-While-Revalidate with guaranteed non-null responses
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // API Requests: Network first with cached JSON fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response(JSON.stringify({
            success: false,
            offline: true,
            message: 'TenderAgent is currently operating in offline PWA mode. Displaying cached South African procurement state.'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Static Assets & Navigation: Stale-While-Revalidate with reliable network passthrough
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails and we have a cached version, use it
          if (cachedResponse) return cachedResponse;

          // If it's a page navigation, return the root SPA page
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }

          // Otherwise return standard 404 or empty response
          return new Response(null, { status: 404, statusText: 'Not Found Offline' });
        });

      return cachedResponse || fetchPromise;
    })
  );
});
