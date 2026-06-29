// Service worker: кэширует оболочку приложения и модули ядра для офлайн-работы.
const CACHE = 'imagediff-v1';
const ASSETS = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'manifest.webmanifest',
  'icon.svg',
  '../src/core/image.js',
  '../src/core/align.js',
  '../src/core/morphology.js',
  '../src/core/components.js',
  '../src/core/diffEngine.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => hit))
  );
});
