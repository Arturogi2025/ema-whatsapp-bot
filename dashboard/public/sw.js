const CACHE_NAME = 'bolt-dashboard-v2';
const STATIC_ASSETS = [
  '/favicon.svg',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches (including v1 that cached dynamic pages)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: ONLY cache truly static assets. Never cache API calls, pages, or
// Next.js RSC payloads — they must always hit the server for fresh data.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // NEVER intercept API calls, dynamic pages, or Next.js internals
  // Let them go straight to the network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/conversations') ||
    url.pathname.startsWith('/leads') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname === '/' ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-State-Tree')
  ) {
    return; // fall through to default browser fetch — no caching
  }

  // Static assets only: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'E-MA Dashboard';
  const options = {
    body: data.body || 'Nuevo mensaje recibido',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/conversations',
    },
    actions: [
      { action: 'open', title: 'Ver conversación' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/conversations';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
