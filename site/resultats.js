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
    });
    etat.textContent = n + (n > 1 ? ' marchés attribués' : ' marché attribué');
  });
})();
