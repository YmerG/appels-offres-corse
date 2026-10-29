// Marchés attribués : filtre par métier (sans JS, la liste entière reste affichée)
(function () {
  var choix = document.getElementById('metier-res');
  var etat = document.getElementById('etat');
  var cartes = Array.prototype.slice.call(document.querySelectorAll('.avis-liste .avis'));
  // ordre d'origine gardé une fois pour toutes, pour que « Tous les métiers » le rétablisse (rapport 30)
  cartes.forEach(function (c) {
    c._tags = Array.prototype.slice.call(c.querySelectorAll('.metier[data-m]'));
    c._ancre = c.querySelector('.autres') || c.querySelector('.dep');
  });
  var reperes = document.getElementById('reperes');
  function euros(x) {
    return x >= 1e6 ? (Math.round(x / 1e5) / 10).toLocaleString('fr-FR') + '\u00a0M€' : Math.round(x).toLocaleString('fr-FR') + '\u00a0€';
  }
  function rang(v, q) { return v[Math.round((v.length - 1) * q)]; }
  function mediane(v) { var n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; }
  // repères du métier choisi (point 15 de la veille) : médianes, pour ne pas être tiré par un très gros marché.
  // « typique » = médiane (expliquée dans le pied de page) ; quartiles seulement quand il y a assez de prix
  function majReperes(visibles) {
    var m = [], o = [], t = [];
    visibles.forEach(function (c) {
      if (c.dataset.montant) m.push(+c.dataset.montant);
      if (c.dataset.offres) o.push(+c.dataset.offres);
    });
    m.sort(function (a, b) { return a - b; });
    o.sort(function (a, b) { return a - b; });
    if (m.length >= 3) t.push('Prix typique : ' + euros(mediane(m)) + ' HT (sur ' + m.length + ' marchés' + (m.length < 8 ? ' seulement' : '') + ')' +
      (m.length >= 8 ? '. Un marché sur deux entre ' + euros(rang(m, .25)) + ' et ' + euros(rang(m, .75)) : ''));
    else t.push('Prix : trop peu de marchés au prix connu pour un repère');
    var seuls = o.filter(function (x) { return x === 1; }).length;
    if (o.length >= 3) t.push('Concurrence : ' + mediane(o).toLocaleString('fr-FR') + (mediane(o) >= 2 ? ' offres' : ' offre') + ' par marché en général' + (seuls ? ', une seule offre pour ' +
      seuls + (seuls > 1 ? ' marchés' : ' marché') + ' sur ' + o.length : ', jamais une seule (sur ' + o.length + ' marchés)'));
    reperes.textContent = t.join('. ') + '.';
    reperes.hidden = false;
  }
  choix.parentNode.hidden = false;
  majReperes(cartes);
  choix.addEventListener('change', function () {
    var n = 0, visibles = [];
    cartes.forEach(function (c) {
      var garde = !choix.value || c.dataset.metiers.split(' ').indexOf(choix.value) >= 0;
      c.hidden = !garde;
      n += garde;
      if (garde) visibles.push(c);
      // comme l'accueil (app.js) : l'étiquette du métier choisi passe en tête, les 2 premières restent visibles
      var ordre = c._tags.filter(function (t) { return t.dataset.m === choix.value; })
        .concat(c._tags.filter(function (t) { return t.dataset.m !== choix.value; }));
      ordre.forEach(function (t, i) { t.hidden = i >= 2; c._ancre.parentNode.insertBefore(t, c._ancre); });
      if (ordre.length > 2) c._ancre.title = ordre.slice(2).map(function (t) { return t.textContent; }).join(', ');
    });
    etat.textContent = n + (n > 1 ? ' marchés attribués' : ' marché attribué');
    majReperes(visibles);
  });
})();
