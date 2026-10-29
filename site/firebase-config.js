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
          c.parentNode.classList.add('avec-sortir');
        }
        b.hidden = !u;
        // pastille sur « Compte » : nombre de demandes qui ont changé depuis la dernière visite de Mes demandes
        if (u) m[1].getDocs(m[1].query(m[1].collection(db, 'demandes'), m[1].where('uid', '==', u.uid))).then(function (res) {
          var n = F.nouveautes(u.uid, res.docs).length;
          if (!n || c.querySelector('.pastille-compte')) return;
          var p = document.createElement('span');
          p.className = 'pastille-compte';
          p.textContent = n;
          c.append(p);
          c.setAttribute('aria-label', 'Compte : ' + n + (n > 1 ? ' nouveautés' : ' nouveauté'));
        }).catch(function () {});
      });
      return { fs: m[1], db: db, au: m[2], auth: auth };
    });
    F._ouvert.catch(function () { F._ouvert = null; }); // réseau coupé : on pourra réessayer
    return F._ouvert;
  },
  // Mes demandes : état vu la dernière fois dans ce navigateur (localStorage), pour signaler ce qui a changé.
  // Une demande jamais vue compte comme « publiée, 0 réponse » (publiée dès sa création) : seules les réponses ou un retrait sont une nouveauté.
  etat: function (d) { return d.statut + ':' + (d.reponses || 0); },
  vus: function (uid) { try { return JSON.parse(localStorage.getItem('aoc-vu-' + uid)) || {}; } catch (e) { return {}; } },
  nouveautes: function (uid, docs) {
    var F = window.AOC_FB, vu = F.vus(uid);
    return docs.filter(function (s) { return (vu[s.id] || 'validee:0') !== F.etat(s.data()); }).map(function (s) { return s.id; });
  },
  marquerVus: function (uid, docs) {
    var vu = {};
    docs.forEach(function (s) { vu[s.id] = window.AOC_FB.etat(s.data()); });
    try { localStorage.setItem('aoc-vu-' + uid, JSON.stringify(vu)); } catch (e) { /* navigation privée : pas de pastille */ }
  },
  // message d'erreur juste sous le champ (sous son groupe pour les cases), visible au téléphone ; msg vide : efface.
  // Liste de cases (métiers) : au-dessus, sous la légende, sinon il tombe hors de l'écran au téléphone.
  sous: function (champ, msg) {
    var ancre = champ.closest('.choix-2, .cases, .consentement') || champ;
    var dessus = ancre.classList.contains('cases');
    var p = dessus ? ancre.previousElementSibling : ancre.nextElementSibling;
    if (!p || !p.classList.contains('erreur-champ')) {
      if (!msg) return;
      p = document.createElement('p');
      p.className = 'erreur erreur-champ';
      p.id = 'err-' + (champ.name || champ.id);
      p.setAttribute('role', 'alert');
      if (dessus) ancre.before(p); else ancre.after(p);
    }
    p.textContent = msg;
    p.hidden = !msg;
    window.AOC_FB.sansErreur(champ);
    if (!msg) return champ.removeAttribute('aria-invalid');
    champ.setAttribute('aria-invalid', 'true');
    champ.setAttribute('aria-describedby', ((champ.getAttribute('aria-describedby') || '') + ' ' + p.id).trim());
    champ.focus();
    p.scrollIntoView({ block: 'nearest' }); // message entier visible, pas sous le bouton collé en bas au téléphone
  },
  // retire de aria-describedby les messages d'erreur (err-…), garde les aides du champ (ex. photos-aide)
  sansErreur: function (c) {
    var reste = (c.getAttribute('aria-describedby') || '').split(' ').filter(function (id) { return id && id.indexOf('err-') !== 0; }).join(' ');
    if (reste) c.setAttribute('aria-describedby', reste); else c.removeAttribute('aria-describedby');
  },
  effacer: function (form) {
    form.querySelectorAll('.erreur-champ').forEach(function (p) { p.hidden = true; });
    form.querySelectorAll('[aria-invalid]').forEach(function (c) { c.removeAttribute('aria-invalid'); window.AOC_FB.sansErreur(c); });
  },
  // déconnexion depuis n'importe quelle page : retour à l'accueil, qui affiche « Déconnexion réussie. »
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

// site installable comme une appli (manifest.webmanifest + sw.js) ; pas en file://, où les service workers n'existent pas
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
