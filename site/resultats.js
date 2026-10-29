// Marchés attribués : filtre par métier (sans JS, la liste entière reste affichée)
(function () {
  var choix = document.getElementById('metier-res');
  var etat = document.getElementById('etat');
  var cartes = Array.prototype.slice.call(document.querySelectorAll('.avis-liste .avis'));
  choix.parentNode.hidden = false;
  choix.addEventListener('change', function () {
    var n = 0;
    cartes.forEach(function (c) {
      var garde = !choix.value || c.dataset.metiers.split(' ').indexOf(choix.value) >= 0;
      c.hidden = !garde;
      n += garde;
      // comme l'accueil (app.js) : l'étiquette du métier choisi passe en tête, les 2 premières restent visibles
      var tags = Array.prototype.slice.call(c.querySelectorAll('.metier[data-m]'));
      var ancre = c.querySelector('.autres') || c.querySelector('.dep');
      tags.filter(function (t) { return t.dataset.m === choix.value; }).concat(tags.filter(function (t) { return t.dataset.m !== choix.value; }))
        .forEach(function (t, i) { t.hidden = i >= 2; ancre.parentNode.insertBefore(t, ancre); });
    });
    etat.textContent = n + (n > 1 ? ' marchés attribués' : ' marché attribué');
  });
})();
