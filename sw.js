const C = 'siandal-gas-v5';
const F = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/logo-andalan.png',
  './css/style.css',
  './js/01-state.js',
  './js/02-api-gas.js',
  './js/03-ui-core.js',
  './js/04-page-dashboard.js',
  './js/05-page-attendance.js',
  './js/06-page-master.js',
  './js/07-page-reports-sync.js',
  './js/08-app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(F)));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const q = e.request;
  if (q.method !== 'GET') return;
  if (q.mode === 'navigate') {
    e.respondWith(
      fetch(q)
        .then(n => {
          const cp = n.clone();
          caches.open(C).then(c => c.put('./index.html', cp));
          return n;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(q).then(r => r || fetch(q).then(n => {
      const cp = n.clone();
      caches.open(C).then(c => c.put(q, cp));
      return n;
    }))
  );
});
