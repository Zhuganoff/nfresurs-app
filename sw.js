/* Service worker «Отходы в доходы».
   Корень сайта — лендинг, приложение живёт в /app/ (SW зарегистрирован из
   /app/ на корневой sw.js → scope «/»). HTML берём network-first (свежая
   оболочка), статику (иконки, manifest, telegram-web-app.js) — cache-first.
   Офлайн: навигация внутри /app/ → последняя виденная оболочка приложения. */
const CACHE = 'ovd-v5';
const APP = '/app/';
const ASSETS = [
  APP,
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
    // свежая оболочка важнее — сеть, кэш только как офлайн-фолбэк
    e.respondWith(
      fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        return r;
      }).catch(() => caches.match(req).then((m) =>
        m || (url.pathname.indexOf(APP) === 0 ? caches.match(APP) : undefined)))
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
