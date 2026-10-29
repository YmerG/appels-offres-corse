// Service worker simple : le site s'installe comme une appli, et les pages déjà vues s'ouvrent même sans réseau.
// Réseau d'abord (toujours la dernière version), copie en secours. Seulement les fichiers du site :
// jamais Firebase ni l'annuaire des entreprises (autre origine), donc aucune donnée de compte en cache.
var CACHE = 'aoc-v6'; // v6 : devis (lot 20) ; l'ancienne copie est effacée

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

// Notification d'un nouveau message (Firebase Cloud Messaging, envoyée par outils/notifier.py, données seulement) :
// toujours affichée (Safari l'exige), sans le texte du message (écran verrouillé), et pastille sur l'icône de l'appli.
self.addEventListener('push', function (e) {
  var j = {};
  try { j = e.data ? e.data.json() : {}; } catch (x) { /* message illisible : notification générique */ }
  var d = j.data || {};
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.titre || 'Nouveau message', {
      body: d.corps || 'Ouvrez la discussion pour le lire.', icon: 'icones/icone-192.png', tag: d.tag || 'discussion',
      data: { url: d.url || 'compte.html#discussions' } }),
    self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(function () {}) : null
  ]));
});

// clic sur la notification : la discussion, dans une fenêtre déjà ouverte du site si possible
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL(e.notification.data && e.notification.data.url || 'compte.html#discussions', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenetres) {
    var f = fenetres.find(function (w) { return 'navigate' in w; });
    return f ? f.navigate(url).then(function (w) { return (w || f).focus(); }) : self.clients.openWindow(url);
  }));
});
