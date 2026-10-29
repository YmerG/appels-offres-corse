// Firebase (Firestore Lite + Auth), chargé à la demande depuis gstatic : script classique + import(), pour marcher aussi en file://.
window.AOC_FB = {
  sdk: 'https://www.gstatic.com/firebasejs/13.1.0/',
  config: { apiKey: 'AIzaSyBG6sWwr4SNxzzDN0PyXQWWxWB5QqtjaAw', projectId: 'appels-offres-corse', authDomain: 'appels-offres-corse.firebaseapp.com', messagingSenderId: '380685371693', appId: '1:380685371693:web:8fd32fb211860a362feba4' },
  // clé publique « Web Push » (console Firebase › Paramètres du projet › Cloud Messaging › Certificats Web Push) ;
  // vide : pas de notifications (rien n'est proposé)
  vapid: '',
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
        // pastille sur « Compte » : demandes qui ont changé depuis la dernière visite de Mes demandes, et discussions non lues
        // (celles-ci aussi sur l'icône de l'appli installée)
        if (u) Promise.all([m[1].getDocs(m[1].query(m[1].collection(db, 'demandes'), m[1].where('uid', '==', u.uid))),
          F.discussions({ fs: m[1], db: db }, u.uid)]).then(function (r) {
          // la discussion à l'écran (discussion.js) compte comme lue : elle l'est aussitôt ouverte
          var lues = r[1].filter(function (s) { return s.id !== F.ouverte && F.nonLue(s.data(), u.uid); }).length;
          F.badge(lues);
          var n = F.nouveautes(u.uid, r[0].docs).length + lues;
          if (!n || c.querySelector('.pastille-compte')) return;
          var p = document.createElement('span');
          p.className = 'pastille-compte';
          p.textContent = n;
          c.append(p);
          c.setAttribute('aria-label', 'Compte : ' + n + (n > 1 ? ' nouveautés' : ' nouveauté'));
        }).catch(function () {});
      });
      return { fs: m[1], db: db, au: m[2], auth: auth, app: app };
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
  // Discussions du compte (discussions/{demande}_{uid entreprise}) : comme demandeur ou comme entreprise. Une requête par rôle :
  // les règles n'autorisent que ces deux filtres. Règles pas encore publiées, panne : liste vide plutôt qu'une erreur.
  discussions: function (f, uid) {
    var q = function (champ) {
      return f.fs.getDocs(f.fs.query(f.fs.collection(f.db, 'discussions'), f.fs.where(champ, '==', uid))).then(function (r) { return r.docs; }, function () { return []; });
    };
    return Promise.all([q('particulier'), q('entreprise')]).then(function (r) { return r[0].concat(r[1]); });
  },
  // non lue : le dernier message vient de l'autre, et on ne l'a pas ouverte depuis
  nonLue: function (d, uid) {
    var lu = uid === d.particulier ? d.luP : d.luE;
    return d.dernier !== uid && !!d.maj && (!lu || lu.toMillis() < d.maj.toMillis());
  },
  // pastille sur l'icône de l'appli installée (Badging API ; ignorée là où elle n'existe pas)
  badge: function (n) {
    if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(function () {});
  },
  // Notifications d'un nouveau message (Firebase Cloud Messaging, envoyées par outils/notifier.py) : jeton de cet appareil
  // rangé dans jetons/{uid} (5 appareils au plus). L'autorisation doit être demandée pendant le clic (Safari) : en premier.
  activerNotifs: function () {
    var F = window.AOC_FB;
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw { code: 'refus' };
      return Promise.all([F.ouvrir(true), import(F.sdk + 'firebase-messaging.js'), navigator.serviceWorker.ready]);
    }).then(function (r) {
      var f = r[0], fm = r[1];
      return fm.getToken(fm.getMessaging(f.app), { vapidKey: F.vapid, serviceWorkerRegistration: r[2] }).then(function (jeton) {
        var ref = f.fs.doc(f.db, 'jetons', f.auth.currentUser.uid);
        return f.fs.getDoc(ref).then(function (s) {
          var liste = [jeton].concat((s.exists() ? s.data().liste : []).filter(function (j) { return j !== jeton; })).slice(0, 5);
          return f.fs.setDoc(ref, { liste: liste, maj: f.fs.serverTimestamp() });
        });
      });
    });
  },
  // bouton « Être prévenu » (Compte, discussion) ; rien tant que la clé Web Push n'est pas renseignée.
  // Déjà autorisé : jeton rafraîchi sans rien demander. iPhone : seulement depuis l'icône de l'écran d'accueil (iOS 16.4 et plus).
  boutonNotifs: function (box) {
    var F = window.AOC_FB;
    box.textContent = '';
    if (!F.vapid || !('serviceWorker' in navigator)) return;
    var p = document.createElement('p');
    p.className = 'aide-bloc';
    p.setAttribute('role', 'status');
    if (!('PushManager' in window) || !('Notification' in window)) {
      if (/iPhone|iPad/.test(navigator.userAgent)) {
        p.textContent = 'Sur iPhone, pour être prévenu d’un nouveau message : ajoutez ce site à l’écran d’accueil (bouton Partager, puis « Sur l’écran d’accueil »), puis ouvrez-le depuis son icône.';
        box.append(p);
      }
      return;
    }
    if (Notification.permission === 'granted') return F.activerNotifs().catch(function (e) { console.warn('Notifications :', e && (e.code || e.message)); });
    if (Notification.permission === 'denied') {
      p.textContent = 'Les notifications sont bloquées pour ce site : vous pouvez les autoriser dans les réglages du navigateur.';
      return box.append(p);
    }
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bouton-sortir';
    b.textContent = 'Être prévenu des nouveaux messages sur cet appareil';
    b.onclick = function () {
      b.disabled = true;
      F.activerNotifs().then(function () {
        p.textContent = 'C’est fait : vous serez prévenu ici d’un nouveau message.';
        b.remove();
      }, function (e) {
        b.disabled = false;
        p.textContent = e && e.code === 'refus' ? 'Autorisation refusée : aucune notification ne sera envoyée.' : 'L’activation a échoué. Réessayez plus tard.';
      });
    };
    box.append(b, p);
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
  // avis d'acheteur (lot 19) déjà au BOAMP. a = l'avis d'acheteur (Firestore : acheteur, titre, delai) ; b = un avis de data.json
  // (acheteur, objet, date_limite), lu tel quel par l'accueil et par l'admin. Même jour limite (à Paris),
  // même acheteur (ses mots se retrouvent tous dans l'autre) et objets proches, sans compter les mots de l'acheteur
  // (2 mots en commun au moins, et la moitié des mots du plus court). Un même acheteur a souvent plusieurs marchés aux
  // mots voisins (rapport 50) : la date limite les sépare.
  // shortcut: rapprochement par les mots ; un doublon qui passe quand même, l'admin le retire à la main (« Retirer »)
  doublon: function (a, b) {
    function jour(x) { return new Date(x).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }); }
    if (!a.delai || !b.date_limite || jour(a.delai.toDate()) !== jour(b.date_limite)) return false;
    var VIDES = ['commune', 'mairie', 'ville', 'communaute', 'communes', 'des', 'les', 'pour', 'sur', 'dans', 'avec',
      'travaux', 'marche', 'marches', 'prestations', 'fourniture', 'fournitures'];
    function mots(s) {
      return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
        .filter(function (m) { return m.length > 2 && VIDES.indexOf(m) === -1; });
    }
    function inclus(x, y) { return x.length > 0 && x.every(function (m) { return y.indexOf(m) !== -1; }); }
    var a1 = mots(a.acheteur), b1 = mots(b.acheteur);
    if (!inclus(a1, b1) && !inclus(b1, a1)) return false;
    var nom = function (m) { return a1.indexOf(m) === -1 && b1.indexOf(m) === -1; };
    var a2 = mots(a.titre).filter(nom), b2 = mots(b.objet).filter(nom);
    var communs = a2.filter(function (m, i) { return a2.indexOf(m) === i && b2.indexOf(m) !== -1; }).length;
    return communs >= 2 && communs * 2 >= Math.min(a2.length, b2.length);
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
