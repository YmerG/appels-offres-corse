// Firebase (Firestore Lite + Auth), chargé à la demande depuis gstatic : script classique + import(), pour marcher aussi en file://.
window.AOC_FB = {
  sdk: 'https://www.gstatic.com/firebasejs/13.1.0/',
  config: { apiKey: 'AIzaSyBG6sWwr4SNxzzDN0PyXQWWxWB5QqtjaAw', projectId: 'appels-offres-corse', authDomain: 'appels-offres-corse.firebaseapp.com', appId: '1:380685371693:web:8fd32fb211860a362feba4' },
  // émulateur sur localhost, ou sur un domaine .test (captures Playwright) ; projet « demo- » : jamais le vrai projet
  emulateur: /^(localhost|127\.0\.0\.1|.+\.test)$/.test(location.hostname),
  // une seule ouverture par page : le premier appel décide si Auth est chargé
  ouvrir: function (avecAuth) {
    var F = window.AOC_FB;
    if (F._ouvert) return F._ouvert;
    var config = F.emulateur ? Object.assign({}, F.config, { projectId: 'demo-appels-offres-corse' }) : F.config;
    var mods = [import(F.sdk + 'firebase-app.js'), import(F.sdk + 'firebase-firestore-lite.js')];
    if (avecAuth) mods.push(import(F.sdk + 'firebase-auth.js'));
    F._ouvert = Promise.all(mods).then(function (m) {
      var app = m[0].initializeApp(config);
      var auth = avecAuth ? m[2].getAuth(app) : null;
      if (auth) auth.languageCode = 'fr'; // e-mails de vérification et de mot de passe en français
      var db = m[1].getFirestore(app);
      if (F.emulateur) {
        m[1].connectFirestoreEmulator(db, '127.0.0.1', 8080);
        if (auth) m[2].connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
      // « Se déconnecter » à côté de « Compte » dans l'en-tête, tant qu'une session est ouverte (admin : pas de lien Compte)
      if (auth) m[2].onAuthStateChanged(auth, function (u) {
        var c = document.querySelector('.lien-compte'), b = document.getElementById('sortir');
        if (!c) return;
        if (!b) {
          b = document.createElement('button');
          b.type = 'button';
          b.id = 'sortir';
          b.className = 'lien-compte sortir';
          b.textContent = 'Se déconnecter';
          b.onclick = F.deconnecter;
          c.after(b);
        }
        b.hidden = !u;
      });
      return { fs: m[1], db: db, au: m[2], auth: auth };
    });
    F._ouvert.catch(function () { F._ouvert = null; }); // réseau coupé : on pourra réessayer
    return F._ouvert;
  },
  // déconnexion depuis n'importe quelle page : retour à l'accueil, qui affiche « Vous êtes déconnecté. »
  deconnecter: function () {
    return window.AOC_FB.ouvrir(true).then(function (f) { return f.au.signOut(f.auth); })
      .then(function () { location.href = 'index.html?deconnecte'; });
  },
  // compte connecté et son profil (users/{uid}) : { f, user, profil } ; user et profil à null si personne n'est connecté
  moi: function () {
    return window.AOC_FB.ouvrir(true).then(function (f) {
      return f.auth.authStateReady().then(function () {
        var u = f.auth.currentUser;
        if (!u) return { f: f, user: null, profil: null };
        // e-mail vérifié dans un autre onglet : on relit le compte et on renouvelle le jeton (les règles lisent email_verified)
        var frais = u.emailVerified ? Promise.resolve() : u.reload().then(function () { if (u.emailVerified) return u.getIdToken(true); });
        return frais.then(function () { return f.fs.getDoc(f.fs.doc(f.db, 'users', u.uid)); })
          .then(function (s) { return { f: f, user: u, profil: s.exists() ? s.data() : null }; });
      });
    });
  }
};
