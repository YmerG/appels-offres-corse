// « Je cherche un partenaire » : un compte Entreprise à l'e-mail vérifié laisse un message sur un appel d'offres public (BOAMP).
// Il va dans partenaires/<n° d'avis>_<uid>, lisible par l'admin seulement, qui met en relation les entreprises d'un même avis.
(function () {
  var form = document.getElementById('form');
  var erreur = document.getElementById('erreur');
  var envoyer = document.getElementById('envoyer');
  var msg = document.getElementById('message');
  var texte = document.getElementById('demande-texte');
  var id = new URLSearchParams(location.search).get('a') || '';
  var f, m, avis;

  msg.addEventListener('input', function () {
    var n = msg.value.trim().length;
    document.getElementById('reste-msg').textContent = n < 10 ? 'encore ' + (10 - n) + ' caractères au moins' : n + ' / 1 000';
  });

  function dire(t, champ) {
    if (champ) AOC_FB.sous(champ, t);
    else { erreur.textContent = t; erreur.hidden = false; }
    envoyer.disabled = false;
    envoyer.textContent = 'Envoyer mon message';
  }

  // l'avis vient de data.json (écrit par collecte.py) ; pas connecté (ou sans profil) : page Compte, qui ramène ici
  AOC_FB.moi().then(function (r) {
    m = r;
    f = r.f;
    if (!/^\d{2}-\d{1,7}$/.test(id)) throw { code: 'not-found' };
    if (!m.user || !m.profil) { location.replace('compte.html?retour=' + encodeURIComponent('partenaire.html?a=' + id)); throw { code: 'redirection' }; }
    return fetch('data.json').then(function (rep) { return rep.json(); });
  }).then(function (data) {
    avis = data.avis.filter(function (a) { return a.id === id; })[0];
    if (!avis) throw { code: 'not-found' };
    var limite = new Date(avis.date_limite);
    var h = document.getElementById('demande-titre');
    h.textContent = avis.objet;
    h.hidden = false;
    texte.textContent = avis.acheteur + ' · ' + avis.lieu + ' · réponses avant le ' +
      limite.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + (limite.getHours() ? ', ' + limite.getHours() + ' h' : '');
    if (limite < new Date()) { texte.append(document.createElement('br'), 'Cet avis est clos.'); return; }
    var lien = document.createElement('a');
    lien.href = 'compte.html?retour=' + encodeURIComponent('partenaire.html?a=' + id);
    if (m.profil.type !== 'entreprise') {
      lien.href = 'compte.html';
      lien.textContent = 'Mon compte';
      return texte.append(document.createElement('br'), 'La recherche de partenaire est réservée aux comptes Entreprise de travaux. ', lien);
    }
    if (!m.user.emailVerified) {
      lien.textContent = 'Renvoyer le lien';
      return texte.append(document.createElement('br'), "Vérifiez d'abord votre e-mail : cliquez sur le lien reçu à l'inscription. ", lien);
    }
    return f.fs.getDoc(f.fs.doc(f.db, 'partenaires', id + '_' + m.user.uid)).then(function (deja) {
      if (deja.exists()) return texte.append(document.createElement('br'), "Vous cherchez déjà un partenaire pour cet avis : l'administrateur vous met en relation dès qu'une autre entreprise se présente.");
      form.nom.value = m.profil.nom;
      form.telephone.value = m.profil.telephone || '';
      form.email.value = m.user.email;
      form.hidden = false;
    });
  }).catch(function (e) {
    if (e && e.code === 'redirection') return;
    console.warn('Avis indisponible :', e && (e.message || e.code));
    texte.textContent = e && e.code === 'not-found'
      ? "Cet avis est introuvable : il est peut-être clos. Revenez à la liste des avis."
      : "L'avis ne peut pas être chargé. Vérifiez votre connexion et réessayez.";
  });

  var NOMS = { message: 'le message (10 caractères au moins)', nom: 'votre nom', telephone: 'le téléphone', email: "l'e-mail",
    consentement: "l'accord sur vos coordonnées" };

  function merci() {
    form.hidden = true;
    var el = document.getElementById('merci');
    el.hidden = false;
    el.focus();
    window.scrollTo(0, 0);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    erreur.hidden = true;
    AOC_FB.effacer(form);
    var v = function (n) { return (form[n].value || '').trim(); };
    var faux = Array.prototype.find.call(form.elements, function (c) { return c.name && c.willValidate && !c.checkValidity(); });
    if (faux) return dire(faux.name === 'consentement' ? 'Cochez cette case pour envoyer votre message.' : 'Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.', faux);
    if (v('message').length < 10) return dire('Vérifiez ' + NOMS.message + '.', msg);
    if (!v('telephone') && !v('email')) return dire('Indiquez un téléphone ou un e-mail.', form.telephone);
    if (v('site')) return merci(); // robot : on fait comme si c'était envoyé, sans rien écrire

    envoyer.disabled = true;
    envoyer.textContent = 'Envoi…';
    var p = { avis: id, objet: avis.objet.slice(0, 300), limite: new Date(avis.date_limite), nom: v('nom'), message: v('message'), consentement: true,
      cree: f.fs.serverTimestamp(), uid: m.user.uid };
    if (v('telephone')) p.telephone = v('telephone');
    if (v('email')) p.email = v('email');
    f.fs.setDoc(f.fs.doc(f.db, 'partenaires', id + '_' + m.user.uid), p).then(merci, function (err) {
      console.warn('Envoi refusé :', err && err.message);
      dire(err && err.code === 'permission-denied'
        ? "Votre message n'a pas été accepté : vérifiez l'e-mail et le téléphone. Si c'est bon, vous avez peut-être déjà écrit pour cet avis."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez dans un instant.");
    });
  });
})();
