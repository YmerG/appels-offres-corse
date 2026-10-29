// Fiche publique d'une entreprise (fiches/{uid}), lisible une fois validée par l'admin ; le lien est envoyé au demandeur
// lors d'une mise en relation (aucune liste publique des fiches)
(function () {
  var METIERS = { 'gros-oeuvre': 'Gros œuvre, bâtiment', 'second-oeuvre': 'Second œuvre, finitions', electricite: 'Électricité, éclairage',
    'plomberie-cvc': 'Plomberie, chauffage, clim', 'voirie-vrd': 'Voirie, réseaux (VRD)', 'espaces-verts': 'Espaces verts',
    nettoyage: 'Nettoyage, déchets', informatique: 'Informatique, télécoms', etudes: "Études, maîtrise d'œuvre",
    restauration: 'Restauration, alimentation', services: 'Services', fournitures: 'Fournitures, équipements' };
  var DEPS = { '2A': 'Corse-du-Sud', '2B': 'Haute-Corse' };
  var $ = function (id) { return document.getElementById(id); };
  var id = new URLSearchParams(location.search).get('id') || '';
  var absente = "Cette fiche n'existe pas, ou elle n'est pas encore en ligne. Vérifiez le lien reçu.";
  if (!/^[A-Za-z0-9]{1,128}$/.test(id)) { $('e-etat').textContent = absente; return; }

  AOC_FB.ouvrir(false).then(function (f) {
    return f.fs.getDoc(f.fs.doc(f.db, 'fiches', id));
  }).then(function (s) {
    // pas encore validée = refus des règles, comme une fiche inexistante
    if (!s.exists()) throw { code: 'permission-denied' };
    var d = s.data();
    document.title = d.nom + ' · Appels d\'offres Corse';
    $('e-nom').textContent = d.nom;
    $('e-chapo').textContent = 'Entreprise de travaux · intervient en ' + d.zone.map(function (z) { return DEPS[z] || z; }).join(' et ');
    d.metiers.forEach(function (m) {
      var t = document.createElement('span');
      t.className = 'dep';
      t.textContent = METIERS[m] || m;
      $('e-etiquettes').append(t);
    });
    $('e-texte').textContent = d.presentation;
    $('e-siret').textContent = d.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
    $('e-annuaire').href = 'https://annuaire-entreprises.data.gouv.fr/etablissement/' + d.siret;
    $('e-maj').textContent = d.maj ? d.maj.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
    $('e-etat').hidden = true;
    $('e-fiche').hidden = false;
  }).catch(function (e) {
    console.warn('Fiche :', e && e.code);
    $('e-etat').textContent = e && e.code === 'permission-denied' ? absente : 'La fiche ne peut pas être chargée : vérifiez votre connexion, puis rechargez la page.';
  });
})();
