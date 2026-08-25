const CACHE_NAME = 'bariloche-online-v10006';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css?v=10006',
    '/app.js',
    '/accommodations.js?v=10006'
];

// Install
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
            .then(() => caches.open(CACHE_NAME))
            .then(cache => cache.addAll(urlsToCache))
    );
});

// Fetch: Network First, fallback to cache
self.addEventListener('fetch', event => {
    // Si no es una petición GET (ej: POST del formulario), lo ignoramos
    if (event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Actualizamos la caché de forma dinámica
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // Si falla la red (está offline), devolvemos desde la caché
                return caches.match(event.request);
            })
    );
});

// Activate
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});
