/* Enfin lu : fonctionnement hors ligne */
const CACHE = 'enfinlu-v94';
const FICHIERS = ['./', 'index.html', 'manifest.webmanifest', 'catalogue.json', 'belami.json',
  'icone-180.png', 'confidentialite.html',
  'bodoni-moda-latin-opsz-normal.woff2', 'bodoni-moda-latin-ext-opsz-normal.woff2', 'bodoni-moda-latin-opsz-italic.woff2', 'bodoni-moda-latin-ext-opsz-italic.woff2', 'schibsted-grotesk-latin-wght-normal.woff2', 'schibsted-grotesk-latin-ext-wght-normal.woff2', 'spectral-latin-400-normal.woff2', 'spectral-latin-ext-400-normal.woff2', 'spectral-latin-400-italic.woff2', 'spectral-latin-ext-400-italic.woff2', 'spectral-latin-500-normal.woff2', 'spectral-latin-ext-500-normal.woff2', 'spectral-latin-500-italic.woff2', 'spectral-latin-ext-500-italic.woff2', 'spectral-latin-600-normal.woff2', 'spectral-latin-ext-600-normal.woff2', 'icone-192.png', 'icone-512.png', 'icone-masque-512.png'];
const GARDES = new Set(FICHIERS.map((f) => f.replace('./', '')));
// mise en cache à l'installation : toujours depuis le site, jamais depuis le cache HTTP du navigateur
// (sinon une version neuve du service worker pouvait ranger l'ancienne page)
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
  const garde = GARDES.has(nom) || nom === '';
  // la page, le manifeste et les livres : le réseau d'abord (en revalidant, pas de copie périmée du navigateur),
  // pour voir tout de suite un nouveau livre ou une correction ; la copie gardée est mise à jour même si la réponse arrive tard
  if (r.mode === 'navigate' || /\.(html|json|webmanifest)$/.test(nom) || nom === '') {
    const req = r.mode === 'navigate' ? new Request(r.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(r, { cache: 'no-cache' });
    const net = fetch(req);
    e.waitUntil(net.then((res) => {
      if (!(res && res.ok && garde)) return null;
      return caches.open(CACHE).then((c) => Promise.all([c.put(r.url, res.clone()), r.mode === 'navigate' ? c.put('index.html', res.clone()) : null]));
    }).catch(() => {}));
    e.respondWith(caches.open(CACHE).then((c) => {
      const secours = () => c.match(r, { ignoreSearch: true }).then((hit) => hit || (r.mode === 'navigate' || nom === '' ? c.match('index.html') : undefined));
      // réseau lent : la copie du téléphone au bout de 4 s, si elle existe (la nouvelle version sera là à l'ouverture suivante)
      const lent = new Promise((ok) => setTimeout(ok, 4000)).then(secours);
      return Promise.race([net.then((res) => res.clone()), lent.then((hit) => hit || net.then((res) => res.clone()))])
        .catch(() => secours().then((hit) => hit || Response.error()));
    }));
    return;
  }
  // polices et icônes : depuis le téléphone, puis mise à jour discrète
  e.respondWith(caches.open(CACHE).then((c) => c.match(r, { ignoreSearch: true }).then((hit) => {
    const net = fetch(r).then((res) => { if (res && res.ok && garde) e.waitUntil(c.put(r, res.clone())); return res; }).catch(() => hit);
    return hit || net;
  })));
});
