// « Je suis intéressé » : un compte Entreprise à l'e-mail vérifié répond à une demande validée (les règles Firestore l'imposent aussi).
// Son message va dans demandes/{id}/interets, lisible par l'admin seulement.
(function () {
  var form = document.getElementById('form');
  var erreur = document.getElementById('erreur');
  var envoyer = document.getElementById('envoyer');
  var msg = document.getElementById('message');
  var texte = document.getElementById('demande-texte');
  var id = new URLSearchParams(location.search).get('d') || '';
  var f, m;

  msg.addEventListener('input', function () {
    var n = msg.value.trim().length;
    document.getElementById('reste-msg').textContent = n < 10 ? 'encore ' + (10 - n) + ' caractères au moins' : n + ' / 1 000';
  });

  function dire(m, champ) {
    erreur.textContent = m;
    erreur.hidden = false;
    if (champ) champ.focus();
    envoyer.disabled = false;
    envoyer.textContent = 'Envoyer mon message';
  }

  // la demande (champs publics seulement) : titre, lieu, date limite ; refusée par les règles si elle n'est pas validée
  // pas connecté (ou sans profil) : page Compte, qui ramène ici après connexion
  AOC_FB.moi().then(function (r) {
    m = r;
    f = r.f;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw { code: 'not-found' }; // « .. », « / », vide : adresse abîmée
    if (!m.user || !m.profil) { location.replace('compte.html?retour=' + encodeURIComponent('interesse.html?d=' + id)); throw { code: 'redirection' }; }
    return f.fs.getDoc(f.fs.doc(f.db, 'demandes', id));
  }).then(function (s) {
    if (!s.exists()) throw { code: 'not-found' };
    var d = s.data();
    var onglet = 'index.html#onglet=' + (d.type === 'prive' ? 'prive' : 'particulier');
    document.querySelectorAll('.retour, .retour-liste').forEach(function (a) { a.href = onglet; });
    var limite = d.delai.toDate();
    var h = document.getElementById('demande-titre');
    h.textContent = d.titre;
    h.hidden = false;
    texte.textContent = d.commune + ' (' + d.departement + ') · réponses avant le ' +
      limite.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) +
      (limite.getHours() ? ', ' + limite.getHours() + ' h' : '');
    if (limite < new Date()) { texte.append(document.createElement('br'), 'Cette demande est close : elle ne reçoit plus de réponses.'); return; }
    var lien = document.createElement('a');
    lien.href = 'compte.html?retour=' + encodeURIComponent('interesse.html?d=' + id);
    if (m.profil.type !== 'entreprise') {
      lien.href = 'compte.html';
      lien.textContent = 'Mon compte';
      return texte.append(document.createElement('br'), 'Répondre est réservé aux comptes Entreprise de travaux. ', lien);
    }
    if (!m.user.emailVerified) {
      lien.textContent = 'Renvoyer le lien';
      return texte.append(document.createElement('br'), "Vérifiez d'abord votre e-mail : cliquez sur le lien reçu à l'inscription. ", lien);
    }
    form.nom.value = m.profil.nom;
    form.telephone.value = m.profil.telephone || '';
    form.email.value = m.user.email;
    form.hidden = false;
  }).catch(function (e) {
    if (e && e.code === 'redirection') return;
    console.warn('Demande indisponible :', e && (e.message || e.code));
    texte.textContent = e && (e.code === 'not-found' || e.code === 'permission-denied')
      ? "Cette demande est introuvable : elle a peut-être été retirée. Revenez à la liste des demandes."
      : 'La demande ne peut pas être chargée. Vérifiez votre connexion et réessayez.';
  });

  var NOMS = { message: 'le message (10 caractères au moins)', nom: 'votre nom', telephone: 'le téléphone', email: "l'e-mail",
    consentement: "l'accord sur vos coordonnées" };

  function merci() {
    form.hidden = true;
    var m = document.getElementById('merci');
    m.hidden = false;
    m.focus();
    window.scrollTo(0, 0);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    erreur.hidden = true;
    var v = function (n) { return (form[n].value || '').trim(); };
    var faux = Array.prototype.find.call(form.elements, function (c) { return c.name && c.willValidate && !c.checkValidity(); });
    if (faux) return dire('Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.', faux);
    if (v('message').length < 10) return dire('Vérifiez ' + NOMS.message + '.', msg);
    if (!v('telephone') && !v('email')) return dire('Indiquez un téléphone ou un e-mail.', form.telephone);
    if (v('site')) return merci(); // robot : on fait comme si c'était envoyé, sans rien écrire

    envoyer.disabled = true;
    envoyer.textContent = 'Envoi…';
    var interet = { nom: v('nom'), message: v('message'), consentement: true, cree: f.fs.serverTimestamp(), uid: m.user.uid };
    if (v('telephone')) interet.telephone = v('telephone');
    if (v('email')) interet.email = v('email');
    f.fs.addDoc(f.fs.collection(f.db, 'demandes', id, 'interets'), interet).then(merci, function (err) {
      console.warn('Envoi refusé :', err && err.message);
      dire(err && err.code === 'permission-denied'
        ? "Votre message n'a pas été accepté : vérifiez l'e-mail et le téléphone. Si c'est bon, la demande vient peut-être d'être close ou retirée."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez dans un instant.");
    });
  });
})();
