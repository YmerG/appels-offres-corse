// Comptes : inscription (particulier ou entreprise de travaux), connexion, mot de passe oublié, e-mail de vérification,
// profil users/{uid} (privé : son titulaire et l'admin seulement), « Mes demandes », suppression du compte.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form');
  var METIERS = {};
  form.querySelectorAll('[name=metiers]').forEach(function (c) { METIERS[c.value] = c.parentNode.textContent.trim(); });
  var f, moi, profil, typeFige = null, enCours = false;

  // retour après connexion vers la page qui l'a demandée (seulement nos formulaires)
  var retour = new URLSearchParams(location.search).get('retour') || '';
  if (!/^(publier|interesse|partenaire|acheteurs|devis)\.html(\?(d|type|a)=[A-Za-z0-9_-]{1,64})?$|^discussion\.html\?id=[A-Za-z0-9_-]{1,200}$/.test(retour)) retour = '';
  var pourEntreprise = /^(interesse|partenaire|devis)/.test(retour);
  if (retour) {
    $('raison').textContent = pourEntreprise
      ? (retour.indexOf('partenaire') === 0 ? 'Pour chercher un partenaire' : retour.indexOf('devis') === 0 ? 'Pour créer un devis' : 'Pour répondre à une demande') + ', connectez-vous avec un compte Entreprise de travaux, ou créez-en un.'
      : retour === 'acheteurs.html' ? "Pour publier un avis de marché, connectez-vous ou créez un compte (le type « Particulier » convient : il sert seulement à vous connecter)."
      : 'Pour publier une demande de travaux, connectez-vous ou créez un compte (Particulier, ou Entreprise de travaux pour une demande de société).';
    $('raison').hidden = false;
    if (pourEntreprise) form.type.value = 'entreprise';
  }
  // lien « Ne plus recevoir ces alertes » des e-mails (outils/envoyer_emails.py) : décoché et enregistré après connexion
  var stopAlertes = new URLSearchParams(location.search).get('alertes') === 'non';
  if (stopAlertes && !retour) {
    $('raison').textContent = 'Pour ne plus recevoir les alertes par e-mail, connectez-vous : elles seront arrêtées tout de suite.';
    $('raison').hidden = false;
  }

  // SIRET : 14 chiffres et clé de Luhn (La Poste, SIREN 356000000 : somme des chiffres multiple de 5)
  function siretValide(s) {
    if (!/^\d{14}$/.test(s)) return false;
    var luhn = 0, chiffres = 0;
    for (var i = 0; i < 14; i++) { var d = +s[13 - i] * (i % 2 ? 2 : 1); luhn += d > 9 ? d - 9 : d; chiffres += +s[13 - i]; }
    return luhn % 10 === 0 || (s.slice(0, 9) === '356000000' && chiffres % 5 === 0);
  }
  window.siretValide = siretValide; // pour les tests

  // SIRET dans l'annuaire officiel (API gratuite, sans clé) : { etat: 'ok' | 'inconnu' | 'ferme', nom, adresse, dep }.
  // L'API ne répond pas (6 s, quota, panne) : 'ok' sans nom, pour ne pas bloquer l'inscription ; l'admin vérifie depuis admin.html.
  // shortcut: contrôle fait dans le navigateur seulement (les règles Firestore ne peuvent pas appeler l'API) ; Cloud Function si de faux SIRET passent.
  var annuaireVu = {}; // une seule requête par SIRET (saisie puis envoi)
  function annuaire(s) {
    if (annuaireVu[s]) return annuaireVu[s];
    var stop = new AbortController();
    setTimeout(function () { stop.abort(); }, 6000);
    return annuaireVu[s] = fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + s + '&per_page=5', { signal: stop.signal })
      .then(function (r) { if (!r.ok) throw r.status; return r.json(); })
      .then(function (j) {
        var trouve = null, ent = null;
        j.results.forEach(function (e) {
          (e.matching_etablissements || []).concat(e.siege || []).forEach(function (x) { if (x.siret === s) { trouve = x; ent = e; } });
        });
        if (!trouve) return { etat: 'inconnu' };
        return { etat: trouve.etat_administratif === 'F' ? 'ferme' : 'ok', nom: (ent.nom_raison_sociale || ent.nom_complet || '').slice(0, 80),
          adresse: trouve.adresse || '', dep: trouve.departement || depPostal(trouve.code_postal) };
      })
      .catch(function (e) { console.warn('Annuaire des entreprises injoignable :', e); delete annuaireVu[s]; return { etat: 'ok' }; });
  }
  // établissement secondaire : l'annuaire ne donne que le code postal (200xx-201xx Corse-du-Sud, 202xx-206xx Haute-Corse)
  function depPostal(cp) { return /^20[01]/.test(cp) ? '2A' : /^20[2-6]/.test(cp) ? '2B' : ''; }
  function siretExiste(s) { return annuaire(s).then(function (r) { return r.etat; }); }
  window.siretExiste = siretExiste; // pour les tests
  function siretRefuse(etat) {
    AOC_FB.sous($('siret'), etat === 'ferme'
      ? "Ce SIRET correspond à un établissement fermé. Indiquez le SIRET de votre établissement en activité."
      : "Ce SIRET est introuvable dans l'annuaire officiel des entreprises : vérifiez les 14 chiffres (sur un Kbis ou sur annuaire-entreprises.data.gouv.fr). S'il est juste, écrivez-nous à maitreagent@gmail.com.");
  }

  // SIRET complet : raison sociale et département pré-remplis depuis l'annuaire (l'adresse est seulement affichée, pas enregistrée)
  var SIRET_FAUX = "Ce numéro SIRET n'est pas valide : vérifiez les 14 chiffres (sur un Kbis ou sur annuaire-entreprises.data.gouv.fr).";
  var nomAnnuaire = '', zoneAnnuaire = null;
  $('siret').addEventListener('input', function () {
    var s = this.value.replace(/\s/g, '');
    dire('siret-ok', '');
    AOC_FB.sous(this, '');
    // nom et département remplis pour un SIRET précédent : on les retire
    if (nomAnnuaire && $('e-nom').value === nomAnnuaire) $('e-nom').value = nomAnnuaire = '';
    if (zoneAnnuaire && coches('zone').length === 1) zoneAnnuaire.checked = false;
    zoneAnnuaire = null;
    if (!siretValide(s)) {
      if (/^\d{14}$/.test(s)) AOC_FB.sous(this, SIRET_FAUX); // 14 chiffres mais clé de contrôle fausse
      return;
    }
    annuaire(s).then(function (r) {
      if ($('siret').value.replace(/\s/g, '') !== s) return; // le SIRET a changé entre-temps
      if (r.etat !== 'ok') return siretRefuse(r.etat);
      if (!r.nom) return;
      var nom = $('e-nom');
      if (!nom.value.trim()) nom.value = nomAnnuaire = r.nom;
      if (!coches('zone').length && /^2[AB]$/.test(r.dep)) (zoneAnnuaire = form.querySelector('[name=zone][value="' + r.dep + '"]')).checked = true;
      dire('siret-ok', 'Entreprise trouvée : ' + r.nom + (r.adresse ? ', ' + r.adresse : '') + '. La suite : vérifiez la raison sociale, puis cochez vos métiers.');
      $('siret-ok').scrollIntoView({ block: 'nearest' }); // sinon caché sous le bouton du bas, au téléphone
    });
  });

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
  $('p-commune').addEventListener('change', function () { var c = AOC_COMMUNE(this.value); if (c) this.value = c[0]; });

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
        var dec = profil.decennale || {};
        $('d-assureur').value = dec.assureur || '';
        $('d-fin').value = dec.fin || '';
        $('d-contrat').value = dec.contrat || '';
      }
      $('telephone').value = profil.telephone || '';
      $('espace').hidden = true;
    }
    majType();
    dire('erreur', '');
    form.hidden = false;
  }
  // « Annuler » rend le focus au bouton qui a ouvert le formulaire (rapport 36)
  var ouvreur = null;
  $('annuler').onclick = function () { form.hidden = true; $('espace').hidden = false; if (ouvreur) ouvreur.focus(); };
  $('modifier').onclick = function () { ouvreur = this; ouvrirFormulaire('modifier'); form.querySelector('fieldset:not([disabled]):not([hidden]) input').focus(); };
  $('r-decennale-maj').onclick = function () { ouvreur = this; ouvrirFormulaire('modifier'); $('d-assureur').focus(); };

  var NOMS = { email: "l'e-mail", mdp: 'le mot de passe (8 caractères au moins)', 'p-nom': 'votre nom', 'p-commune': 'la commune',
    'e-nom': 'la raison sociale', siret: 'le SIRET (14 chiffres)', telephone: 'le téléphone', consentement: "l'accord sur vos informations",
    'd-assureur': "l'assureur", 'd-fin': 'la date de fin de validité', 'd-contrat': 'le n° de contrat' };

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
      if (!siretValide(champs.siret)) return AOC_FB.sous($('siret'), SIRET_FAUX);
      if (!champs.metiers.length) return AOC_FB.sous(form.querySelector('[name=metiers]'), 'Cochez au moins un métier.');
      if (!champs.zone.length) return AOC_FB.sous(form.querySelector('[name=zone]'), "Cochez au moins un département d'intervention.");
      // décennale : rien, ou l'assureur et la date de fin (le n° de contrat reste facultatif)
      var dec = { assureur: v('d-assureur'), fin: v('d-fin'), contrat: v('d-contrat') };
      if (dec.assureur || dec.fin || dec.contrat) {
        if (dec.assureur.length < 2) return AOC_FB.sous($('d-assureur'), "Indiquez l'assureur (ou videz les champs de la décennale).");
        if (!dec.fin) return AOC_FB.sous($('d-fin'), 'Indiquez la date de fin de validité.');
        if (!dec.contrat) delete dec.contrat;
        champs.decennale = dec;
      } else if (mode === 'modifier') champs.decennale = f.fs.deleteField();
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
      siretRefuse(etat);
    });
  });

  function enregistrer(champs, type, tel, fin) {
    var ecrire;
    if (mode === 'modifier') {
      champs.telephone = tel || f.fs.deleteField();
      // fiche publique : recopiée si le nom, le SIRET, les métiers ou la zone changent (elle repasse alors en relecture)
      // shortcut: si cette 2e écriture échoue, la fiche garde les anciennes valeurs jusqu'au prochain « Enregistrer ma fiche »
      var autre = fiche && ['nom', 'siret', 'metiers', 'zone'].some(function (k) { return String(fiche[k]) !== String(champs[k]); });
      ecrire = f.fs.updateDoc(f.fs.doc(f.db, 'users', moi.uid), champs).then(function () {
        if (autre) return ecrireFiche(champs, fiche.presentation).catch(function (e) { console.warn('Fiche non recopiée :', e && e.code); });
      });
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
      // bouton « Mes métiers » de l'accueil (app.js) : métiers et zone seulement, dans ce navigateur ; effacé à la déconnexion
      try {
        if (ent) localStorage.setItem('aoc-mes-metiers', JSON.stringify({ metiers: profil.metiers, zone: profil.zone }));
        else localStorage.removeItem('aoc-mes-metiers');
      } catch (e) { /* navigation privée : pas de raccourci */ }
      // publier : tous les comptes (entreprise : onglet Privé – sociétés) ; répondre, chercher un partenaire : comptes Entreprise
      var bonType = !pourEntreprise || ent;
      if (retour && u.emailVerified && bonType) return location.replace(retour);
      montrer('espace');
      $('raison').hidden = !retour;
      if (retour) $('raison').textContent = bonType
        ? 'Vérifiez votre e-mail, puis vous serez renvoyé vers le formulaire.'
        : (retour.indexOf('partenaire') === 0 ? 'Chercher un partenaire' : retour.indexOf('devis') === 0 ? 'Créer un devis' : 'Répondre à une demande') + ' est réservé aux comptes Entreprise de travaux.';
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
      if (ent && profil.decennale) $('r-details').textContent += ' · Décennale : ' + profil.decennale.assureur + ', jusqu\'au ' +
        new Date(profil.decennale.fin + 'T12:00').toLocaleDateString('fr-FR');
      // décennale absente, expirée ou proche de l'échéance : bandeau avec son bouton (INTERFACE.md n° 4)
      var jours = ent && profil.decennale ? Math.floor((new Date(profil.decennale.fin + 'T23:59') - Date.now()) / 864e5) : 30;
      var sansDec = ent && !profil.decennale;
      $('r-decennale').hidden = !sansDec && jours >= 30;
      if (sansDec) $('r-decennale').firstChild.innerHTML = '<strong>Assurance décennale non renseignée.</strong> ' +
        'C’est le premier critère de confiance des particuliers : déclarée, elle est transmise au demandeur avec vos coordonnées.';
      else if (jours < 30) $('r-decennale').firstChild.innerHTML = '<strong>Votre assurance décennale ' +
        (jours < 0 ? 'a expiré' : 'expire') + ' le ' + new Date(profil.decennale.fin + 'T12:00').toLocaleDateString('fr-FR') +
        (jours < 0 ? '.</strong> Le demandeur verra qu’elle est expirée.' : '</strong> (' + (jours ? 'dans ' + jours + ' jour' + (jours > 1 ? 's' : '') : 'aujourd’hui') + ').');
      $('r-decennale-maj').textContent = sansDec ? 'Ajouter ma décennale' : 'Mettre à jour ma décennale';
      // entreprise : d'abord ses appels d'offres (bouton « Mes métiers » de l'accueil), puis les demandes de particuliers
      $('r-action').textContent = ent ? 'Mes appels d’offres' : 'Publier une demande de travaux';
      $('r-action').href = ent ? 'index.html#mes=1' : 'publier.html';
      $('r-demandes').hidden = !ent;
      $('mes-demandes').hidden = $('discussions').hidden = false;
      mesDemandes();
      mesDiscussions(ent);
      mesDevis(ent);
      AOC_FB.boutonNotifs($('notifs'));
      $('alertes').hidden = $('fiche').hidden = !ent;
      if (ent) maFiche();
      if (ent) {
        $('alertes-case').checked = profil.alertes === true;
        $('alertes-mail').textContent = u.email;
        dire('alertes-ok', '');
        dire('alertes-erreur', '');
        if (stopAlertes) {
          stopAlertes = false;
          history.replaceState(null, '', location.pathname + location.hash); // un rechargement ne redécoche pas
          $('alertes-case').checked = false;
          ecrireAlertes(false);
        }
      }
      if (location.hash === '#mes-demandes' || location.hash === '#discussions' || (ent && location.hash === '#alertes')) $(location.hash.slice(1)).scrollIntoView();
      if (location.hash === '#devis') { $('devis').hidden = false; $('devis').scrollIntoView(); } // lien de l'e-mail « Devis reçu »
    });
  }

  // alertes par métier : users/{uid}.alertes, lu par outils/envoyer_emails.py ; enregistré dès qu'on coche ou décoche
  function ecrireAlertes(oui) {
    var c = $('alertes-case');
    c.disabled = true;
    dire('alertes-ok', '');
    dire('alertes-erreur', '');
    f.fs.updateDoc(f.fs.doc(f.db, 'users', moi.uid), { alertes: oui }).then(function () {
      profil.alertes = oui;
      dire('alertes-ok', oui ? "C'est noté : vous recevrez par e-mail les nouvelles demandes de vos métiers en " + profil.zone.join(' et ') + ', à ' + moi.email + '.'
        : "C'est noté : vous ne recevrez plus ces alertes. Vous pouvez les réactiver ici quand vous voulez.");
    }, function (e) {
      console.warn('Alertes :', e && e.code);
      c.checked = profil.alertes === true;
      dire('alertes-erreur', "Le choix n'a pas été enregistré. Réessayez dans un instant.");
    }).then(function () { c.disabled = false; });
  }
  $('alertes-case').onchange = function () { ecrireAlertes(this.checked); };

  // fiche publique (fiches/{uid}) : nom, SIRET, métiers et zone copiés du profil (les règles le vérifient) + présentation ;
  // chaque écriture la remet en attente de relecture par l'admin
  var fiche = null;
  function ecrireFiche(p, texte) {
    return f.fs.setDoc(f.fs.doc(f.db, 'fiches', moi.uid), { nom: p.nom, siret: p.siret, metiers: p.metiers, zone: p.zone,
      presentation: texte, statut: 'en_attente', maj: f.fs.serverTimestamp() });
  }
  function maFiche() {
    return f.fs.getDoc(f.fs.doc(f.db, 'fiches', moi.uid)).then(function (s) {
      fiche = s.exists() ? s.data() : null;
      $('fiche-texte').value = fiche ? fiche.presentation : '';
      $('fiche-retirer').hidden = !fiche;
      $('fiche-envoyer').textContent = fiche ? 'Enregistrer ma fiche' : 'Envoyer ma fiche';
      var etat = $('fiche-etat');
      etat.hidden = !fiche;
      if (!fiche) return;
      if (fiche.statut !== 'validee') return etat.textContent = 'Fiche envoyée : nous la relisons, en général sous 48 h. Elle n\'est pas encore visible.';
      etat.textContent = 'Votre fiche est en ligne. ';
      var a = document.createElement('a');
      a.href = 'entreprise.html?id=' + encodeURIComponent(moi.uid);
      a.textContent = 'Voir ma fiche';
      etat.append(a);
    }, function (e) { console.warn('Fiche :', e && e.code); });
  }
  $('fiche-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('fiche-texte'), texte = t.value.trim();
    dire('fiche-erreur', '');
    AOC_FB.sous(t, '');
    if (texte.length < 20) return AOC_FB.sous(t, 'Écrivez au moins 20 caractères (' + texte.length + ' pour le moment).');
    if (!moi.emailVerified) return dire('fiche-erreur', "Vérifiez d'abord votre e-mail (lien envoyé à " + moi.email + ').');
    $('fiche-envoyer').disabled = true;
    ecrireFiche(profil, texte).then(maFiche).then(function () {
      $('fiche-etat').scrollIntoView({ block: 'nearest' });
    }, function (err) {
      console.warn('Fiche :', err && err.code);
      dire('fiche-erreur', "La fiche n'a pas été enregistrée. Réessayez dans un instant.");
    }).then(function () { $('fiche-envoyer').disabled = false; });
  });
  $('fiche-retirer').onclick = function () {
    if (!confirm('Retirer votre fiche publique ? Le lien ne marchera plus.')) return;
    f.fs.deleteDoc(f.fs.doc(f.db, 'fiches', moi.uid)).then(maFiche).then(function () {
      dire('fiche-etat', 'Votre fiche est retirée.');
      $('fiche-texte').focus();
    }, function () { dire('fiche-erreur', "La fiche n'a pas été retirée. Réessayez dans un instant."); });
  };

  // Envoyée → Publiée (dès l'envoi, sauf si l'admin l'a retirée) → Réponses reçues (reponses : nombre transmis par l'admin), et ce qu'il va se passer
  // avis d'acheteur public (lot 19) : Envoyé → Publié (après validation par l'admin) ; on y répond sur sa plateforme, pas ici
  var ETAPES = ['Envoyée', 'Publiée', 'Réponses reçues'];
  function suivi(d) {
    var pub = d.type === 'public';
    var n = d.reponses || 0, close = d.delai.toMillis() < Date.now();
    var fin = d.delai.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    var ici = d.statut !== 'validee' ? 0 : n ? 2 : 1;
    var ol = document.createElement('ol');
    ol.className = 'etapes';
    (pub ? ['Envoyé', 'Publié'] : ETAPES).forEach(function (nom, i) {
      var li = document.createElement('li');
      li.textContent = i === 2 && n ? nom + ' (' + n + ')' : nom;
      if (i <= ici) li.className = 'fait';
      if (i === ici) li.setAttribute('aria-current', 'step');
      ol.append(li);
    });
    var p = document.createElement('p');
    p.className = 'suite';
    p.textContent = pub ? (d.statut !== 'validee' ? "Votre avis attend notre validation (en général sous 48 h) : il n'est pas encore visible. Nous vous écrivons si quelque chose doit être corrigé."
        : d.pourvue ? "Vous avez retiré votre avis du site : il n'est plus affiché."
        : close ? 'Clos depuis le ' + fin + " : il n'est plus affiché."
        : "Votre avis est dans l'onglet Public jusqu'au " + fin + ". Les entreprises répondent sur votre plateforme, par le lien officiel.")
      : d.statut !== 'validee' ? 'Votre demande a été retirée du site : elle n\'est plus visible. Nous vous écrivons si quelque chose doit être corrigé.'
      : d.pourvue ? "Vous avez indiqué que votre demande est pourvue : elle n'est plus affichée et ne reçoit plus de réponses."
      : n ? (n > 1 ? n + ' entreprises ont répondu : nous vous avons transmis leurs' : 'Une entreprise a répondu : nous vous avons transmis ses') + ' coordonnées. Les messages des entreprises arrivent dans « Mes discussions », plus haut sur cette page : vous pouvez leur répondre.'
      : close ? 'Close depuis le ' + fin + " : elle ne reçoit plus de réponses."
      : (d.nbInterets || 0) >= 5 ? '5 entreprises ont répondu, le maximum : la demande n\'est plus affichée. Nous vous transmettons leurs coordonnées.'
      : 'La suite : les entreprises peuvent répondre jusqu\'au ' + fin + ' (5 au plus). Les messages des entreprises arrivent dans « Mes discussions », plus haut sur cette page : vous pouvez leur répondre.';
    return [ol, p];
  }

  function mesDemandes() {
    var liste = $('liste-mes');
    var q = f.fs.query(f.fs.collection(f.db, 'demandes'), f.fs.where('uid', '==', moi.uid));
    return f.fs.getDocs(q).then(function (res) {
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
        a.dataset.id = s.id;
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
        // « Ma demande est pourvue » : elle disparaît de la liste publique et ne reçoit plus de réponses (réversible)
        if (d.statut === 'validee' && d.delai.toMillis() > Date.now()) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'bouton-sortir';
          b.textContent = d.type === 'public' ? (d.pourvue ? 'Remettre mon avis en ligne' : 'Retirer mon avis du site')
            : d.pourvue ? 'Rouvrir ma demande' : 'Ma demande est pourvue';
          var err = document.createElement('p');
          err.className = 'erreur';
          err.hidden = true;
          b.onclick = function () {
            b.disabled = true;
            // liste redessinée : le focus revient sur le bouton de la même demande (clavier, lecteur d'écran)
            f.fs.updateDoc(s.ref, { pourvue: !d.pourvue }).then(mesDemandes).then(function () {
              var nb = liste.querySelector('[data-id="' + s.id + '"] .bouton-sortir');
              if (nb) nb.focus();
            }, function (e) {
              console.warn('Pourvue :', e && e.code);
              b.disabled = false;
              err.textContent = "Le changement n'a pas été enregistré. Réessayez dans un instant.";
              err.hidden = false;
            });
          };
          corps.append(b, err);
        }
        a.append(corps);
        liste.append(a);
      });
    }, function (e) {
      console.warn('Mes demandes :', e && e.message);
      liste.textContent = 'Vos demandes ne peuvent pas être chargées. Réessayez plus tard.';
    });
  }

  // discussions (lot 18.6) : comme demandeur avec les entreprises qui ont répondu, ou comme entreprise ; les plus récentes d'abord
  function mesDiscussions(ent) {
    var liste = $('liste-disc');
    return AOC_FB.discussions(f, moi.uid).then(function (docs) {
      liste.textContent = '';
      var ms = function (s) { return s.data().maj ? s.data().maj.toMillis() : 0; };
      docs.sort(function (a, b) { return ms(b) - ms(a); });
      var neuves = docs.filter(function (s) { return AOC_FB.nonLue(s.data(), moi.uid); }).length;
      AOC_FB.badge(neuves);
      $('nb-disc').textContent = docs.length;
      $('neuf-disc').textContent = neuves ? neuves + (neuves > 1 ? ' non lues' : ' non lue') : '';
      $('neuf-disc').hidden = !neuves;
      if (!docs.length) {
        var vide = document.createElement('p');
        vide.className = 'vide';
        vide.textContent = ent ? 'Aucune discussion pour le moment. Elle s’ouvre quand vous répondez à une demande (« Je suis intéressé »).'
          : 'Aucune discussion pour le moment. Elle s’ouvre quand une entreprise répond à une de vos demandes.';
        return liste.append(vide);
      }
      docs.forEach(function (s) {
        var d = s.data(), a = document.createElement('article'), corps = document.createElement('div'), haut = document.createElement('p');
        a.className = 'avis avis-admin';
        corps.className = 'corps';
        haut.className = 'haut';
        if (AOC_FB.nonLue(d, moi.uid)) {
          var nv = document.createElement('span');
          nv.className = 'pastille-neuf';
          nv.textContent = 'Nouveau message';
          haut.append(nv);
        }
        var qui = document.createElement('span');
        qui.className = 'dep';
        qui.textContent = moi.uid === d.particulier ? d.nomEntreprise : 'Demandeur';
        haut.append(qui);
        if (!d.ouverte) {
          var fermee = document.createElement('span');
          fermee.className = 'dep';
          fermee.textContent = 'Fermée';
          haut.append(fermee);
        }
        var h = document.createElement('h3'), lien = document.createElement('a');
        lien.href = 'discussion.html?id=' + encodeURIComponent(s.id);
        lien.textContent = d.titre;
        h.append(lien);
        var p = document.createElement('p');
        p.className = 'suite';
        p.textContent = 'Dernier message le ' + (d.maj ? d.maj.toDate().toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '–')
          + (d.dernier === moi.uid ? ' (par vous)' : '');
        var ouvrir = document.createElement('a');
        ouvrir.className = 'bouton-sortir';
        ouvrir.href = lien.href;
        ouvrir.textContent = d.ouverte ? 'Lire et répondre' : 'Relire';
        ouvrir.setAttribute('aria-label', ouvrir.textContent + ' : ' + d.titre);
        corps.append(haut, h, p, ouvrir);
        a.append(corps);
        liste.append(a);
      });
    });
  }

  // devis (lot 20) : envoyés (entreprise) et reçus (auteur d'une demande ou d'un avis), lus dans devis/ ; PDF refait ici (devis-pdf.js),
  // jsPDF (420 Ko) chargé seulement au premier téléchargement
  function jspdf() {
    return window.jspdf ? Promise.resolve() : new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'lib/jspdf.umd.min.js';
      s.onload = ok;
      s.onerror = ko;
      document.head.append(s);
    });
  }
  function mesDevis(ent) {
    var liste = $('liste-devis');
    var q = function (champ) {
      return f.fs.getDocs(f.fs.query(f.fs.collection(f.db, 'devis'), f.fs.where(champ, '==', moi.uid))).then(function (r) { return r.docs; }, function () { return []; });
    };
    $('devis-aide').textContent = ent ? 'Créez un devis depuis une carte de l’accueil (bouton « Devis »). Il s’envoie directement pour les demandes auxquelles vous avez répondu, et pour les avis d’acheteurs qui acceptent les devis par le site.'
      : 'Les devis que les entreprises vous envoient par le site arrivent ici, et par e-mail avec le PDF.';
    return Promise.all([q('entreprise'), q('destinataire')]).then(function (r) {
      var docs = r[0].concat(r[1]).sort(function (a, b) { return (b.data().cree ? b.data().cree.toMillis() : 0) - (a.data().cree ? a.data().cree.toMillis() : 0); });
      liste.textContent = '';
      $('nb-devis').textContent = docs.length;
      $('devis').hidden = !ent && !docs.length; // particulier sans devis : rien à montrer
      docs.forEach(function (s) {
        var d = s.data(), envoye = d.entreprise === moi.uid, date = d.cree ? d.cree.toDate() : new Date();
        var a = document.createElement('article'), corps = document.createElement('div'), haut = document.createElement('p');
        a.className = 'avis avis-admin';
        corps.className = 'corps';
        haut.className = 'haut';
        var etat = document.createElement('span');
        etat.className = envoye ? 'dep' : 'pastille-neuf';
        etat.textContent = envoye ? 'Devis envoyé' : 'Devis reçu';
        var qui = document.createElement('span');
        qui.className = 'dep';
        qui.textContent = envoye ? d.client.nom : d.emetteur.nom;
        haut.append(etat, qui);
        var h = document.createElement('h3');
        h.textContent = d.titre;
        var p = document.createElement('p');
        p.className = 'suite';
        p.textContent = 'N° ' + AOC_DEVIS.numero(date, s.id) + ' du ' + date.toLocaleDateString('fr-FR') + ' · ' +
          AOC_DEVIS.euros(AOC_DEVIS.totaux(d.lignes, d.emetteur.franchise).ttc) + ' TTC' + (envoye ? ' · le destinataire le reçoit aussi par e-mail' : '');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'bouton-sortir';
        b.textContent = 'Télécharger le PDF';
        b.setAttribute('aria-label', 'Télécharger le PDF du devis : ' + d.titre);
        b.onclick = function () {
          jspdf().then(function () {
            AOC_DEVIS.telecharger(Object.assign({}, d, { id: s.id, date: date, logo: d.logo ? d.logo.toUint8Array() : null }));
          }, function () { b.textContent = 'PDF indisponible : réessayez'; });
        };
        corps.append(haut, h, p, b);
        a.append(corps);
        liste.append(a);
      });
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
      .then(function () {
        var lot = f.fs.writeBatch(f.db); // la fiche publique et l'en-tête des devis partent avec le profil
        lot.delete(f.fs.doc(f.db, 'fiches', u.uid));
        lot.delete(f.fs.doc(f.db, 'entetes', u.uid));
        lot.delete(f.fs.doc(f.db, 'users', u.uid));
        return lot.commit();
      })
      .then(function () { enCours = true; return f.au.deleteUser(u); })
      .then(function () {
        try { localStorage.removeItem('aoc-mes-metiers'); } catch (e) { /* rien de gardé */ }
        montrer('supprime'); $('supprime').focus();
      }, function (err) { enCours = false; dire('s-erreur', messageAuth(err)); });
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
