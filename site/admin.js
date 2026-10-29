// Modération : connexion Firebase Auth (compte admin listé dans config/admins), puis valider / refuser / retirer les demandes,
// lire les messages « Je suis intéressé » des artisans pour les transmettre au demandeur, les recherches de partenaires,
// et relire les fiches publiques des entreprises.
// Les règles Firestore font foi : un autre compte connecté ne lit rien.
(function () {
  var METIERS = { 'gros-oeuvre': 'Gros œuvre, bâtiment', 'second-oeuvre': 'Second œuvre, finitions', electricite: 'Électricité, éclairage',
    'plomberie-cvc': 'Plomberie, chauffage, clim', 'voirie-vrd': 'Voirie, réseaux (VRD)', 'espaces-verts': 'Espaces verts',
    nettoyage: 'Nettoyage, déchets', informatique: 'Informatique, télécoms', etudes: "Études, maîtrise d'œuvre",
    restauration: 'Restauration, alimentation', services: 'Services', fournitures: 'Fournitures, équipements' };
  var $ = function (id) { return document.getElementById(id); };
  var f;
  var profils = {}; // users/{uid}, pour la décennale des entreprises qui répondent
  var boamp = []; // avis du BOAMP (data.json), pour repérer un avis d'acheteur déjà publié là-bas

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

  // tout ce qui part avec une demande : coordonnées, photos, messages d'artisans, discussions et leurs messages, puis la demande
  function aSupprimer(l) {
    var disc = [];
    l.discussions.forEach(function (x) { disc = disc.concat(x.msgs.map(function (m) { return m.ref; }), [x.s.ref]); });
    return [f.fs.doc(f.db, l.ref.path, 'prive', 'contact')].concat(l.photos.map(function (p) { return p.ref; }),
      l.interets.map(function (i) { return i.ref; }), disc, [l.ref]);
  }

  // discussions de la demande (lot 18.6), lisibles par l'admin pour la modération : supprimer un message, fermer la discussion
  function blocDiscussions(l) {
    var box = el('div', 'interets');
    box.append(el('p', 'titre-outil', 'Discussions privées (' + l.discussions.length + ') : à lire seulement pour la modération'));
    l.discussions.forEach(function (x) {
      var d = x.s.data(), bloc = el('div', 'contact-prive');
      bloc.append(el('p', 'qui-interet', d.nomEntreprise + ' ↔ demandeur · ' + (d.ouverte ? 'ouverte' : 'fermée') + ' · dernier message le ' + date(d.maj)));
      x.msgs.forEach(function (m) {
        var msg = m.data(), p = el('p', 'description description-entiere', (msg.auteur === d.particulier ? 'Demandeur' : d.nomEntreprise) + ' · ' + date(msg.cree) + ' : ' + msg.texte);
        var sup = el('button', 'lien-bouton', 'Supprimer ce message');
        sup.type = 'button';
        sup.onclick = function () { if (confirm('Supprimer définitivement ce message ?')) agir(f.fs.deleteDoc(m.ref)); };
        p.append(' ', sup);
        bloc.append(p);
      });
      if (d.ouverte) {
        var fermer = el('button', 'bouton-sortir', 'Fermer la discussion');
        fermer.type = 'button';
        fermer.onclick = function () { if (confirm('Fermer cette discussion ? Plus personne ne pourra y écrire.')) agir(f.fs.updateDoc(x.s.ref, { ouverte: false })); };
        bloc.append(fermer);
      }
      box.append(bloc);
    });
    return box;
  }

  function carte(l, auteur) {
    var ref = l.ref, d = l.d, c = l.c;
    var pub = d.type === 'public'; // avis d'acheteur public (lot 19) : en attente jusqu'à « Valider et publier »
    var a = el('article', 'avis avis-admin');
    a.id = 'd-' + ref.id; // admin.html#d-<id> : lien envoyé par outils/moderer.py
    var corps = el('div', 'corps');
    var haut = el('p', 'haut');
    haut.append(el('span', 'metier autres', METIERS[d.metier] || d.metier), el('span', 'dep', d.departement),
      el('span', 'dep', d.type === 'particulier' ? 'Particulier' : pub ? 'Acheteur public' : 'Société'),
      el('span', 'dep', !auteur ? 'Compte supprimé' : auteur.type === 'entreprise' ? 'Compte Entreprise' : 'Compte Particulier'));
    if (echue(d)) haut.append(el('span', 'dep echue', 'Échue : à supprimer'));
    if (d.pourvue) haut.append(el('span', 'dep', 'Pourvue (par le demandeur)'));
    if ((d.nbInterets || 0) >= 5) haut.append(el('span', 'dep', 'Complète : 5 entreprises'));
    corps.append(haut, el('h3', '', d.titre));
    if (!pub) corps.append(el('p', 'description description-entiere', d.description));
    if (pub) {
      // à vérifier avant de publier : le lien mène bien à cet avis, sur la plateforme de l'acheteur ou un PDF officiel
      var officiel = el('a', '', d.lien);
      officiel.href = d.lien;
      officiel.target = '_blank';
      officiel.rel = 'noopener noreferrer';
      var lp = el('p', 'aide-bloc', 'Lien officiel à vérifier : ');
      lp.append(officiel);
      corps.append(el('p', 'acheteur', d.acheteur), lp);
      // déjà au BOAMP : l'accueil le cache tout seul ; s'il n'est pas encore publié, inutile de le valider
      boamp.filter(function (b) { return AOC_FB.doublon(d, b); }).forEach(function (b) {
        var vu = el('p', 'aide-bloc doublon-boamp', 'Peut-être déjà au BOAMP (avis ' + b.id + ', ' + b.acheteur + ') : ');
        var lb = el('a', '', b.objet);
        lb.href = b.lien;
        lb.target = '_blank';
        lb.rel = 'noopener';
        vu.append(lb, ". Si c'est le même, il est caché de l'accueil : inutile de le publier.");
        corps.append(vu);
      });
    }
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
    [['Lieu', d.commune], [pub ? 'Montant estimé' : 'Budget', d.budget ? d.budget.toLocaleString('fr-FR') + ' €' : '–'],
      ['Réponses avant le', date(d.delai)], ['Reçue le', date(d.cree)]].forEach(function (kv) {
      var div = el('div');
      div.append(el('dt', '', kv[0]), el('dd', '', kv[1]));
      dl.append(div);
    });
    corps.append(dl);
    var co = el('div', 'contact-prive');
    co.append(el('p', 'titre-outil', pub ? 'Contact du service marchés (privé)' : 'Coordonnées (privées)'), el('p', '', c ? c.nom : '(introuvables)'));
    if (c) lien(co, c);
    if (auteur && auteur.type === 'entreprise') {
      var societe = el('p', '', 'Compte : ' + auteur.nom + ' · ');
      societe.append(lienSiret(auteur.siret));
      co.append(societe);
    }
    corps.append(co);
    if (d.statut === 'validee' && !pub) {
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
        bloc.append(el('p', finDec < new Date() ? 'aide-bloc dec-expiree' : 'aide-bloc', !dec ? 'Décennale : non déclarée'
          : 'Décennale déclarée : ' + dec.assureur + (dec.contrat ? ', contrat ' + dec.contrat : '') + ', ' +
            (finDec < new Date() ? 'EXPIRÉE le ' : "valable jusqu'au ") + finDec.toLocaleDateString('fr-FR') + ' (attestation à demander)'));
        lienFiche(bloc, i.uid);
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
    if (l.discussions.length) corps.append(blocDiscussions(l));
    var actions = el('p', 'actions-admin');
    // Retirer : cachée du site (« en_attente »), gardée dans « Retirées, pas visibles » ; Republier : de nouveau en ligne
    var publiee = d.statut === 'validee';
    var bascule = el('button', publiee ? 'bouton-sortir' : 'bouton-publier', publiee ? 'Retirer' : pub ? 'Valider et publier' : 'Republier');
    bascule.type = 'button';
    bascule.dataset.bascule = '';
    // Retirer ferme aussi ses discussions ouvertes, dans la même écriture (sinon l'entreprise pourrait encore écrire) ; définitif.
    // Relues au clic : une entreprise a pu en ouvrir une depuis le chargement de la page
    bascule.onclick = function () {
      (publiee ? discussionsDe(ref.id) : Promise.resolve([])).then(function (ds) {
        var ouvertes = ds.filter(function (x) { return x.s.data().ouverte; });
        if (ouvertes.length && !confirm('Retirer cette demande ? ' + (ouvertes.length === 1 ? 'Sa discussion ouverte sera fermée'
          : 'Ses ' + ouvertes.length + ' discussions ouvertes seront fermées') + ', définitivement.')) return;
        var lot = f.fs.writeBatch(f.db);
        lot.update(ref, { statut: publiee ? 'en_attente' : 'validee' });
        ouvertes.forEach(function (x) { lot.update(x.s.ref, { ouverte: false }); });
        agir(lot.commit());
      });
    };
    actions.append(bascule);
    var non = el('button', 'bouton-refus', 'Supprimer');
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
    if (!confirm('Supprimer définitivement ' + echues.length + ' demande(s) ou recherche(s) de partenaire échue(s), leurs coordonnées et les messages des artisans ?')) return;
    var lot = f.fs.writeBatch(f.db);
    echues.forEach(function (refs) { refs.forEach(function (r) { lot.delete(r); }); });
    agir(lot.commit());
  });

  function discussionsDe(id) {
    return f.fs.getDocs(f.fs.query(f.fs.collection(f.db, 'discussions'), f.fs.where('demande', '==', id))).then(function (res) {
      return Promise.all(res.docs.map(function (s) {
        return f.fs.getDocs(f.fs.query(f.fs.collection(s.ref, 'messages'), f.fs.orderBy('cree'))).then(function (m) { return { s: s, msgs: m.docs }; });
      }));
    }, function (e) { console.warn('Discussions illisibles :', e && e.code); return []; }); // règles pas encore publiées
  }

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

  // « Je cherche un partenaire » : regroupées par avis BOAMP ; dès 2 entreprises, l'admin transmet à chacune les coordonnées des autres
  function partenaires(docs) {
    var box = $('partenaires'), par = {};
    box.textContent = '';
    docs.forEach(function (s) { var p = s.data(); (par[p.avis] = par[p.avis] || []).push(s); });
    Object.keys(par).forEach(function (avis) {
      var liste = par[avis], p0 = liste[0].data();
      var a = el('article', 'avis avis-admin'), corps = el('div', 'corps');
      var haut = el('p', 'haut');
      haut.append(el('span', 'dep', 'Avis ' + avis));
      if (p0.limite && p0.limite.toMillis() < Date.now() - 90 * 864e5) haut.append(el('span', 'dep echue', 'Échue : à supprimer'));
      var officiel = el('a', '', "Voir l'avis officiel");
      officiel.href = 'https://www.boamp.fr/pages/avis/?q=idweb:' + encodeURIComponent(avis);
      officiel.target = '_blank';
      officiel.rel = 'noopener';
      var info = el('p', 'aide-bloc', 'Réponses avant le ' + date(p0.limite) + ' · ' + (liste.length > 1
        ? liste.length + ' entreprises : transmettez à chacune les coordonnées des autres · ' : "1 entreprise : en attente d'une autre · "));
      info.append(officiel);
      corps.append(haut, el('h3', '', p0.objet), info);
      liste.forEach(function (s) {
        var p = s.data(), bloc = el('div', 'contact-prive');
        bloc.append(el('p', 'qui-interet', p.nom + ' · ' + date(p.cree)));
        lien(bloc, p);
        bloc.append(el('p', 'description description-entiere', p.message));
        lienFiche(bloc, p.uid);
        var sup = el('button', 'lien-bouton', 'Supprimer ce message');
        sup.type = 'button';
        sup.onclick = function () { if (confirm('Supprimer définitivement ce message et ses coordonnées ?')) agir(f.fs.deleteDoc(s.ref)); };
        bloc.append(sup);
        corps.append(bloc);
      });
      a.append(corps);
      box.append(a);
    });
    $('nb-partenaires').textContent = Object.keys(par).length;
    if (!docs.length) box.append(el('p', 'vide', 'Aucune recherche de partenaire.'));
  }

  // fiches publiques (fiches/{uid}) : à relire avant la mise en ligne ; toute modification par l'entreprise la remet en attente
  var enLigne = {}; // uid -> lien de la fiche validée, ajouté aux messages de l'entreprise
  function lienFiche(bloc, uid) {
    if (!enLigne[uid]) return;
    var p = el('p', 'aide-bloc', 'Fiche publique à transmettre : ');
    var a = el('a', '', enLigne[uid]);
    a.href = enLigne[uid];
    a.target = '_blank';
    a.rel = 'noopener';
    p.append(a);
    bloc.append(p);
  }
  function fiches(docs) {
    var box = $('fiches');
    box.textContent = '';
    enLigne = {};
    var ms = function (s) { return s.data().maj ? s.data().maj.toMillis() : 0; };
    docs.slice().sort(function (x, y) { return (x.data().statut === 'validee') - (y.data().statut === 'validee') || ms(y) - ms(x); }).forEach(function (s) {
      var p = s.data(), ok = p.statut === 'validee';
      if (ok) enLigne[s.id] = new URL('entreprise.html?id=' + encodeURIComponent(s.id), location.href).href;
      var a = el('article', 'avis avis-admin'), corps = el('div', 'corps'), haut = el('p', 'haut');
      haut.append(el('span', 'dep', ok ? 'En ligne' : 'À relire'), el('span', 'dep', p.zone.join(', ')));
      var infos = el('p', 'aide-bloc', ' · ' + p.metiers.map(function (m) { return METIERS[m] || m; }).join(', ') + ' · envoyée le ' + date(p.maj));
      infos.prepend(lienSiret(p.siret));
      corps.append(haut, el('h3', '', p.nom), infos, el('p', 'description description-entiere', p.presentation));
      if (ok) lienFiche(corps, s.id);
      var actions = el('p', 'actions-admin');
      var b = el('button', ok ? 'bouton-sortir' : 'bouton-publier', ok ? 'Remettre en attente' : 'Mettre en ligne');
      b.type = 'button';
      b.onclick = function () { agir(f.fs.updateDoc(s.ref, { statut: ok ? 'en_attente' : 'validee' })); };
      var non = el('button', 'bouton-refus', 'Supprimer la fiche');
      non.type = 'button';
      non.onclick = function () { if (confirm('Supprimer cette fiche ? L\'entreprise pourra en envoyer une autre.')) agir(f.fs.deleteDoc(s.ref)); };
      actions.append(b, non);
      corps.append(actions);
      a.append(corps);
      box.append(a);
    });
    $('nb-fiches').textContent = docs.length;
    if (!docs.length) box.append(el('p', 'vide', 'Aucune fiche pour le moment.'));
  }

  function charger() {
    erreur('erreur', '');
    var auteurs = {}, recherches = [];
    // règles pas encore publiées, ou panne : le reste de la page doit marcher quand même
    var lire = function (nom) {
      return f.fs.getDocs(f.fs.collection(f.db, nom)).catch(function (e) { console.warn(nom + ' illisibles :', e && e.code); return { docs: [] }; });
    };
    var avisBoamp = fetch('data.json').then(function (rep) { return rep.json(); }).then(function (j) { return j.avis; }, function () { return []; });
    return Promise.all([comptes(), lire('partenaires'), lire('fiches'), avisBoamp]).then(function (r) {
      auteurs = profils = r[0];
      boamp = r[3];
      recherches = r[1].docs;
      fiches(r[2].docs);
      return f.fs.getDocs(f.fs.collection(f.db, 'demandes'));
    }).then(function (res) {
      return Promise.all(res.docs.map(function (d) {
        return Promise.all([f.fs.getDoc(f.fs.doc(f.db, d.ref.path, 'prive', 'contact')), f.fs.getDocs(f.fs.collection(f.db, d.ref.path, 'interets')),
          d.data().photos ? f.fs.getDocs(f.fs.collection(f.db, d.ref.path, 'photos')) : { docs: [] }, discussionsDe(d.id)])
          .then(function (r) { return { ref: d.ref, d: d.data(), c: r[0].exists() ? r[0].data() : null, interets: r[1].docs, photos: r[2].docs, discussions: r[3] }; });
      }));
    }).then(function (lignes) {
      var ms = function (l) { return l.d.cree ? l.d.cree.toMillis() : 0; };
      lignes.sort(function (x, y) { return ms(y) - ms(x); });
      var t = function (s) { return s.data().cree ? s.data().cree.toMillis() : 0; };
      lignes.forEach(function (l) { l.interets.sort(function (x, y) { return t(x) - t(y); }); });
      ['a-valider', 'attente', 'publiees'].forEach(function (id) { $(id).textContent = ''; });
      // un lot Firestore = 500 suppressions au plus ; le reste partira au clic suivant
      var n = 0;
      echues = lignes.filter(function (l) { return echue(l.d); }).map(aSupprimer)
        .concat(recherches.filter(function (s) { return echue({ delai: s.data().limite }); }).map(function (s) { return [s.ref]; }))
        .filter(function (refs) { n += refs.length; return n <= 500; });
      $('purger').hidden = !echues.length;
      $('purger').textContent = 'Supprimer les demandes et recherches échues (' + echues.length + ')';
      partenaires(recherches);
      lignes.forEach(function (l) {
        $(l.d.statut === 'validee' ? 'publiees' : l.d.type === 'public' ? 'a-valider' : 'attente').append(carte(l, auteurs[l.d.uid]));
      });
      $('nb-a-valider').textContent = $('a-valider').children.length;
      if (!$('a-valider').children.length) $('a-valider').append(el('p', 'vide', "Aucun avis d'acheteur à valider."));
      $('nb-attente').textContent = $('attente').children.length;
      $('nb-publiees').textContent = $('publiees').children.length;
      if (!$('attente').children.length) $('attente').append(el('p', 'vide', 'Aucune demande retirée.'));
      montrer('espace');
      var vise = location.hash && document.getElementById(location.hash.slice(1));
      // lien du message de modération : la demande à l'écran, focus sur « Retirer »
      if (vise) { vise.scrollIntoView(); vise.querySelector('[data-bascule]').focus({ preventScroll: true }); }
      if (location.hash) history.replaceState(null, '', location.pathname + location.search); // une seule fois, pas après chaque action
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
