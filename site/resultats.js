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
  choix.parentNode.hidden = false;
  choix.addEventListener('change', function () {
    var n = 0;
    cartes.forEach(function (c) {
      var garde = !choix.value || c.dataset.metiers.split(' ').indexOf(choix.value) >= 0;
      c.hidden = !garde;
      n += garde;
      // comme l'accueil (app.js) : l'étiquette du métier choisi passe en tête, les 2 premières restent visibles
      var ordre = c._tags.filter(function (t) { return t.dataset.m === choix.value; })
        .concat(c._tags.filter(function (t) { return t.dataset.m !== choix.value; }));
      ordre.forEach(function (t, i) { t.hidden = i >= 2; c._ancre.parentNode.insertBefore(t, c._ancre); });
      if (ordre.length > 2) c._ancre.title = ordre.slice(2).map(function (t) { return t.textContent; }).join(', ');
    });
    etat.textContent = n + (n > 1 ? ' marchés attribués' : ' marché attribué');
  });
})();
