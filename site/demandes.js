// Demandes de travaux validées (Firestore) ajoutées aux onglets Privé et Particuliers, avec un bouton « Je suis intéressé ». Jamais de coordonnées : elles sont dans une partie privée.
// Avis d'acheteurs publics validés (type « public », lot 19) : onglet Public, avec le lien officiel, sauf s'ils y sont déjà par le BOAMP.
// Sans réseau ou sans Firebase, la page garde les avis publics et les exemples.
(function () {
  if (!window.AOC_FB || !window.ajouterAvis) return;
  var JOUR_FR = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }
  function euros(x) { return x.toLocaleString('fr-FR').replace(/\s/g, '\u202f') + '\u00a0€'; } // insécables : l'unité ne passe jamais seule à la ligne

  function carte(d, id) {
    var b = document.querySelector('.metiers .filtre[data-metier="' + CSS.escape(d.metier) + '"]');
    var coul = b ? b.style.getPropertyValue('--c') : '#0040dd';
    var limite = d.delai.toDate();
    var pub = d.type === 'public';
    var a = document.createElement('article');
    a.className = 'avis demande';
    a.dataset.id = 'd-' + id;
    a.dataset.source = d.type;
    a.dataset.metiers = d.metier;
    a.dataset.dep = d.departement;
    a.dataset.limite = limite.toISOString();
    a.dataset.publie = d.cree ? d.cree.toDate().toISOString().slice(0, 10) : '';
    a.dataset.montant = d.budget || 0;
    if (pub && d.budget) a.dataset.taille = d.budget < 90000 ? 'petit' : 'moyen'; // filtre « Taille du marché » (seuils de collecte.py, sans « européen »)
    a.style.setProperty('--c', coul);
    var infos = '<div class="garde"><dt>Lieu</dt><dd>' + esc(d.commune) + '</dd></div>'; // garde : gardé en vue compacte
    if (d.budget) infos += '<div class="garde"><dt>' + (pub ? 'Montant estimé' : 'Budget indicatif') + '</dt><dd>' + euros(d.budget) + (d.type === 'particulier' ? '\u00a0TTC' : '\u00a0HT') + '</dd></div>';
    var h = limite.getHours();
    a.innerHTML =
      '<div class="echeance" aria-hidden="true"><span class="jour">' + limite.getDate() + '</span>' +
      '<span class="mois">' + limite.toLocaleDateString('fr-FR', { month: 'short' }) + '</span><span class="reste"></span></div>' +
      '<div class="corps"><p class="haut"><span class="metier" data-m="' + esc(d.metier) + '" style="--c:' + esc(coul) + '">' +
      esc(b ? b.dataset.nom : d.metier) + '</span><span class="dep">' + esc(d.departement) + '</span></p>' +
      (pub ? '<h3><a href="' + esc(d.lien) + '" rel="noopener noreferrer" target="_blank">' + esc(d.titre) + '</a></h3>' +
        '<p class="acheteur"><span class="transmis">Transmis par ' + esc(d.acheteur) + '</span></p>'
        : '<h3>' + esc(d.titre) + '</h3>' +
        '<p class="acheteur">' + (d.type === 'particulier' ? 'Particulier' : 'Société') + '</p>' +
        '<p class="description">' + esc(d.description) + '</p>') +
      '<dl class="infos">' + infos + '</dl>' +
      '<p class="limite"><span class="badge" hidden>Bientôt clos</span>Réponse avant le ' +
      '<time datetime="' + a.dataset.limite + '">' + limite.toLocaleDateString('fr-FR', JOUR_FR) + (h ? ', ' + h + ' h' : '') + '</time></p>' +
      // avis public : on répond sur la plateforme de l'acheteur (Suivre et Agenda viennent se mettre devant, app.js)
      (pub ? '<p class="actions"><a class="action dossier" href="' + esc(d.lien) + '" rel="noopener noreferrer" target="_blank" aria-label="Avis officiel (nouvel onglet) : ' +
        esc(d.titre) + '">Avis officiel</a></p></div>' : '') +
      (pub ? '' : '<p class="places">' + (d.nbInterets ? d.nbInterets + ' entreprise' + (d.nbInterets > 1 ? 's' : '') + ' sur 5 ' +
        (d.nbInterets > 1 ? 'ont' : 'a') + ' déjà répondu' : 'Aucune réponse pour le moment : 5 entreprises au plus') + '</p>' +
      '<p class="interesse"><a class="bouton-publier" href="interesse.html?d=' + encodeURIComponent(id) +
      '" aria-label="Je suis intéressé : ' + esc(d.titre) + '">Je suis intéressé</a></p>' +
      // Suivre et Agenda viennent se mettre devant (app.js)
      (d.photos ? '<p class="actions"><button type="button" class="action voir-photos" aria-expanded="false" aria-label="Voir les photos : ' +
        esc(d.titre) + '">Photos (' + (d.photos | 0) + ')</button></p>' : '') + '</div>');
    if (d.photos) a.querySelector('.voir-photos').onclick = function () { voirPhotos(this, a, id); };
    return a;
  }

  // photos (demandes/{id}/photos) chargées seulement à la demande ; un clic sur une vignette l'agrandit
  function voirPhotos(b, a, id) {
    var galerie = a.querySelector('.galerie');
    if (galerie) {
      galerie.hidden = !galerie.hidden;
      return b.setAttribute('aria-expanded', String(!galerie.hidden));
    }
    if (b.getAttribute('aria-busy')) return;
    b.setAttribute('aria-busy', 'true'); // pas disabled : le focus resterait perdu
    f.fs.getDocs(f.fs.collection(f.db, 'demandes', id, 'photos')).then(function (res) {
      galerie = document.createElement('div');
      galerie.className = 'galerie';
      res.docs.forEach(function (s, i) {
        var v = document.createElement('button');
        v.type = 'button';
        v.className = 'vignette';
        v.setAttribute('aria-pressed', 'false');
        v.setAttribute('aria-label', 'Agrandir la photo ' + (i + 1));
        var img = document.createElement('img');
        img.src = 'data:image/jpeg;base64,' + s.data().data.toBase64();
        img.alt = 'Photo ' + (i + 1) + ' de la demande';
        v.append(img);
        v.onclick = function () { v.setAttribute('aria-pressed', String(v.getAttribute('aria-pressed') !== 'true')); };
        galerie.append(v);
      });
      b.parentNode.after(galerie); // après le bouton : Tab y mène directement
      b.textContent = res.docs.length ? 'Photos (' + res.docs.length + ')' : 'Aucune photo';
      b.setAttribute('aria-expanded', 'true');
    }, function (e) {
      console.warn('Photos indisponibles :', e && e.code);
      b.textContent = 'Photos indisponibles';
    }).then(function () { b.removeAttribute('aria-busy'); });
  }

  // avis d'acheteur déjà publié au BOAMP (data.json, comme l'admin) : on garde seulement celui du BOAMP
  var boamp = [];
  function auBoamp(d) {
    return d.type === 'public' && boamp.some(function (b) { return AOC_FB.doublon(d, b); });
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
    // data.json lu seulement s'il y a des avis d'acheteurs ; illisible : rien n'est caché
    if (!res.docs.some(function (d) { return d.data().type === 'public'; })) return res;
    return fetch('data.json').then(function (r) { return r.json(); }).then(function (j) { boamp = j.avis; }, function () {}).then(function () { return res; });
  }).then(function (res) {
    // pourvue (par son auteur) ou complète (5 entreprises) : elle ne reçoit plus de réponses, on ne l'affiche plus
    var docs = res.docs.filter(function (d) { return !d.data().pourvue && (d.data().nbInterets || 0) < 5 && !auBoamp(d.data()); });
    var cartes = docs.map(function (d) { return carte(d.data(), d.id); });
    window.ajouterAvis(cartes);
    if (f.auth) return f.auth.authStateReady().then(function () {
      var u = f.auth.currentUser;
      if (u) docs.forEach(function (d, i) {
        if (d.data().uid === u.uid && d.data().type !== 'public') cartes[i].querySelector('.interesse').innerHTML = '<a class="lien-bouton" href="compte.html#mes-demandes">Votre demande : suivre dans Mes demandes</a>';
      });
    });
  }).catch(function (e) {
    console.warn('Demandes publiées indisponibles :', e && e.message);
  });
})();
