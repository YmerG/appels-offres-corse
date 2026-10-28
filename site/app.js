// Appels d'offres Corse : avis clos retirés, compte à rebours, onglets (public / exemples privés), recherche, filtres métier et département, tri.
(function () {
  var liste = document.getElementById('avis');
  var q = document.getElementById('q');
  var tri = document.getElementById('tri');
  var etat = document.getElementById('etat');
  var vide = document.getElementById('vide');
  var bandeau = document.getElementById('bandeau');
  var publier = document.getElementById('publier');
  var filtres = Array.prototype.slice.call(document.querySelectorAll('.filtre'));
  var CLES = ['onglet', 'metier', 'dep'];
  var DEFAUT = { onglet: 'public', metier: '', dep: '' };
  var choix = { onglet: 'public', metier: '', dep: '' };
  var JOUR = 864e5;
  var maintenant = new Date();
  var aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());

  function normal(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function cle(b) { return CLES.filter(function (k) { return k in b.dataset; })[0]; }

  // La page peut dater de quelques heures : on retire les avis dont la date limite est passée
  function preparer(c) {
    var limite = new Date(c.dataset.limite);
    if (!(limite >= maintenant)) { c.remove(); return false; }
    var j = Math.round((new Date(limite.getFullYear(), limite.getMonth(), limite.getDate()) - aujourdhui) / JOUR);
    c.querySelector('.reste').textContent = j === 0 ? "Auj." : j === 1 ? 'Demain' : 'J-' + j;
    if (j <= 7) { c.classList.add('urgent'); c.querySelector('.badge').hidden = false; }
    c._metiers = c.dataset.metiers.split(' ');
    c._tags = Array.prototype.slice.call(c.querySelectorAll('.metier[data-m]'));
    c._ancre = c.querySelector('.autres') || c.querySelector('.dep');
    c._texte = normal(c.querySelector('.corps').textContent);
    return true;
  }
  var cartes = Array.prototype.slice.call(liste.querySelectorAll('.avis')).filter(preparer);
  function de(source) { return cartes.filter(function (c) { return c.dataset.source === source; }); }
  // l'en-tête ne compte que les marchés publics réels
  var publics = de('public');
  document.getElementById('nb-total').textContent = publics.length;
  document.getElementById('nb-semaine').textContent = publics.filter(function (c) { return c.classList.contains('urgent'); }).length;
  function compterOnglets() {
    filtres.forEach(function (b) { if (b.dataset.onglet) b.querySelector('.nb').textContent = de(b.dataset.onglet).length; });
  }
  compterOnglets();

  // compteurs des métiers pour l'onglet affiché ; un métier absent de l'onglet est caché (sauf s'il est choisi)
  function compter() {
    var ici = de(choix.onglet);
    filtres.forEach(function (b) {
      if (!('metier' in b.dataset)) return;
      var n = b.dataset.metier ? ici.filter(function (c) { return c._metiers.indexOf(b.dataset.metier) !== -1; }).length : ici.length;
      b.querySelector('.nb').textContent = n;
      b.hidden = !n && b.dataset.metier !== choix.metier;
    });
  }

  function appliquer() {
    var mots = normal(q.value).split(/\s+/).filter(Boolean);
    var n = 0;
    compter();
    bandeau.hidden = choix.onglet === 'public';
    publier.href = 'publier.html?type=' + choix.onglet;
    cartes.forEach(function (c) {
      var ok = c.dataset.source === choix.onglet &&
        (!choix.metier || c._metiers.indexOf(choix.metier) !== -1) &&
        (!choix.dep || c.dataset.dep === choix.dep) &&
        mots.every(function (m) { return c._texte.indexOf(m) !== -1; });
      c.hidden = !ok;
      if (ok) n++;
      // le métier filtré passe en tête de la carte (sinon il peut être caché derrière « +3 »)
      var ordre = c._tags.filter(function (t) { return t.dataset.m === choix.metier; })
        .concat(c._tags.filter(function (t) { return t.dataset.m !== choix.metier; }));
      ordre.forEach(function (t, i) { t.hidden = i >= 2; c._ancre.parentNode.insertBefore(t, c._ancre); });
      if (ordre.length > 2) c._ancre.title = ordre.slice(2).map(function (t) { return t.textContent; }).join(', ');
    });
    var filtre = mots.length || choix.metier || choix.dep;
    var ex = cartes.filter(function (c) { return !c.hidden && c.querySelector('.exemple'); }).length;
    etat.textContent = n + ' avis ' + (filtre ? (n > 1 ? 'trouvés' : 'trouvé') : choix.onglet === 'public' ? 'en cours'
      : ex === n ? "d'exemple" : 'en cours' + (ex ? ', dont ' + ex + " d'exemple" : ''));
    vide.hidden = n > 0;
    // l'adresse garde le choix : un artisan peut l'enregistrer (#onglet=prive&metier=electricite&dep=2B)
    var h = CLES.filter(function (k) { return choix[k] !== DEFAUT[k]; }).map(function (k) { return k + '=' + choix[k]; }).join('&');
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }

  function choisir(k, valeur) {
    choix[k] = valeur;
    filtres.forEach(function (x) { if (cle(x) === k) x.setAttribute('aria-pressed', String(x.dataset[k] === valeur)); });
  }

  function trier() {
    var t = tri.value;
    cartes.sort(function (a, b) {
      if (t === 'publie') return b.dataset.publie.localeCompare(a.dataset.publie) || a.dataset.limite.localeCompare(b.dataset.limite);
      if (t === 'montant') return b.dataset.montant - a.dataset.montant;
      return new Date(a.dataset.limite) - new Date(b.dataset.limite);
    });
    cartes.forEach(function (c) { liste.appendChild(c); });
  }

  filtres.forEach(function (b) {
    b.addEventListener('click', function () { var k = cle(b); choisir(k, b.dataset[k]); appliquer(); });
  });
  q.addEventListener('input', appliquer);
  tri.addEventListener('change', trier);
  document.getElementById('effacer').addEventListener('click', function () {
    q.value = '';
    choisir('metier', '');
    choisir('dep', '');
    appliquer();
    etat.focus();
  });

  // Ligne des métiers sur téléphone : le bouton qui reçoit le focus clavier est recalé entier dans la ligne
  document.querySelector('.metiers').addEventListener('focusin', function (e) { e.target.scrollIntoView({ inline: 'nearest', block: 'nearest' }); });

  // Lien direct, à l'ouverture comme sur une page déjà ouverte (favori, lien collé)
  function depuisAdresse() {
    CLES.forEach(function (k) { choisir(k, DEFAUT[k]); });
    location.hash.slice(1).split('&').forEach(function (p) {
      var kv = p.split('=');
      if (CLES.indexOf(kv[0]) !== -1 && document.querySelector('.filtre[data-' + kv[0] + '="' + CSS.escape(kv[1] || '') + '"]')) choisir(kv[0], kv[1]);
    });
    appliquer();
  }
  window.addEventListener('hashchange', depuisAdresse);
  depuisAdresse();

  // Demandes publiées par les visiteurs (demandes.js, après la lecture sur Firestore) : ajoutées puis triées et filtrées comme les autres
  window.ajouterAvis = function (nouvelles) {
    nouvelles.forEach(function (c) { if (preparer(c)) cartes.push(c); });
    compterOnglets();
    trier();
    appliquer();
  };
})();
