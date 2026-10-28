// Formulaire « Publier une demande » en 3 étapes (Quoi, Où, Quand), brouillon gardé dans ce navigateur.
// Réservé aux comptes à l'e-mail vérifié (les règles Firestore l'imposent aussi) ; un compte Entreprise publie seulement dans « Privé – sociétés ».
// Contrôle, puis écriture groupée sur Firestore (demande « en attente » liée au compte + coordonnées privées).
(function () {
  var m; // { f, user, profil } (firebase-config.js)
  var form = document.getElementById('form');
  var erreur = document.getElementById('erreur');
  var envoyer = document.getElementById('envoyer');
  var precedent = document.getElementById('precedent');
  var desc = document.getElementById('description');
  var delai = document.getElementById('delai');
  var etapes = form.querySelectorAll('.etape');
  var etape = 0;
  var JOUR = 864e5;

  function iso(d) { return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  var demain = new Date(Date.now() + JOUR);
  delai.min = iso(demain);
  delai.max = iso(new Date(Date.now() + 90 * JOUR));

  var type = new URLSearchParams(location.search).get('type');
  if (type === 'prive' || type === 'particulier') form.type.value = type;
  function majRetour() { document.getElementById('retour').href = 'index.html#onglet=' + form.type.value; }

  desc.addEventListener('input', function () {
    var n = desc.value.trim().length;
    document.getElementById('reste-desc').textContent = n < 20 ? 'encore ' + (20 - n) + ' caractères au moins' : n + ' / 1 500';
  });

  function libelle() { envoyer.textContent = etape < etapes.length - 1 ? 'Continuer' : 'Envoyer pour vérification'; }
  function dire(msg, champ) {
    if (champ) AOC_FB.sous(champ, msg);
    else { erreur.textContent = msg; erreur.hidden = false; }
    envoyer.disabled = false;
    libelle();
  }

  function aller(n, focus) {
    etape = n;
    etapes.forEach(function (s, i) { s.hidden = i !== n; });
    var nom = document.getElementById('etape-nom');
    nom.textContent = 'Étape ' + (n + 1) + ' sur ' + etapes.length + ' · ' + etapes[n].dataset.nom;
    document.getElementById('barre').style.width = (n + 1) / etapes.length * 100 + '%';
    precedent.hidden = n === 0;
    libelle();
    sauver();
    if (focus) { nom.focus(); nom.scrollIntoView({ block: 'nearest' }); }
  }
  precedent.onclick = function () { AOC_FB.effacer(form); erreur.hidden = true; aller(etape - 1, true); };

  // --- Brouillon (localStorage, par compte) : les champs des travaux et l'étape ; jamais les coordonnées
  var BROUILLON = ['type', 'metier', 'titre', 'description', 'commune', 'departement', 'budget', 'delai'];
  function cle() { return m && m.user ? 'aoc-brouillon-' + m.user.uid : null; }
  function sauver() {
    if (!cle() || form.hidden) return;
    var b = { etape: etape };
    BROUILLON.forEach(function (n) { b[n] = form[n].value; });
    try { localStorage.setItem(cle(), JSON.stringify(b)); } catch (e) { /* navigation privée : pas de brouillon */ }
  }
  function reprendre() {
    var b;
    try { b = JSON.parse(localStorage.getItem(cle())); } catch (e) { b = null; }
    // brouillon seulement si quelque chose a été écrit (la commune et le type sont pré-remplis)
    if (!b || !(b.metier || b.titre || b.description)) return false;
    BROUILLON.forEach(function (n) {
      if (b[n] && !(n === 'type' && m.profil.type === 'entreprise')) form[n].value = b[n];
    });
    desc.dispatchEvent(new Event('input'));
    document.getElementById('brouillon').hidden = false;
    aller(Math.min(b.etape | 0, etapes.length - 1));
    return true;
  }
  form.addEventListener('input', sauver);
  form.addEventListener('change', sauver);
  document.getElementById('recommencer').onclick = function () {
    try { localStorage.removeItem(cle()); } catch (e) { /* rien à effacer */ }
    location.reload();
  };

  var NOMS = { metier: 'le métier', titre: 'le titre (5 caractères au moins)', description: 'la description (20 caractères au moins)',
    commune: 'la commune', departement: 'le département', budget: 'le budget (un nombre entier)', delai: 'la date (entre demain et dans 90 jours)',
    nom: 'votre nom', telephone: 'le téléphone', email: "l'e-mail", consentement: "l'accord sur vos coordonnées" };
  var MSG = { departement: 'Choisissez le département.', consentement: 'Cochez cette case pour envoyer votre demande.' };

  // premier champ à corriger dans l'étape n : [champ, message] ; le navigateur contrôle longueurs, formats et champs obligatoires
  function aCorriger(n) {
    var v = function (c) { return (form[c].value || '').trim(); };
    var faux = Array.prototype.find.call(etapes[n].querySelectorAll('[name]'), function (c) { return c.willValidate && !c.checkValidity(); });
    if (faux) return [faux.type === 'radio' ? form.querySelector('[name=' + faux.name + ']') : faux, MSG[faux.name] || 'Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.'];
    if (n === 0 && v('titre').length < 5) return [form.titre, 'Vérifiez ' + NOMS.titre + '.'];
    if (n === 0 && v('description').length < 20) return [desc, 'Vérifiez ' + NOMS.description + '.'];
    if (n === 1 && v('commune').length < 2) return [form.commune, 'Vérifiez ' + NOMS.commune + '.'];
    if (n === 2 && !v('telephone') && !v('email')) return [form.telephone, 'Indiquez un téléphone ou un e-mail.'];
  }

  function merci() {
    try { localStorage.removeItem(cle()); } catch (e) { /* rien à effacer */ }
    majRetour();
    form.hidden = true;
    document.getElementById('brouillon').hidden = true;
    var m = document.getElementById('merci');
    m.hidden = false;
    m.focus();
    window.scrollTo(0, 0);
  }

  // compte : pas connecté (ou sans profil) → page Compte ; e-mail pas vérifié → explication ; sinon formulaire pré-rempli
  function garde(html) { document.getElementById('garde-texte').innerHTML = html; }
  AOC_FB.moi().then(function (r) {
    m = r;
    // garde ?type=prive pour le retour (encodé : il passe aussi dans le lien ci-dessous)
    var compte = 'compte.html?retour=' + encodeURIComponent('publier.html' + location.search);
    if (!m.user || !m.profil) return location.replace(compte);
    if (!m.user.emailVerified) return garde("Vérifiez d'abord votre e-mail : cliquez sur le lien reçu à l'inscription. <a href=\"" + compte + "\">Renvoyer le lien</a>");
    form.nom.value = m.profil.nom;
    form.commune.value = m.profil.commune || '';
    form.telephone.value = m.profil.telephone || '';
    form.email.value = m.user.email;
    if (!type) form.type.value = 'particulier';
    if (m.profil.type === 'entreprise') {
      form.type.value = 'prive';
      document.getElementById('f-qui').hidden = true;
      if (m.profil.zone.length === 1) form.departement.value = m.profil.zone[0];
    }
    document.getElementById('garde').hidden = true;
    form.hidden = false;
    if (!reprendre()) aller(0);
    majRetour();
  }, function (e) {
    console.warn('Compte indisponible :', e && e.message);
    garde('Le service est injoignable. Vérifiez votre connexion et rechargez la page.');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    AOC_FB.effacer(form);
    erreur.hidden = true;
    var faux = aCorriger(etape);
    if (faux) return dire(faux[1], faux[0]);
    if (etape < etapes.length - 1) return aller(etape + 1, true);
    // dernière étape : on recontrôle tout (brouillon ancien, date passée…) et on revient à l'étape fautive
    for (var i = 0; i < etapes.length; i++) {
      faux = aCorriger(i);
      if (faux) { aller(i); return dire(faux[1], faux[0]); }
    }
    var v = function (n) { return (form[n].value || '').trim(); };
    if (v('site')) return merci(); // robot : on fait comme si c'était envoyé, sans rien écrire

    envoyer.disabled = true;
    envoyer.textContent = 'Envoi…';
    Promise.resolve(m.f).then(function (f) {
      var fs = f.fs;
      var ref = fs.doc(fs.collection(f.db, 'demandes'));
      var demande = {
        type: form.type.value, metier: v('metier'), titre: v('titre'), description: v('description'),
        commune: v('commune'), departement: form.departement.value,
        delai: fs.Timestamp.fromDate(new Date(v('delai') + 'T18:00:00')),
        statut: 'en_attente', cree: fs.serverTimestamp(), uid: m.user.uid
      };
      if (v('budget')) demande.budget = form.budget.valueAsNumber; // « 1e3 » = 1000 ; entier garanti par step="1"
      var contact = { nom: v('nom'), consentement: true, cree: fs.serverTimestamp() };
      if (v('telephone')) contact.telephone = v('telephone');
      if (v('email')) contact.email = v('email');
      var lot = fs.writeBatch(f.db);
      lot.set(ref, demande);
      lot.set(fs.doc(f.db, 'demandes', ref.id, 'prive', 'contact'), contact);
      return lot.commit();
    }).then(merci, function (err) {
      console.warn('Envoi refusé :', err && err.message);
      // refus des règles Firestore (champ que le navigateur a laissé passer) : ne pas parler de connexion
      dire(err && err.code === 'permission-denied'
        ? "Votre demande n'a pas été acceptée : vérifiez l'e-mail, le téléphone et la date, puis réessayez. Si c'est bon, vérifiez votre compte (page Compte)."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez dans un instant. Votre brouillon est gardé.");
    });
  });
  form.addEventListener('change', majRetour);
})();
