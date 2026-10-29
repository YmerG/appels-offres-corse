// Formulaire « Acheteur public » (lot 19) : avis d'une mairie, d'une communauté de communes… avec le lien vers l'avis officiel.
// Compte connecté à l'e-mail vérifié (les règles Firestore l'imposent) ; l'avis part « en attente » avec le contact du service
// marchés (privé), et n'est visible qu'après validation dans admin.html, dans l'onglet Public.
(function () {
  var m; // { f, user, profil } (firebase-config.js)
  var form = document.getElementById('form');
  var erreur = document.getElementById('erreur');
  var envoyer = document.getElementById('envoyer');
  var delai = document.getElementById('delai');
  var JOUR = 864e5;

  function iso(d) { return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  delai.min = iso(new Date());
  delai.max = iso(new Date(Date.now() + 365 * JOUR));

  function dire(msg, champ) {
    if (champ) AOC_FB.sous(champ, msg);
    else { erreur.textContent = msg; erreur.hidden = false; }
    envoyer.disabled = false;
    envoyer.textContent = 'Envoyer mon avis';
  }

  // commune de Corse reconnue : nom officiel et département cochés tout seuls (communes.js), comme publier.js
  var depDuSite = false;
  function depAuto() {
    var c = AOC_COMMUNE(form.commune.value);
    if (c) { form.commune.value = c[0]; form.departement.value = c[1]; depDuSite = true; }
    else if (depDuSite && form.commune.value.trim()) { form.querySelectorAll('[name=departement]').forEach(function (r) { r.checked = false; }); depDuSite = false; }
  }
  form.commune.addEventListener('change', depAuto);
  form.querySelectorAll('[name=departement]').forEach(function (r) { r.addEventListener('change', function () { depDuSite = false; }); });

  var NOMS = { acheteur: "le nom de l'acheteur", titre: "l'objet (5 caractères au moins)", commune: 'la commune', budget: 'le montant (un nombre entier)',
    delai: "la date (d'aujourd'hui à dans un an)", heure: "l'heure", lien: 'le lien (il doit commencer par https://)',
    nom: 'le service à contacter', telephone: 'le téléphone', email: "l'e-mail" };
  var MSG = { metier: 'Choisissez le métier.', departement: 'Choisissez le département.', consentement: 'Cochez cette case pour envoyer votre avis.' };

  function limite() { return new Date(form.delai.value + 'T' + form.heure.value); }
  // premier champ à corriger : [champ, message] ; le navigateur contrôle longueurs, formats et champs obligatoires
  function aCorriger() {
    var v = function (c) { return (form[c].value || '').trim(); };
    var faux = Array.prototype.find.call(form.querySelectorAll('[name]'), function (c) { return c.willValidate && !c.checkValidity(); });
    if (faux) return [faux.type === 'radio' ? form.querySelector('[name=' + faux.name + ']') : faux, MSG[faux.name] || 'Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.'];
    if (v('acheteur').length < 2) return [form.acheteur, 'Vérifiez ' + NOMS.acheteur + '.'];
    if (v('titre').length < 5) return [form.titre, 'Vérifiez ' + NOMS.titre + '.'];
    if (v('commune').length < 2) return [form.commune, 'Vérifiez ' + NOMS.commune + '.'];
    if (!(limite() > new Date())) return [form.heure, 'Cette date limite est déjà passée.'];
    if (!/^https:\/\/[^ <>"]+$/.test(v('lien'))) return [form.lien, 'Vérifiez ' + NOMS.lien + '.'];
    if (!v('telephone') && !v('email')) return [form.telephone, 'Indiquez un téléphone ou un e-mail.'];
  }

  function merci() {
    form.hidden = true;
    var p = document.getElementById('merci');
    p.hidden = false;
    p.focus();
  }

  // pas connecté (ou sans profil), ou e-mail pas vérifié : explication et lien vers Compte, qui ramène ici
  function garde(html) { document.getElementById('garde-texte').innerHTML = html; }
  AOC_FB.moi().then(function (r) {
    m = r;
    var compte = 'compte.html?retour=acheteurs.html';
    if (!m.user || !m.profil) return garde('Pour publier un avis, <a href="' + compte + '">connectez-vous ou créez un compte</a> (le type « Particulier » convient : il sert seulement à vous connecter). Vous revenez ensuite ici.');
    if (!m.user.emailVerified) return garde("Vérifiez d'abord votre e-mail : cliquez sur le lien reçu à l'inscription. <a href=\"" + compte + '">Renvoyer le lien</a>');
    form.email.value = m.user.email;
    document.getElementById('garde').hidden = true;
    form.hidden = false;
  }, function (e) {
    console.warn('Compte indisponible :', e && e.message);
    garde('Le service est injoignable. Vérifiez votre connexion et rechargez la page.');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    depAuto(); // Entrée dans « Commune » : ne pas compter sur l'événement change
    AOC_FB.effacer(form);
    erreur.hidden = true;
    var faux = aCorriger();
    if (faux) return dire(faux[1], faux[0]);
    var v = function (n) { return (form[n].value || '').trim(); };
    if (v('site')) return merci(); // robot : on fait comme si c'était envoyé, sans rien écrire

    envoyer.disabled = true;
    envoyer.textContent = 'Envoi…';
    Promise.resolve(m.f).then(function (f) {
      var fs = f.fs;
      var ref = fs.doc(fs.collection(f.db, 'demandes'));
      var avis = {
        type: 'public', metier: v('metier'), titre: v('titre'), acheteur: v('acheteur'), lien: v('lien'),
        commune: v('commune'), departement: form.departement.value, delai: fs.Timestamp.fromDate(limite()),
        statut: 'en_attente', cree: fs.serverTimestamp(), uid: m.user.uid
      };
      if (v('budget')) avis.budget = form.budget.valueAsNumber;
      var contact = { nom: v('nom'), consentement: true, cree: fs.serverTimestamp() };
      if (v('telephone')) contact.telephone = v('telephone');
      if (v('email')) contact.email = v('email');
      var lot = fs.writeBatch(f.db);
      lot.set(ref, avis);
      lot.set(fs.doc(f.db, 'demandes', ref.id, 'prive', 'contact'), contact);
      return lot.commit();
    }).then(merci, function (err) {
      console.warn('Envoi refusé :', err && err.message);
      dire(err && err.code === 'permission-denied'
        ? "Votre avis n'a pas été accepté : vérifiez le lien, l'e-mail, le téléphone et la date, puis réessayez. Si c'est bon, vérifiez votre compte (page Compte)."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez dans un instant.");
    });
  });
})();
