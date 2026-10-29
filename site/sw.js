// Service worker simple : le site s'installe comme une appli, et les pages déjà vues s'ouvrent même sans réseau.
// Réseau d'abord (toujours la dernière version), copie en secours. Seulement les fichiers du site :
// jamais Firebase ni l'annuaire des entreprises (autre origine), donc aucune donnée de compte en cache.
var CACHE = 'aoc-v4'; // v4 : logo noir et blanc (en-tête, icônes) ; l'ancienne copie est effacée

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (c) { return c !== CACHE; }).map(function (c) { return caches.delete(c); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (rep) {
    if (rep.ok) { var copie = rep.clone(); caches.open(CACHE).then(function (c) { c.put(r, copie); }); }
    return rep;
  }).catch(function () {
    // hors ligne : la copie de la page (sans ?d=… ni #…), sinon l'accueil pour une page jamais vue
    return caches.match(r, { ignoreSearch: true }).then(function (m) {
      return m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});
