const CACHE = 'cnc-insert-manager-v37-1-20260915-admin-auth-fix';
const CORE = ['./', './index.html', './admin.html', './operator.html', './app.css', './v31-core.js', './access-control.js', './firebase-config.js', './admin-app.js', './operator-app.js', './manifest.json', './operator-manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(CORE.map(url => cache.add(url)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith('cnc-')).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true }); if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match(new URL(event.request.url).pathname.endsWith('/operator.html') ? './operator.html' : './admin.html');
    return Response.error();
  }));
});
