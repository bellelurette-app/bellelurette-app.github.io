/* Belle Lurette : fonctionnement hors ligne */
const CACHE = 'belle-lurette-v74';
const FICHIERS = ['./', 'index.html', 'manifest.webmanifest', 'catalogue.json', 'belami.json',
  'icone-180.png', 'confidentialite.html',
  'bodoni-moda-latin-opsz-normal.woff2', 'bodoni-moda-latin-ext-opsz-normal.woff2', 'bodoni-moda-latin-opsz-italic.woff2', 'bodoni-moda-latin-ext-opsz-italic.woff2', 'schibsted-grotesk-latin-wght-normal.woff2', 'schibsted-grotesk-latin-ext-wght-normal.woff2', 'spectral-latin-400-normal.woff2', 'spectral-latin-ext-400-normal.woff2', 'spectral-latin-400-italic.woff2', 'spectral-latin-ext-400-italic.woff2', 'spectral-latin-500-normal.woff2', 'spectral-latin-ext-500-normal.woff2', 'spectral-latin-500-italic.woff2', 'spectral-latin-ext-500-italic.woff2', 'spectral-latin-600-normal.woff2', 'spectral-latin-ext-600-normal.woff2', 'icone-192.png', 'icone-512.png', 'icone-masque-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('belle-lurette-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  // polices : gardées après le premier chargement
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then((c) => c.match(r).then((hit) => hit || fetch(r).then((res) => { c.put(r, res.clone()); return res; }))));
    return;
  }
  if (u.origin !== location.origin) return;
  // l'appli et le livre : tout de suite depuis le téléphone, puis mise à jour discrète depuis le réseau
  e.respondWith(caches.open(CACHE).then((c) => c.match(r, { ignoreSearch: true }).then((hit) => {
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
