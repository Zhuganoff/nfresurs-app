/* Service worker «Отходы в доходы».
   Стратегия подобрана под то, что данные ВШИТЫ в index.html и обновляются
   при каждом refresh_app.sh: HTML берём network-first (иначе замёрзнет старая
   лента лотов), статику (иконки, manifest, telegram-web-app.js) — cache-first.
   Онлайн → всегда свежие лоты; офлайн → последняя виденная версия. */
const CACHE = 'ovd-v2';
const ASSETS = [
  './',
  './manifest.webmanifest',
  './telegram-web-app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-180.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return; // сторонние запросы не трогаем

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // свежие лоты важнее — сеть, кэш только как офлайн-фолбэк
    e.respondWith(
      fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put('./', cp)).catch(() => {});
        return r;
      }).catch(() => caches.match('./').then((m) => m || caches.match(req)))
    );
    return;
  }

  // статика — из кэша, с дозагрузкой в кэш
  e.respondWith(
    caches.match(req).then((m) => m || fetch(req).then((r) => {
      const cp = r.clone();
      caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
      return r;
    }))
  );
});
