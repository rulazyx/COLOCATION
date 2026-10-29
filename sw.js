// Service worker : fonctionnement hors-ligne de base + notifications push
const CACHE = 'coloc-v98';
const ASSETS = ['./', './index.html', './style.css', './app.js', './config.js', './keys.js', './avatar.js', './shopart.js', './gameart.js', './api.js', './util.js', './challenges.js', './games/flappy.js', './games/sudoku.js', './games/blackjack.js', './games/ferme.js', './budget.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  // cache:'reload' : on récupère vraiment les nouveaux fichiers (pas la copie gardée par le navigateur)
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache d'abord, sans aller rechercher fichier par fichier : tous les fichiers d'une version sont mis en cache ensemble à l'installation,
// donc l'appli ne mélange jamais deux versions. Une nouvelle version arrive avec un nouveau sw.js (voir app.js : « Actualiser » / rechargement automatique).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req, { ignoreSearch: true })) || fetch(req)));
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'La Kaz', {
      body: data.body || '',
      icon: './icon-192-b.png',
      badge: './icon-192-b.png',
      tag: data.tag,
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
