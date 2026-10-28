// Firebase (Firestore Lite + Auth), chargé à la demande depuis gstatic : script classique + import(), pour marcher aussi en file://.
window.AOC_FB = {
  sdk: 'https://www.gstatic.com/firebasejs/13.1.0/',
  config: { apiKey: 'AIzaSyBG6sWwr4SNxzzDN0PyXQWWxWB5QqtjaAw', projectId: 'appels-offres-corse', authDomain: 'appels-offres-corse.firebaseapp.com', appId: '1:380685371693:web:8fd32fb211860a362feba4' },
  // émulateur sur localhost, ou sur un domaine .test (captures Playwright)
  emulateur: /^(localhost|127\.0\.0\.1|.+\.test)$/.test(location.hostname),
  ouvrir: function (avecAuth) {
    var F = window.AOC_FB;
    // projet de démo en ligne : rien à joindre (évite des erreurs réseau chez les visiteurs)
    if (/^demo-/.test(F.config.projectId) && !F.emulateur) return Promise.reject(new Error('Firebase pas encore configuré'));
    var mods = [import(F.sdk + 'firebase-app.js'), import(F.sdk + 'firebase-firestore-lite.js')];
    if (avecAuth) mods.push(import(F.sdk + 'firebase-auth.js'));
    return Promise.all(mods).then(function (m) {
      var app = m[0].initializeApp(F.config);
      var auth = avecAuth ? m[2].getAuth(app) : null;
      var db = m[1].getFirestore(app);
      if (F.emulateur) {
        m[1].connectFirestoreEmulator(db, '127.0.0.1', 8080);
        if (auth) m[2].connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
      return { fs: m[1], db: db, au: m[2], auth: auth };
    });
  }
};
