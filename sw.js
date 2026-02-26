const CACHE_NAME = 'donkeychat-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sendicon.png',
    '/icon-192.svg',
    '/icon-512.svg',
    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'
];

// Install — cache core assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — cache-first for assets, network-first for API/WS
self.addEventListener('fetch', (e) => {
    // Skip WebSocket and non-GET requests
    if (e.request.url.startsWith('ws') || e.request.method !== 'GET') return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => {
                // Offline fallback
                if (e.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
