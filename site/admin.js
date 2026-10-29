// Modération : connexion Firebase Auth (compte admin listé dans config/admins), puis valider / refuser / retirer les demandes,
// et lire les messages « Je suis intéressé » des artisans pour les transmettre au demandeur.
// Les règles Firestore font foi : un autre compte connecté ne lit rien.
(function () {
  var METIERS = { 'gros-oeuvre': 'Gros œuvre, bâtiment', 'second-oeuvre': 'Second œuvre, finitions', electricite: 'Électricité, éclairage',
    'plomberie-cvc': 'Plomberie, chauffage, clim', 'voirie-vrd': 'Voirie, réseaux (VRD)', 'espaces-verts': 'Espaces verts',
    nettoyage: 'Nettoyage, déchets', informatique: 'Informatique, télécoms', etudes: "Études, maîtrise d'œuvre",
    restauration: 'Restauration, alimentation', services: 'Services', fournitures: 'Fournitures, équipements' };
  var $ = function (id) { return document.getElementById(id); };
  var f;
  var profils = {}; // users/{uid}, pour la décennale des entreprises qui répondent

  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte != null) e.textContent = texte;
    return e;
  }
  function date(ts) { return ts ? ts.toDate().toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '–'; }
  function montrer(id) { ['connexion', 'espace', 'chargement'].forEach(function (x) { $(x).hidden = x !== id; }); }
  function erreur(id, msg) { $(id).textContent = msg; $(id).hidden = !msg; }

  // fiche officielle de l'établissement, pour vérifier un SIRET à la main (l'inscription l'a vérifié, sauf si l'annuaire ne répondait pas)
  function lienSiret(siret) {
    var a = el('a', '', 'SIRET ' + siret);
    a.href = 'https://annuaire-entreprises.data.gouv.fr/etablissement/' + siret;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  function lien(co, c) {
    if (c.telephone) { var t = el('a', '', c.telephone); t.href = 'tel:' + c.telephone.replace(/[^+0-9]/g, ''); co.append(t, ' '); }
    if (c.email) { var m = el('a', '', c.email); m.href = 'mailto:' + c.email; co.append(m); }
  }

  // tout ce qui part avec une demande : coordonnées, photos, messages d'artisans, puis la demande
  function aSupprimer(l) {
    return [f.fs.doc(f.db, l.ref.path, 'prive', 'contact')].concat(l.photos.map(function (p) { return p.ref; }),
      l.interets.map(function (i) { return i.ref; }), [l.ref]);
  }

  function carte(l, auteur) {
    var ref = l.ref, d = l.d, c = l.c;
    var a = el('article', 'avis avis-admin');
    var corps = el('div', 'corps');
    var haut = el('p', 'haut');
    haut.append(el('span', 'metier', METIERS[d.metier] || d.metier), el('span', 'dep', d.departement),
      el('span', 'dep', d.type === 'particulier' ? 'Particulier' : 'Société'),
      el('span', 'dep', !auteur ? 'Compte supprimé' : auteur.type === 'entreprise' ? 'Compte Entreprise' : 'Compte Particulier'));
    if (echue(d)) haut.append(el('span', 'dep echue', 'Échue : à supprimer'));
    if (d.pourvue) haut.append(el('span', 'dep', 'Pourvue (par le demandeur)'));
    if ((d.nbInterets || 0) >= 5) haut.append(el('span', 'dep', 'Complète : 5 entreprises'));
    corps.append(haut, el('h3', '', d.titre), el('p', 'description description-entiere', d.description));
    // photos : publiques une fois la demande validée, à regarder avant (visages, plaques, adresses)
    if (l.photos.length) {
      var galerie = el('div', 'galerie galerie-admin');
      l.photos.forEach(function (p, i) {
        var v = el('button', 'vignette');
        v.type = 'button';
        v.setAttribute('aria-pressed', 'false');
        v.setAttribute('aria-label', 'Agrandir la photo ' + (i + 1));
        var img = el('img');
        img.src = 'data:image/jpeg;base64,' + p.data().data.toBase64();
        img.alt = 'Photo ' + (i + 1);
        v.append(img);
        v.onclick = function () { v.setAttribute('aria-pressed', String(v.getAttribute('aria-pressed') !== 'true')); };
        galerie.append(v);
      });
      corps.append(galerie);
    }
    var dl = el('dl', 'infos');
    [['Lieu', d.commune], ['Budget', d.budget ? d.budget.toLocaleString('fr-FR') + ' €' : '–'],
      ['Réponses avant le', date(d.delai)], ['Reçue le', date(d.cree)]].forEach(function (kv) {
      var div = el('div');
      div.append(el('dt', '', kv[0]), el('dd', '', kv[1]));
      dl.append(div);
    });
    corps.append(dl);
    var co = el('div', 'contact-prive');
    co.append(el('p', 'titre-outil', 'Coordonnées (privées)'), el('p', '', c ? c.nom : '(introuvables)'));
    if (c) lien(co, c);
    if (auteur && auteur.type === 'entreprise') {
      var societe = el('p', '', 'Compte : ' + auteur.nom + ' · ');
      societe.append(lienSiret(auteur.siret));
      co.append(societe);
    }
    corps.append(co);
    if (d.statut === 'validee') {
      var it = el('div', 'interets');
      it.append(el('p', 'titre-outil', l.interets.length ? 'Artisans intéressés (' + l.interets.length + ') : à transmettre au demandeur'
        : 'Aucun artisan intéressé pour le moment'));
      l.interets.forEach(function (s) {
        var i = s.data();
        var bloc = el('div', 'contact-prive');
        bloc.append(el('p', 'qui-interet', i.nom + ' · ' + date(i.cree)));
        lien(bloc, i);
        bloc.append(el('p', 'description description-entiere', i.message));
        // décennale déclarée dans le profil de l'entreprise : à transmettre avec le message (non vérifiée)
        var dec = profils[i.uid] && profils[i.uid].decennale;
        var finDec = dec && new Date(dec.fin + 'T23:59');
        bloc.append(el('p', 'aide-bloc', !dec ? 'Décennale : non déclarée'
          : 'Décennale déclarée : ' + dec.assureur + (dec.contrat ? ', contrat ' + dec.contrat : '') + ', ' +
            (finDec < new Date() ? 'EXPIRÉE le ' : "valable jusqu'au ") + finDec.toLocaleDateString('fr-FR') + ' (attestation à demander)'));
        var sup = el('button', 'lien-bouton', 'Supprimer ce message');
        sup.type = 'button';
        // le compteur public (5 entreprises au plus) suit : une place se libère
        sup.onclick = function () {
          if (!confirm('Supprimer définitivement ce message et ses coordonnées ?')) return;
          var lot = f.fs.writeBatch(f.db);
          lot.delete(s.ref);
          // -1 à partir de la valeur en base (pas de la liste affichée, qui peut dater) ; les anciens messages
          // à identifiant au hasard n'ont jamais été comptés
          if (s.id === i.uid) lot.update(ref, { nbInterets: f.fs.increment(-1) });
          agir(lot.commit());
        };
        bloc.append(sup);
        it.append(bloc);
      });
      // étape « Réponses reçues » dans Mes demandes du demandeur
      var n = l.interets.length, faites = d.reponses || 0;
      if (faites) it.append(el('p', 'aide-bloc', 'Déjà notées comme transmises au demandeur : ' + faites));
      // seulement s'il y a de nouvelles réponses : après la suppression d'un message, le compteur du demandeur ne doit pas baisser
      if (n > faites) {
        var tr = el('button', 'bouton-sortir', n > 1 ? "J'ai transmis ces " + n + ' réponses au demandeur' : "J'ai transmis cette réponse au demandeur");
        tr.type = 'button';
        tr.onclick = function () { agir(f.fs.updateDoc(ref, { reponses: n })); };
        it.append(tr);
      }
      corps.append(it);
    }
    var actions = el('p', 'actions-admin');
    if (d.statut === 'en_attente') {
      var ok = el('button', 'bouton-publier', 'Valider');
      ok.type = 'button';
      ok.onclick = function () { agir(f.fs.updateDoc(ref, { statut: 'validee' })); };
      actions.append(ok);
    }
    var non = el('button', 'bouton-refus', d.statut === 'en_attente' ? 'Refuser et supprimer' : 'Retirer et supprimer');
    non.type = 'button';
    non.onclick = function () {
      if (!confirm('Supprimer définitivement cette demande, ses coordonnées et les messages des artisans ?')) return;
      // un artisan a pu écrire depuis le chargement : on repasse « en attente » (les règles bloquent alors tout nouveau message),
      // puis on relit les messages avant de tout supprimer ; en cas d'échec, la demande reste visible ici, en attente
      var avant = d.statut === 'validee' ? f.fs.updateDoc(ref, { statut: 'en_attente' }) : Promise.resolve();
      agir(avant.then(function () { return f.fs.getDocs(f.fs.collection(f.db, ref.path, 'interets')); }).then(function (res) {
        l.interets = res.docs;
        var lot = f.fs.writeBatch(f.db);
        aSupprimer(l).forEach(function (r) { lot.delete(r); });
        return lot.commit();
      }));
    };
    actions.append(non);
    corps.append(actions);
    a.append(corps);
    return a;
  }

  // promesse de la page Confidentialité : suppression au plus tard 3 mois après la date limite
  // shortcut: suppression à la main par ce bouton ; passer à une règle TTL Firestore si l'admin oublie
  function echue(d) { return d.delai && d.delai.toMillis() < Date.now() - 90 * 864e5; }
  var echues = [];
  $('purger').addEventListener('click', function () {
    if (!confirm('Supprimer définitivement ' + echues.length + ' demande(s) échue(s), leurs coordonnées et les messages des artisans ?')) return;
    var lot = f.fs.writeBatch(f.db);
    echues.forEach(function (refs) { refs.forEach(function (r) { lot.delete(r); }); });
    agir(lot.commit());
  });

  function agir(p) {
    p.then(charger, function (e) { erreur('erreur', 'Action refusée : ' + (e && e.code || e)); });
  }

  // comptes (users/{uid}) : lecture seule, les plus récents d'abord ; renvoie { uid: profil } pour les auteurs des demandes
  function comptes() {
    return f.fs.getDocs(f.fs.collection(f.db, 'users')).then(function (res) {
      var ul = $('comptes');
      ul.textContent = '';
      var auteurs = {};
      res.docs.forEach(function (s) { auteurs[s.id] = s.data(); });
      var docs = res.docs.map(function (s) { return s.data(); });
      docs.sort(function (x, y) { return (y.cree ? y.cree.toMillis() : 0) - (x.cree ? x.cree.toMillis() : 0); });
      $('nb-comptes').textContent = docs.length;
      docs.forEach(function (p) {
        var ent = p.type === 'entreprise';
        var li = el('li');
        var details = el('span', 'aide', ent ? ' · ' + p.metiers.map(function (m) { return METIERS[m] || m; }).join(', ') + ' · ' + p.zone.join(', ') : p.commune);
        if (ent) details.prepend(lienSiret(p.siret));
        li.append(el('span', 'dep', ent ? 'Entreprise' : 'Particulier'), ' ', el('strong', '', p.nom), details,
          el('span', 'aide', 'créé le ' + date(p.cree)));
        ul.append(li);
      });
      if (!docs.length) ul.append(el('li', 'vide', 'Aucun compte pour le moment.'));
      return auteurs;
    }, function (e) { erreur('erreur', 'Comptes illisibles : ' + (e && e.code || e)); return {}; });
  }

  function charger() {
    erreur('erreur', '');
    var auteurs = {};
    return comptes().then(function (a) { auteurs = profils = a; return f.fs.getDocs(f.fs.collection(f.db, 'demandes')); }).then(function (res) {
      return Promise.all(res.docs.map(function (d) {
        return Promise.all([f.fs.getDoc(f.fs.doc(f.db, d.ref.path, 'prive', 'contact')), f.fs.getDocs(f.fs.collection(f.db, d.ref.path, 'interets')),
          d.data().photos ? f.fs.getDocs(f.fs.collection(f.db, d.ref.path, 'photos')) : { docs: [] }])
          .then(function (r) { return { ref: d.ref, d: d.data(), c: r[0].exists() ? r[0].data() : null, interets: r[1].docs, photos: r[2].docs }; });
      }));
    }).then(function (lignes) {
      var ms = function (l) { return l.d.cree ? l.d.cree.toMillis() : 0; };
      lignes.sort(function (x, y) { return ms(y) - ms(x); });
      var t = function (s) { return s.data().cree ? s.data().cree.toMillis() : 0; };
      lignes.forEach(function (l) { l.interets.sort(function (x, y) { return t(x) - t(y); }); });
      ['attente', 'publiees'].forEach(function (id) { $(id).textContent = ''; });
      // un lot Firestore = 500 suppressions au plus ; le reste partira au clic suivant
      var n = 0;
      echues = lignes.filter(function (l) { return echue(l.d); }).map(aSupprimer)
        .filter(function (refs) { n += refs.length; return n <= 500; });
      $('purger').hidden = !echues.length;
      $('purger').textContent = 'Supprimer les demandes échues (' + echues.length + ')';
      lignes.forEach(function (l) {
        $(l.d.statut === 'validee' ? 'publiees' : 'attente').append(carte(l, auteurs[l.d.uid]));
      });
      $('nb-attente').textContent = $('attente').children.length;
      $('nb-publiees').textContent = $('publiees').children.length;
      if (!$('attente').children.length) $('attente').append(el('p', 'vide', 'Aucune demande en attente.'));
      montrer('espace');
    }, function (e) {
      montrer('espace');
      erreur('erreur', e && e.code === 'permission-denied' ? "Ce compte n'est pas administrateur." : 'Lecture impossible : ' + (e && e.message));
    });
  }

  AOC_FB.ouvrir(true).then(function (r) {
    f = r;
    f.au.onAuthStateChanged(f.auth, function (u) {
      if (u) { $('qui').textContent = 'Connecté : ' + u.email; charger(); } else montrer('connexion');
    });
  }, function () { $('chargement').textContent = 'Firebase injoignable : vérifiez la connexion.'; });

  $('connexion').addEventListener('submit', function (e) {
    e.preventDefault();
    erreur('ad-erreur', '');
    f.au.signInWithEmailAndPassword(f.auth, $('ad-email').value.trim(), $('ad-mdp').value).catch(function () {
      erreur('ad-erreur', 'E-mail ou mot de passe incorrect.');
    });
  });
  $('deconnexion').addEventListener('click', function () { f.au.signOut(f.auth); });
})();
