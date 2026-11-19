const C = 'siandal-gas-v6';
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
  self.skipWaiting(); // Langsung aktifkan SW baru tanpa menunggu
  e.waitUntil(caches.open(C).then(c => c.addAll(F)));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))
      .then(() => self.clients.claim()) // Langsung kendalikan semua halaman terbuka
  );
});

self.addEventListener('fetch', e => {
  const q = e.request;
  if (q.method !== 'GET') return;

  // Abaikan request API ke Google Apps Script agar tidak ikut di-cache
  if (q.url.includes('script.google.com') || q.url.includes('googleusercontent.com')) return;

  // Strategi Network-First: selalu ambil versi terbaru jika online, pakai cache jika offline
  e.respondWith(
    fetch(q)
      .then(n => {
        if (n && n.status === 200) {
          const cp = n.clone();
          caches.open(C).then(c => c.put(q, cp));
        }
        return n;
      })
      .catch(() => caches.match(q).then(r => r || (q.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});