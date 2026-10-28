// Formulaire « Publier une demande » : contrôle, puis écriture groupée sur Firestore (demande « en attente » + coordonnées privées).
(function () {
  var form = document.getElementById('form');
  var erreur = document.getElementById('erreur');
  var envoyer = document.getElementById('envoyer');
  var desc = document.getElementById('description');
  var delai = document.getElementById('delai');
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

  function dire(msg, champ) {
    erreur.textContent = msg;
    erreur.hidden = false;
    if (champ) champ.focus();
    envoyer.disabled = false;
    envoyer.textContent = 'Envoyer pour vérification';
  }

  var NOMS = { metier: 'le métier', titre: 'le titre (5 caractères au moins)', description: 'la description (20 caractères au moins)',
    commune: 'la commune', departement: 'le département', budget: 'le budget (un nombre entier)', delai: 'la date (entre demain et dans 90 jours)',
    nom: 'votre nom', telephone: 'le téléphone', email: "l'e-mail", consentement: "l'accord sur vos coordonnées" };

  function merci() {
    majRetour();
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
    // le navigateur contrôle longueurs, formats et champs obligatoires ; on nomme le premier champ à corriger
    var faux = Array.prototype.find.call(form.elements, function (c) { return c.name && c.willValidate && !c.checkValidity(); });
    if (faux) return dire('Vérifiez ' + (NOMS[faux.name] || 'ce champ') + '.', faux.type === 'radio' ? form.querySelector('[name=' + faux.name + ']') : faux);
    if (v('titre').length < 5) return dire('Vérifiez ' + NOMS.titre + '.', form.titre);
    if (v('description').length < 20) return dire('Vérifiez ' + NOMS.description + '.', desc);
    if (!v('telephone') && !v('email')) return dire('Indiquez un téléphone ou un e-mail.', form.telephone);
    if (v('site')) return merci(); // robot : on fait comme si c'était envoyé, sans rien écrire

    envoyer.disabled = true;
    envoyer.textContent = 'Envoi…';
    AOC_FB.ouvrir(false).then(function (f) {
      var fs = f.fs;
      var ref = fs.doc(fs.collection(f.db, 'demandes'));
      var demande = {
        type: form.type.value, metier: v('metier'), titre: v('titre'), description: v('description'),
        commune: v('commune'), departement: form.departement.value,
        delai: fs.Timestamp.fromDate(new Date(v('delai') + 'T18:00:00')),
        statut: 'en_attente', cree: fs.serverTimestamp()
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
        ? "Votre demande n'a pas été acceptée : vérifiez l'e-mail, le téléphone et la date, puis réessayez."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez dans un instant.");
    });
  });
  form.addEventListener('change', majRetour);
})();
