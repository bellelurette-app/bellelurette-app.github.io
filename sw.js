/* Enfin lu : fonctionnement hors ligne */
const CACHE = 'enfinlu-v88';
const FICHIERS = ['./', 'index.html', 'manifest.webmanifest', 'catalogue.json', 'belami.json',
  'icone-180.png', 'confidentialite.html',
  'bodoni-moda-latin-opsz-normal.woff2', 'bodoni-moda-latin-ext-opsz-normal.woff2', 'bodoni-moda-latin-opsz-italic.woff2', 'bodoni-moda-latin-ext-opsz-italic.woff2', 'schibsted-grotesk-latin-wght-normal.woff2', 'schibsted-grotesk-latin-ext-wght-normal.woff2', 'spectral-latin-400-normal.woff2', 'spectral-latin-ext-400-normal.woff2', 'spectral-latin-400-italic.woff2', 'spectral-latin-ext-400-italic.woff2', 'spectral-latin-500-normal.woff2', 'spectral-latin-ext-500-normal.woff2', 'spectral-latin-500-italic.woff2', 'spectral-latin-ext-500-italic.woff2', 'spectral-latin-600-normal.woff2', 'spectral-latin-ext-600-normal.woff2', 'icone-192.png', 'icone-512.png', 'icone-masque-512.png'];
const GARDES = new Set(FICHIERS.map((f) => f.replace('./', '')));
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith('belle-lurette-') || k.startsWith('enfinlu-')) && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  const nom = u.pathname.split('/').pop();
  const garde = GARDES.has(nom);
  // la page, le manifeste et les livres : le réseau d'abord, pour voir tout de suite un nouveau livre ou une correction
  if (r.mode === 'navigate' || /\.(html|json|webmanifest)$/.test(nom) || nom === '') {
    e.respondWith(caches.open(CACHE).then((c) => {
      const net = fetch(r).then((res) => { if (res && res.ok && garde) c.put(r, res.clone()); return res; });
      net.catch(() => {});
      const secours = () => c.match(r, { ignoreSearch: true }).then((hit) => hit || (r.mode === 'navigate' ? c.match('index.html') : undefined));
      // réseau lent : la copie du téléphone au bout de 4 s, si elle existe
      const lent = new Promise((ok) => setTimeout(ok, 4000)).then(secours);
      return Promise.race([net, lent.then((hit) => hit || net)]).catch(() => secours().then((hit) => hit || Response.error()));
    }));
    return;
  }
  // polices et icônes : depuis le téléphone, puis mise à jour discrète
  e.respondWith(caches.open(CACHE).then((c) => c.match(r, { ignoreSearch: true }).then((hit) => {
    const net = fetch(r).then((res) => { if (res && res.ok && garde) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
