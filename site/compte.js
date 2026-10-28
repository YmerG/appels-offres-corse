// Comptes : inscription (particulier ou entreprise de travaux), connexion, mot de passe oublié, e-mail de vérification,
// profil users/{uid} (privé : son titulaire et l'admin seulement), « Mes demandes », suppression du compte.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form');
  var METIERS = {};
  form.querySelectorAll('[name=metiers]').forEach(function (c) { METIERS[c.value] = c.parentNode.textContent.trim(); });
  var f, moi, profil, typeFige = null, enCours = false;

  // retour après connexion vers la page qui l'a demandée (seulement nos deux formulaires)
  var retour = new URLSearchParams(location.search).get('retour') || '';
  if (!/^(publier|interesse)\.html(\?(d|type)=[A-Za-z0-9_-]{1,64})?$/.test(retour)) retour = '';
  if (retour) {
    $('raison').textContent = retour.indexOf('interesse') === 0
      ? 'Pour répondre à une demande, connectez-vous avec un compte Entreprise de travaux, ou créez-en un.'
      : 'Pour publier une demande de travaux, connectez-vous ou créez un compte (Particulier, ou Entreprise de travaux pour une demande de société).';
    $('raison').hidden = false;
    if (retour.indexOf('interesse') === 0) form.type.value = 'entreprise';
  }

  // SIRET : 14 chiffres et clé de Luhn (La Poste, SIREN 356000000 : somme des chiffres multiple de 5)
  function siretValide(s) {
    if (!/^\d{14}$/.test(s)) return false;
    var luhn = 0, chiffres = 0;
    for (var i = 0; i < 14; i++) { var d = +s[13 - i] * (i % 2 ? 2 : 1); luhn += d > 9 ? d - 9 : d; chiffres += +s[13 - i]; }
    return luhn % 10 === 0 || (s.slice(0, 9) === '356000000' && chiffres % 5 === 0);
  }
  window.siretValide = siretValide; // pour les tests

  // SIRET connu de l'annuaire officiel (API gratuite, sans clé) : 'ok', 'inconnu' ou 'ferme'.
  // L'API ne répond pas (6 s, quota, panne) : 'ok', pour ne pas bloquer l'inscription ; l'admin vérifie depuis admin.html.
  // shortcut: contrôle fait dans le navigateur seulement (les règles Firestore ne peuvent pas appeler l'API) ; Cloud Function si de faux SIRET passent.
  function siretExiste(s) {
    var stop = new AbortController();
    setTimeout(function () { stop.abort(); }, 6000);
    return fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + s + '&per_page=5', { signal: stop.signal })
      .then(function (r) { if (!r.ok) throw r.status; return r.json(); })
      .then(function (j) {
        var trouve = null;
        j.results.forEach(function (e) {
          (e.matching_etablissements || []).concat(e.siege || []).forEach(function (x) { if (x.siret === s) trouve = x; });
        });
        return !trouve ? 'inconnu' : trouve.etat_administratif === 'F' ? 'ferme' : 'ok';
      })
      .catch(function (e) { console.warn('Annuaire des entreprises injoignable :', e); return 'ok'; });
  }
  window.siretExiste = siretExiste; // pour les tests

  function montrer(id) { ['chargement', 'hors-ligne', 'espace', 'supprime'].forEach(function (x) { $(x).hidden = x !== id; }); form.hidden = true; }
  function dire(id, msg, champ) { $(id).textContent = msg; $(id).hidden = !msg; if (champ) champ.focus(); }
  function messageAuth(e) {
    var c = e && e.code || '';
    if (c === 'auth/email-already-in-use') return 'Un compte existe déjà avec cet e-mail : connectez-vous (ou « Mot de passe oublié ? »).';
    if (c === 'auth/invalid-email') return "Vérifiez l'e-mail.";
    if (c === 'auth/missing-password') return 'Écrivez votre mot de passe.';
    if (c === 'auth/weak-password') return 'Mot de passe trop faible : 8 caractères au moins.';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'E-mail ou mot de passe incorrect.';
    if (c === 'auth/too-many-requests') return "Trop d'essais : réessayez dans quelques minutes.";
    if (c === 'auth/network-request-failed') return 'Pas de connexion : réessayez dans un instant.';
    if (c === 'permission-denied') return 'Profil refusé : vérifiez les champs, puis réessayez.';
    return "L'opération n'a pas abouti. Réessayez dans un instant.";
  }

  // --- Connexion / inscription
  function bascule(inscription) {
    $('b-connexion').setAttribute('aria-pressed', String(!inscription));
    $('b-inscription').setAttribute('aria-pressed', String(inscription));
    $('connexion').hidden = inscription;
    if (inscription) ouvrirFormulaire('inscription'); else form.hidden = true;
  }
  $('b-connexion').onclick = function () { bascule(false); };
  $('b-inscription').onclick = function () { bascule(true); };

  $('connexion').addEventListener('submit', function (e) {
    e.preventDefault();
    dire('c-erreur', '');
    AOC_FB.effacer($('connexion'));
    if (!$('c-email').value.trim()) return AOC_FB.sous($('c-email'), 'Écrivez votre e-mail.');
    if (!$('c-mdp').value) return dire('c-erreur', 'Écrivez votre mot de passe.', $('c-mdp'));
    f.au.signInWithEmailAndPassword(f.auth, $('c-email').value.trim(), $('c-mdp').value).catch(function (err) { dire('c-erreur', messageAuth(err)); });
  });
  $('oubli').onclick = function () {
    var mail = $('c-email').value.trim();
    AOC_FB.effacer($('connexion'));
    dire('c-erreur', '');
    if (!$('c-email').checkValidity() || !mail) return AOC_FB.sous($('c-email'), 'Écrivez votre e-mail ici, puis cliquez de nouveau sur « Mot de passe oublié ? ».');
    // même réponse que le compte existe ou non (on ne révèle pas qui est inscrit)
    f.au.sendPasswordResetEmail(f.auth, mail).catch(function () {}).then(function () {
      dire('oubli-ok', 'E-mail envoyé si un compte existe pour ' + mail + '. La suite : ouvrez-le, choisissez un nouveau mot de passe, puis connectez-vous ici.');
    });
  };

  // --- Formulaire de profil : « inscription » (identifiants + profil), « completer » (connecté sans profil), « modifier »
  var mode;
  function majType() {
    var ent = form.type.value === 'entreprise';
    $('f-part').hidden = $('f-part').disabled = ent;
    $('f-ent').hidden = $('f-ent').disabled = !ent;
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'type') majType(); });

  function ouvrirFormulaire(m) {
    mode = m;
    $('f-ident').hidden = $('f-ident').disabled = m !== 'inscription';
    $('f-type').hidden = $('f-type').disabled = m === 'modifier';
    $('f-consent').hidden = m === 'modifier';
    $('consentement').disabled = m === 'modifier';
    $('annuler').hidden = m !== 'modifier';
    $('envoyer').textContent = m === 'inscription' ? 'Créer mon compte' : 'Enregistrer';
    if (m === 'modifier') {
      form.type.value = profil.type;
      var ent = profil.type === 'entreprise';
      $(ent ? 'e-nom' : 'p-nom').value = profil.nom;
      if (!ent) $('p-commune').value = profil.commune;
      if (ent) {
        $('siret').value = profil.siret;
        form.querySelectorAll('[name=metiers]').forEach(function (c) { c.checked = profil.metiers.indexOf(c.value) !== -1; });
        form.querySelectorAll('[name=zone]').forEach(function (c) { c.checked = profil.zone.indexOf(c.value) !== -1; });
      }
      $('telephone').value = profil.telephone || '';
      $('espace').hidden = true;
    }
    majType();
    dire('erreur', '');
    form.hidden = false;
  }
  $('annuler').onclick = function () { form.hidden = true; $('espace').hidden = false; };
  $('modifier').onclick = function () { ouvrirFormulaire('modifier'); form.querySelector('fieldset:not([disabled]):not([hidden]) input').focus(); };

  var NOMS = { email: "l'e-mail", mdp: 'le mot de passe (8 caractères au moins)', 'p-nom': 'votre nom', 'p-commune': 'la commune',
    'e-nom': 'la raison sociale', siret: 'le SIRET (14 chiffres)', telephone: 'le téléphone', consentement: "l'accord sur vos informations" };

  function coches(nom) { return Array.prototype.filter.call(form.querySelectorAll('[name=' + nom + ']'), function (c) { return c.checked; }).map(function (c) { return c.value; }); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    dire('erreur', '');
    AOC_FB.effacer(form);
    var v = function (id) { return $(id).value.trim(); };
    var faux = Array.prototype.find.call(form.elements, function (c) { return c.name && c.willValidate && !c.checkValidity(); });
    if (faux) return AOC_FB.sous(faux, faux.name === 'consentement' ? 'Cochez cette case pour créer votre compte.' : 'Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.');
    var type = form.type.value;
    var champs = type === 'entreprise'
      ? { nom: v('e-nom'), siret: v('siret').replace(/\s/g, ''), metiers: coches('metiers'), zone: coches('zone') }
      : { nom: v('p-nom'), commune: v('p-commune') };
    if (type === 'entreprise') {
      if (!siretValide(champs.siret)) return AOC_FB.sous($('siret'), "Ce numéro SIRET n'est pas valide : vérifiez les 14 chiffres (sur un Kbis ou sur annuaire-entreprises.data.gouv.fr).");
      if (!champs.metiers.length) return AOC_FB.sous(form.querySelector('[name=metiers]'), 'Cochez au moins un métier.');
      if (!champs.zone.length) return AOC_FB.sous(form.querySelector('[name=zone]'), "Cochez au moins un département d'intervention.");
    }
    // minlength ne compte pas les espaces retirés par trim()
    var nomId = type === 'entreprise' ? 'e-nom' : 'p-nom';
    if (champs.nom.length < 2) return AOC_FB.sous($(nomId), 'Vérifiez ' + NOMS[nomId] + '.');
    if (type !== 'entreprise' && champs.commune.length < 2) return AOC_FB.sous($('p-commune'), 'Vérifiez la commune.');
    var tel = v('telephone');
    var bouton = $('envoyer');
    bouton.disabled = true;
    var fin = function () { bouton.disabled = false; };

    var verif = type === 'entreprise' && !(mode === 'modifier' && champs.siret === profil.siret) ? siretExiste(champs.siret) : Promise.resolve('ok');
    verif.then(function (etat) {
      if (etat === 'ok') return enregistrer(champs, type, tel, fin);
      fin();
      AOC_FB.sous($('siret'), etat === 'ferme'
        ? "Ce SIRET correspond à un établissement fermé. Indiquez le SIRET de votre établissement en activité."
        : "Ce SIRET est introuvable dans l'annuaire officiel des entreprises : vérifiez les 14 chiffres (sur un Kbis ou sur annuaire-entreprises.data.gouv.fr). S'il est juste, écrivez-nous à maitreagent@gmail.com.");
    });
  });

  function enregistrer(champs, type, tel, fin) {
    var ecrire;
    if (mode === 'modifier') {
      champs.telephone = tel || f.fs.deleteField();
      ecrire = f.fs.updateDoc(f.fs.doc(f.db, 'users', moi.uid), champs);
    } else {
      champs.type = type;
      champs.cree = f.fs.serverTimestamp();
      if (tel) champs.telephone = tel;
      var creer = Promise.resolve(moi);
      if (mode === 'inscription') {
        enCours = true;
        creer = f.au.createUserWithEmailAndPassword(f.auth, $('email').value.trim(), $('mdp').value).then(function (r) {
          return f.au.sendEmailVerification(r.user).catch(function () {}).then(function () { return r.user; });
        });
      }
      // premier profil : le type est figé dans types/{uid}, dans la même écriture (déjà là si le profil avait été supprimé)
      ecrire = creer.then(function (u) {
        moi = u;
        var lot = f.fs.writeBatch(f.db);
        if (!typeFige) lot.set(f.fs.doc(f.db, 'types', u.uid), { type: type });
        lot.set(f.fs.doc(f.db, 'users', u.uid), champs);
        return lot.commit();
      });
    }
    var etait = mode;
    ecrire.then(function () { enCours = false; fin(); return afficher(moi); }).then(function () {
      if (etait === 'modifier') return bravo('Profil enregistré. Il servira à pré-remplir vos prochains formulaires.');
      bravo(moi.emailVerified ? 'Profil enregistré. La suite : ' + suite() + '.'
        : 'Compte créé. La suite : cliquez sur le lien envoyé à ' + moi.email + ' pour vérifier votre e-mail.');
    }, function (err) {
      console.warn('Compte :', err && err.code, err && err.message);
      fin();
      var champ = etait === 'inscription' && (/email/.test(err && err.code) ? $('email') : /password/.test(err && err.code) ? $('mdp') : null);
      // compte Auth créé mais profil refusé : on reste sur le formulaire, à compléter
      if (enCours && moi) { enCours = false; mode = 'completer'; ouvrirFormulaire('completer'); }
      enCours = false;
      if (champ) AOC_FB.sous(champ, messageAuth(err)); else dire('erreur', messageAuth(err));
    });
  }

  // --- Espace connecté
  // confirmation verte en haut de l'espace, qui dit la suite
  function bravo(msg) { dire('ok', msg); $('ok').scrollIntoView({ block: 'nearest' }); }
  function suite() {
    return profil && profil.type === 'entreprise' ? 'répondez aux demandes qui vous intéressent, ou publiez la vôtre' : 'publiez votre demande de travaux, en 3 étapes';
  }
  function afficher(u) {
    moi = u;
    dire('ok', '');
    return f.fs.getDoc(f.fs.doc(f.db, 'users', u.uid)).then(function (s) {
      profil = s.exists() ? s.data() : null;
      if (!profil) {
        montrer('');
        $('raison').textContent = 'Il manque votre profil : complétez-le pour utiliser votre compte (' + u.email + ').';
        $('raison').hidden = false;
        return f.fs.getDoc(f.fs.doc(f.db, 'types', u.uid)).then(function (t) {
          typeFige = t.exists() ? t.data().type : null;
          ouvrirFormulaire('completer');
          if (typeFige) { form.type.value = typeFige; $('f-type').hidden = $('f-type').disabled = true; majType(); }
        });
      }
      var ent = profil.type === 'entreprise';
      // publier : tous les comptes (entreprise : onglet Privé – sociétés) ; répondre : comptes Entreprise
      var bonType = retour.indexOf('interesse') !== 0 || ent;
      if (retour && u.emailVerified && bonType) return location.replace(retour);
      montrer('espace');
      $('raison').hidden = !retour;
      if (retour) $('raison').textContent = bonType
        ? 'Vérifiez votre e-mail, puis vous serez renvoyé vers le formulaire.'
        : 'Répondre à une demande est réservé aux comptes Entreprise de travaux.';
      $('qui').textContent = 'Connecté : ' + u.email;
      $('a-verifier').hidden = u.emailVerified;
      $('mail-verif').textContent = u.email;
      $('verif-pour').textContent = ent ? 'pas encore répondre aux demandes ni en publier' : 'pas encore publier de demande';
      $('r-nom').textContent = profil.nom;
      $('r-details').textContent = ent
        ? 'Entreprise de travaux · SIRET ' + profil.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4') + ' · '
          + profil.metiers.map(function (m) { return METIERS[m] || m; }).join(', ') + ' · intervient en ' + profil.zone.join(' et ')
        : 'Particulier · ' + profil.commune;
      if (profil.telephone) $('r-details').textContent += ' · ' + profil.telephone;
      $('r-action').textContent = ent ? 'Voir les demandes' : 'Publier une demande de travaux';
      $('r-action').href = ent ? 'index.html#onglet=particulier' : 'publier.html';
      $('mes-demandes').hidden = false;
      mesDemandes();
      if (location.hash === '#mes-demandes') $('mes-demandes').scrollIntoView();
    });
  }

  // Envoyée → En vérification → Publiée → Réponses reçues (reponses : nombre transmis par l'admin), et ce qu'il va se passer
  var ETAPES = ['Envoyée', 'En vérification', 'Publiée', 'Réponses reçues'];
  function suivi(d) {
    var n = d.reponses || 0, close = d.delai.toMillis() < Date.now();
    var fin = d.delai.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    var ici = d.statut !== 'validee' ? 1 : n ? 3 : 2;
    var ol = document.createElement('ol');
    ol.className = 'etapes';
    ETAPES.forEach(function (nom, i) {
      var li = document.createElement('li');
      li.textContent = i === 3 && n ? nom + ' (' + n + ')' : nom;
      if (i < ici || (i === ici && i > 1)) li.className = 'fait';
      if (i === ici) li.setAttribute('aria-current', 'step');
      ol.append(li);
    });
    var p = document.createElement('p');
    p.className = 'suite';
    p.textContent = d.statut !== 'validee' ? 'La suite : nous vérifions votre demande, en général sous 48 h, puis elle est publiée.'
      : n ? (n > 1 ? n + ' entreprises ont répondu' : 'Une entreprise a répondu') + ' : nous vous avons transmis leurs coordonnées par e-mail ou par téléphone.'
      : close ? 'Close depuis le ' + fin + " : elle ne reçoit plus de réponses."
      : 'La suite : les entreprises peuvent répondre jusqu\'au ' + fin + '. Nous vous transmettons leurs coordonnées dès qu\'elles répondent.';
    return [ol, p];
  }

  function mesDemandes() {
    var liste = $('liste-mes');
    var q = f.fs.query(f.fs.collection(f.db, 'demandes'), f.fs.where('uid', '==', moi.uid));
    f.fs.getDocs(q).then(function (res) {
      liste.textContent = '';
      var ms = function (s) { return s.data().cree ? s.data().cree.toMillis() : 0; };
      var docs = res.docs.slice().sort(function (a, b) { return ms(b) - ms(a); });
      var neuves = AOC_FB.nouveautes(moi.uid, docs);
      AOC_FB.marquerVus(moi.uid, docs);
      $('nb-mes').textContent = docs.length;
      $('neuf-mes').textContent = neuves.length ? neuves.length + (neuves.length > 1 ? ' nouveautés' : ' nouveauté') : '';
      $('neuf-mes').hidden = !neuves.length;
      if (!docs.length) {
        var p = document.createElement('p');
        p.className = 'vide';
        p.innerHTML = 'Aucune demande pour le moment. <a href="publier.html">Publier une demande</a>';
        return liste.append(p);
      }
      docs.forEach(function (s) {
        var d = s.data();
        var a = document.createElement('article');
        a.className = 'avis avis-admin';
        var corps = document.createElement('div');
        corps.className = 'corps';
        var haut = document.createElement('p');
        haut.className = 'haut';
        if (neuves.indexOf(s.id) !== -1) {
          var nv = document.createElement('span');
          nv.className = 'pastille-neuf';
          nv.textContent = 'Nouveau';
          haut.append(nv);
        }
        var lieu = document.createElement('span');
        lieu.className = 'dep';
        lieu.textContent = d.commune + ' (' + d.departement + ')';
        haut.append(lieu);
        var h = document.createElement('h3');
        h.textContent = d.titre;
        corps.append(haut, h);
        corps.append.apply(corps, suivi(d));
        a.append(corps);
        liste.append(a);
      });
    }, function (e) {
      console.warn('Mes demandes :', e && e.message);
      liste.textContent = 'Vos demandes ne peuvent pas être chargées. Réessayez plus tard.';
    });
  }

  $('renvoyer').onclick = function () {
    f.au.sendEmailVerification(moi).then(function () { bravo('Lien renvoyé à ' + moi.email + '. La suite : cliquez dessus (pensez à regarder dans les indésirables), puis sur « J\'ai cliqué sur le lien ».'); },
      function (e) { dire('verif-info', messageAuth(e)); });
  };
  $('deja-verifie').onclick = function () {
    moi.reload().then(function () {
      if (!moi.emailVerified) return dire('verif-info', "L'e-mail n'est pas encore vérifié : cliquez sur le lien reçu, puis réessayez.");
      return moi.getIdToken(true).then(function () { return afficher(moi); }).then(function () { bravo('E-mail vérifié. La suite : ' + suite() + '.'); });
    }).catch(function (e) { dire('verif-info', messageAuth(e)); });
  };
  $('deconnexion').onclick = AOC_FB.deconnecter;

  $('suppression').addEventListener('submit', function (e) {
    e.preventDefault();
    dire('s-erreur', '');
    if (!$('s-mdp').value) return dire('s-erreur', 'Écrivez votre mot de passe.', $('s-mdp'));
    if (!confirm('Supprimer définitivement votre compte ?')) return;
    var u = moi;
    // Firebase demande une connexion récente pour supprimer un compte : on la refait avec le mot de passe
    f.au.reauthenticateWithCredential(u, f.au.EmailAuthProvider.credential(u.email, $('s-mdp').value))
      .then(function () { return f.fs.deleteDoc(f.fs.doc(f.db, 'users', u.uid)); })
      .then(function () { enCours = true; return f.au.deleteUser(u); })
      .then(function () { montrer('supprime'); $('supprime').focus(); }, function (err) { enCours = false; dire('s-erreur', messageAuth(err)); });
  });

  AOC_FB.ouvrir(true).then(function (r) {
    f = r;
    f.au.onAuthStateChanged(f.auth, function (u) {
      if (enCours) return; // inscription ou suppression en cours : on attend la fin
      if (u) return afficher(u).catch(function (e) { montrer('chargement'); $('chargement').textContent = messageAuth(e); });
      moi = profil = typeFige = null;
      montrer('hors-ligne');
      bascule(location.hash === '#inscription');
    });
  }, function () { $('chargement').textContent = 'Le service de comptes est injoignable : vérifiez votre connexion.'; });
})();
