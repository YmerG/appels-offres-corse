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
      : 'Pour publier une demande de travaux, connectez-vous avec un compte Particulier, ou créez-en un.';
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
    if (!$('c-email').value.trim()) return dire('c-erreur', 'Écrivez votre e-mail.', $('c-email'));
    if (!$('c-mdp').value) return dire('c-erreur', 'Écrivez votre mot de passe.', $('c-mdp'));
    f.au.signInWithEmailAndPassword(f.auth, $('c-email').value.trim(), $('c-mdp').value).catch(function (err) { dire('c-erreur', messageAuth(err)); });
  });
  $('oubli').onclick = function () {
    var mail = $('c-email').value.trim();
    if (!$('c-email').checkValidity() || !mail) return dire('c-erreur', 'Écrivez votre e-mail ci-dessus, puis cliquez de nouveau sur « Mot de passe oublié ? ».', $('c-email'));
    dire('c-erreur', '');
    // même réponse que le compte existe ou non (on ne révèle pas qui est inscrit)
    f.au.sendPasswordResetEmail(f.auth, mail).catch(function () {}).then(function () {
      dire('oubli-ok', 'Si un compte existe pour ' + mail + ', un e-mail pour choisir un nouveau mot de passe vient de lui être envoyé.');
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
    var v = function (id) { return $(id).value.trim(); };
    var faux = Array.prototype.find.call(form.elements, function (c) { return c.name && c.willValidate && !c.checkValidity(); });
    if (faux) return dire('erreur', 'Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.', faux);
    var type = form.type.value;
    var champs = type === 'entreprise'
      ? { nom: v('e-nom'), siret: v('siret').replace(/\s/g, ''), metiers: coches('metiers'), zone: coches('zone') }
      : { nom: v('p-nom'), commune: v('p-commune') };
    if (type === 'entreprise') {
      if (!siretValide(champs.siret)) return dire('erreur', "Ce numéro SIRET n'est pas valide : vérifiez les 14 chiffres (sur un Kbis ou sur annuaire-entreprises.data.gouv.fr).", $('siret'));
      if (!champs.metiers.length) return dire('erreur', 'Cochez au moins un métier.', form.querySelector('[name=metiers]'));
      if (!champs.zone.length) return dire('erreur', "Cochez au moins un département d'intervention.", form.querySelector('[name=zone]'));
    }
    // minlength ne compte pas les espaces retirés par trim()
    if (champs.nom.length < 2) return dire('erreur', 'Vérifiez ' + NOMS[type === 'entreprise' ? 'e-nom' : 'p-nom'] + '.', $(type === 'entreprise' ? 'e-nom' : 'p-nom'));
    if (type !== 'entreprise' && champs.commune.length < 2) return dire('erreur', 'Vérifiez la commune.', $('p-commune'));
    var tel = v('telephone');
    var bouton = $('envoyer');
    bouton.disabled = true;

    var fin = function () { bouton.disabled = false; };
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
        creer = f.au.createUserWithEmailAndPassword(f.auth, v('email'), $('mdp').value).then(function (r) {
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
    ecrire.then(function () { enCours = false; fin(); return afficher(moi); }, function (err) {
      console.warn('Compte :', err && err.code, err && err.message);
      fin();
      // compte Auth créé mais profil refusé : on reste sur le formulaire, à compléter
      if (enCours && moi) { enCours = false; mode = 'completer'; ouvrirFormulaire('completer'); }
      enCours = false;
      dire('erreur', messageAuth(err));
    });
  });

  // --- Espace connecté
  function afficher(u) {
    moi = u;
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
      if (retour && u.emailVerified && (ent === (retour.indexOf('interesse') === 0))) return location.replace(retour);
      montrer('espace');
      $('raison').hidden = !retour;
      if (retour) $('raison').textContent = (ent === (retour.indexOf('interesse') === 0))
        ? 'Vérifiez votre e-mail, puis vous serez renvoyé vers le formulaire.'
        : (ent ? 'Publier une demande est réservé aux comptes Particulier.' : 'Répondre à une demande est réservé aux comptes Entreprise de travaux.');
      $('qui').textContent = 'Connecté : ' + u.email;
      $('a-verifier').hidden = u.emailVerified;
      $('mail-verif').textContent = u.email;
      $('verif-pour').textContent = ent ? 'pas encore répondre aux demandes' : 'pas encore publier de demande';
      $('r-nom').textContent = profil.nom;
      $('r-details').textContent = ent
        ? 'Entreprise de travaux · SIRET ' + profil.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4') + ' · '
          + profil.metiers.map(function (m) { return METIERS[m] || m; }).join(', ') + ' · intervient en ' + profil.zone.join(' et ')
        : 'Particulier · ' + profil.commune;
      if (profil.telephone) $('r-details').textContent += ' · ' + profil.telephone;
      $('r-action').textContent = ent ? 'Voir les demandes' : 'Publier une demande de travaux';
      $('r-action').href = ent ? 'index.html#onglet=particulier' : 'publier.html';
      $('mes-demandes').hidden = ent;
      if (!ent) mesDemandes();
      if (location.hash === '#mes-demandes' && !ent) $('mes-demandes').scrollIntoView();
    });
  }

  function mesDemandes() {
    var liste = $('liste-mes');
    var q = f.fs.query(f.fs.collection(f.db, 'demandes'), f.fs.where('uid', '==', moi.uid));
    f.fs.getDocs(q).then(function (res) {
      liste.textContent = '';
      var docs = res.docs.map(function (d) { return d.data(); });
      docs.sort(function (a, b) { return (b.cree ? b.cree.toMillis() : 0) - (a.cree ? a.cree.toMillis() : 0); });
      $('nb-mes').textContent = docs.length;
      if (!docs.length) {
        var p = document.createElement('p');
        p.className = 'vide';
        p.innerHTML = 'Aucune demande pour le moment. <a href="publier.html">Publier une demande</a>';
        return liste.append(p);
      }
      docs.forEach(function (d) {
        var a = document.createElement('article');
        a.className = 'avis avis-admin';
        var corps = document.createElement('div');
        corps.className = 'corps';
        var haut = document.createElement('p');
        haut.className = 'haut';
        var close = d.delai.toMillis() < Date.now();
        var st = document.createElement('span');
        st.className = 'dep' + (d.statut === 'validee' && !close ? ' publiee' : '');
        st.textContent = close ? 'Close' : d.statut === 'validee' ? 'Publiée' : 'En attente de vérification';
        var lieu = document.createElement('span');
        lieu.className = 'dep';
        lieu.textContent = d.commune + ' (' + d.departement + ')';
        haut.append(st, lieu);
        var h = document.createElement('h3');
        h.textContent = d.titre;
        var lim = document.createElement('p');
        lim.className = 'limite';
        lim.textContent = 'Réponses avant le ' + d.delai.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        corps.append(haut, h, lim);
        a.append(corps);
        liste.append(a);
      });
    }, function (e) {
      console.warn('Mes demandes :', e && e.message);
      liste.textContent = 'Vos demandes ne peuvent pas être chargées. Réessayez plus tard.';
    });
  }

  $('renvoyer').onclick = function () {
    f.au.sendEmailVerification(moi).then(function () { dire('verif-info', 'Lien renvoyé à ' + moi.email + '. Pensez à regarder dans les indésirables.'); },
      function (e) { dire('verif-info', messageAuth(e)); });
  };
  $('deja-verifie').onclick = function () {
    moi.reload().then(function () {
      if (!moi.emailVerified) return dire('verif-info', "L'e-mail n'est pas encore vérifié : cliquez sur le lien reçu, puis réessayez.");
      return moi.getIdToken(true).then(function () { return afficher(moi); });
    }).catch(function (e) { dire('verif-info', messageAuth(e)); });
  };
  $('deconnexion').onclick = function () { f.au.signOut(f.auth); };

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
