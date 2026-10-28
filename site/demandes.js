// Demandes de travaux validées (Firestore) ajoutées aux onglets Privé et Particuliers, avec un bouton « Je suis intéressé ». Jamais de coordonnées : elles sont dans une partie privée.
// Sans réseau ou sans Firebase, la page garde les avis publics et les exemples.
(function () {
  if (!window.AOC_FB || !window.ajouterAvis) return;
  var JOUR_FR = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }
  function euros(x) { return x.toLocaleString('fr-FR').replace(/\s/g, ' ') + ' €'; }

  function carte(d, id) {
    var b = document.querySelector('.metiers .filtre[data-metier="' + CSS.escape(d.metier) + '"]');
    var coul = b ? b.style.getPropertyValue('--c') : '#2c5d8f';
    var limite = d.delai.toDate();
    var a = document.createElement('article');
    a.className = 'avis demande';
    a.dataset.source = d.type;
    a.dataset.metiers = d.metier;
    a.dataset.dep = d.departement;
    a.dataset.limite = limite.toISOString();
    a.dataset.publie = d.cree ? d.cree.toDate().toISOString().slice(0, 10) : '';
    a.dataset.montant = d.budget || 0;
    a.style.setProperty('--c', coul);
    var infos = '<div><dt>Lieu</dt><dd>' + esc(d.commune) + '</dd></div>';
    if (d.budget) infos += '<div><dt>Budget indicatif</dt><dd>' + euros(d.budget) + (d.type === 'particulier' ? ' TTC' : ' HT') + '</dd></div>';
    var h = limite.getHours();
    a.innerHTML =
      '<div class="echeance" aria-hidden="true"><span class="jour">' + limite.getDate() + '</span>' +
      '<span class="mois">' + limite.toLocaleDateString('fr-FR', { month: 'short' }) + '</span><span class="reste"></span></div>' +
      '<div class="corps"><p class="haut"><span class="metier" data-m="' + esc(d.metier) + '" style="--c:' + esc(coul) + '">' +
      esc(b ? b.dataset.nom : d.metier) + '</span><span class="dep">' + esc(d.departement) + '</span></p>' +
      '<h3>' + esc(d.titre) + '</h3>' +
      '<p class="acheteur">' + (d.type === 'particulier' ? 'Particulier' : 'Société') + '</p>' +
      '<p class="description">' + esc(d.description) + '</p>' +
      '<dl class="infos">' + infos + '</dl>' +
      '<p class="limite"><span class="badge" hidden>Bientôt clos</span>Réponse avant le ' +
      '<time datetime="' + a.dataset.limite + '">' + limite.toLocaleDateString('fr-FR', JOUR_FR) + (h ? ', ' + h + ' h' : '') + '</time></p>' +
      '<p class="interesse"><a class="bouton-publier" href="interesse.html?d=' + encodeURIComponent(id) +
      '" aria-label="Je suis intéressé : ' + esc(d.titre) + '">Je suis intéressé</a></p></div>';
    return a;
  }

  // Sur ses propres demandes, l'auteur voit « Votre demande » au lieu de « Je suis intéressé ».
  // Auth (157 Ko) n'est chargé que si ce navigateur a déjà une session Firebase ; s'il ne se charge pas, la liste s'affiche sans.
  var f;
  var session = window.indexedDB && indexedDB.databases ? indexedDB.databases().then(function (l) {
    return l.some(function (d) { return d.name === 'firebaseLocalStorageDb'; });
  }, function () { return false; }) : Promise.resolve(false);
  session.then(function (s) {
    return AOC_FB.ouvrir(s).catch(function () { return AOC_FB.ouvrir(false); });
  }).then(function (r) {
    f = r;
    return f.fs.getDocs(f.fs.query(f.fs.collection(f.db, 'demandes'), f.fs.where('statut', '==', 'validee')));
  }).then(function (res) {
    var cartes = res.docs.map(function (d) { return carte(d.data(), d.id); });
    window.ajouterAvis(cartes);
    if (f.auth) return f.auth.authStateReady().then(function () {
      var u = f.auth.currentUser;
      if (u) res.docs.forEach(function (d, i) {
        if (d.data().uid === u.uid) cartes[i].querySelector('.interesse').innerHTML = '<a class="lien-bouton" href="compte.html#mes-demandes">Votre demande : suivre dans Mes demandes</a>';
      });
    });
  }).catch(function (e) {
    console.warn('Demandes publiées indisponibles :', e && e.message);
  });
})();
