const CACHE_NAME = 'zypace-shell-v1';

// App shell assets to pre-cache on install
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for API/Firebase calls; cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Firebase, Stripe, Strava, or analytics requests
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('strava.com') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('cloudfunctions.net')
  ) return;

  // For navigation requests: network-first with offline fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then(r => r || Response.error()))
    );
    return;
  }

  // For static assets (JS/CSS/images): cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
  }
});
