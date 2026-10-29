// Appels d'offres Corse : avis clos retirés, compte à rebours, onglets (public / exemples privés), recherche, filtres métier et département, tri.
(function () {
  // après « Se déconnecter » (index.html?deconnecte) : message, puis adresse nettoyée pour qu'un rechargement ne le remontre pas
  if (/[?&]deconnecte\b/.test(location.search)) {
    try { localStorage.removeItem('aoc-mes-metiers'); } catch (e) { /* rien de gardé */ }
    document.getElementById('deconnecte').textContent = 'Déconnexion réussie. Pour publier ou répondre, reconnectez-vous depuis « Compte ».';
    history.replaceState(null, '', location.pathname + location.hash);
  }
  var liste = document.getElementById('avis');
  var q = document.getElementById('q');
  var tri = document.getElementById('tri');
  var etat = document.getElementById('etat');
  var vide = document.getElementById('vide');
  var bandeau = document.getElementById('bandeau');
  var publier = document.getElementById('publier');
  // « Mes métiers » : métiers et zone d'une entreprise, gardés par compte.js quand elle ouvre son compte sur ce navigateur
  var mes = null;
  try { mes = JSON.parse(localStorage.getItem('aoc-mes-metiers')); } catch (e) { /* navigation privée */ }
  var boutonMes = document.querySelector('.filtre[data-mes]'); // absent : ancienne page encore en cache
  if (boutonMes && mes && mes.metiers && mes.metiers.length && mes.zone) {
    boutonMes.hidden = false;
    if (mes.zone.length === 1) boutonMes.firstChild.textContent = 'Mes métiers en ' + mes.zone[0] + ' ';
  } else if (boutonMes) {
    boutonMes.remove(); // sans profil, #mes=1 dans l'adresse est ignoré
    boutonMes = null;
  }
  function dansMes(c) {
    return mes.zone.indexOf(c.dataset.dep) !== -1 && c._metiers.some(function (m) { return mes.metiers.indexOf(m) !== -1; });
  }
  var filtres = Array.prototype.slice.call(document.querySelectorAll('.filtre'));
  var taille = document.getElementById('taille'); // absent : ancienne page encore en cache
  var CLES = ['onglet', 'metier', 'dep', 'suivi', 'taille', 'mes'];
  var DEFAUT = { onglet: 'public', metier: '', dep: '', suivi: '', taille: '', mes: '' };
  var choix = { onglet: 'public', metier: '', dep: '', suivi: '', taille: '', mes: '' };
  var JOUR = 864e5;
  var maintenant = new Date();
  var aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());

  function normal(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function cle(b) { return CLES.filter(function (k) { return k in b.dataset; })[0]; }

  // Mémoire du navigateur seulement (rien n'est envoyé) : avis suivis et jour de la visite précédente
  function lire(k, defaut) { try { return JSON.parse(localStorage.getItem(k)) || defaut; } catch (e) { return defaut; } }
  function ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* navigation privée : rien gardé */ } }
  // shortcut: les avis clos restent dans la liste (quelques octets chacun), à nettoyer si elle grossit vraiment
  var suivis = lire('aoc-suivis', []);
  var jour = new Date(maintenant - maintenant.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  var visite = lire('aoc-visite', {});
  if (visite.jour !== jour) { visite = { avant: visite.jour, jour: jour }; ecrire('aoc-visite', visite); }

  // Fichier agenda (.ics) : la date limite, avec un rappel 2 jours avant
  function ics(c) {
    function t(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }
    function txt(s) { return s.replace(/[\\;,]/g, '\\$&').replace(/\s+/g, ' ').trim(); }
    var fin = new Date(c.dataset.limite), lien = c.querySelector('h3 a') || c.querySelector('.interesse a[href^="interesse"]');
    var lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//Appels d'offres Corse//FR", 'BEGIN:VEVENT',
      'UID:' + c.dataset.id + '@appels-offres-corse', 'DTSTAMP:' + t(new Date()),
      'DTSTART:' + t(new Date(fin - 36e5)), 'DTEND:' + t(fin),
      'SUMMARY:' + txt('Date limite : ' + c.querySelector('h3').textContent),
      'DESCRIPTION:' + txt(c.querySelector('.acheteur').textContent + ' : ' + (lien ? lien.href : location.href.split('#')[0])),
      'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', 'DESCRIPTION:Date limite dans 2 jours', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'];
    // lignes courtes (75 octets au plus, accents compris), la suite commence par une espace (norme iCalendar)
    return lignes.map(function (l) { return l.match(/.{1,60}/g).join('\r\n '); }).join('\r\n') + '\r\n';
  }
  function boutonsActions(c) {
    if (!c.dataset.id) return;
    var p = c.querySelector('.actions');
    if (!p) { p = document.createElement('p'); p.className = 'actions'; c.querySelector('.corps').appendChild(p); }
    var titre = c.querySelector('h3').textContent;
    var suivre = document.createElement('button');
    suivre.type = 'button'; suivre.className = 'action suivre';
    suivre.setAttribute('aria-label', 'Suivre : ' + titre);
    var deja = suivis.indexOf(c.dataset.id) !== -1;
    suivre.textContent = deja ? 'Suivi' : 'Suivre';
    suivre.setAttribute('aria-pressed', String(deja));
    var agenda = document.createElement('button');
    agenda.type = 'button'; agenda.className = 'action agenda'; agenda.textContent = 'Agenda';
    agenda.setAttribute('aria-label', 'Ajouter la date limite à mon agenda : ' + titre);
    p.insertBefore(agenda, p.firstChild);
    p.insertBefore(suivre, p.firstChild);
    if (c.dataset.source !== 'public') return;
    // groupement : l'admin met en relation les entreprises qui cherchent un partenaire sur le même avis (partenaire.html)
    var partenaire = document.createElement('a');
    partenaire.className = 'action partenaire'; partenaire.textContent = 'Partenaire';
    partenaire.href = 'partenaire.html?a=' + encodeURIComponent(c.dataset.id);
    partenaire.setAttribute('aria-label', 'Chercher un partenaire pour : ' + titre);
    p.appendChild(partenaire);
  }

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
    if (visite.avant && c.dataset.publie > visite.avant && !c.querySelector('.exemple')) {
      var n = document.createElement('span'); n.className = 'nouveau'; n.textContent = 'Nouveau';
      c.querySelector('.haut').insertBefore(n, c.querySelector('.haut').firstChild);
    }
    boutonsActions(c);
    return true;
  }
  var cartes = Array.prototype.slice.call(liste.querySelectorAll('.avis')).filter(preparer);
  function de(source) { return cartes.filter(function (c) { return c.dataset.source === source; }); }
  // l'en-tête ne compte que les marchés publics réels
  var publics = de('public');
  document.getElementById('nb-total').textContent = publics.length;
  document.getElementById('nb-semaine').textContent = publics.filter(function (c) { return c.classList.contains('urgent'); }).length;
  // chiffres de l'en-tête : ils montent jusqu'à leur valeur en 0,9 s (pas si « réduire les animations » est demandé)
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelectorAll('.chiffres strong').forEach(function (el) {
    var n = +el.textContent, debut = performance.now();
    if (!(n > 0)) return;
    (function pas(t) {
      var p = Math.min(1, (t - debut) / 900);
      el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(pas);
    })(debut);
  });
  function compterOnglets() {
    filtres.forEach(function (b) { if (b.dataset.onglet) b.querySelector('.nb').textContent = de(b.dataset.onglet).length; });
  }
  compterOnglets();

  // compteurs des métiers pour l'onglet affiché ; un métier absent de l'onglet est caché (sauf s'il est choisi)
  function compter() {
    var ici = de(choix.onglet);
    var nbSuivis = cartes.filter(function (c) { return suivis.indexOf(c.dataset.id) !== -1; }).length;
    boutonSuivis.querySelector('.nb').textContent = nbSuivis;
    boutonSuivis.hidden = !nbSuivis && !choix.suivi;
    if (boutonMes) boutonMes.querySelector('.nb').textContent = ici.filter(dansMes).length;
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
    // vue « Mes avis suivis » : tous onglets confondus, donc ni onglet marqué ni bandeau des exemples
    bandeau.hidden = choix.onglet === 'public' || !!choix.suivi;
    document.getElementById('autres-sources').hidden = choix.onglet !== 'public' || !!choix.suivi;
    filtres.forEach(function (b) { if (b.dataset.onglet) b.setAttribute('aria-pressed', String(!choix.suivi && b.dataset.onglet === choix.onglet)); });
    // avec « Mes métiers », ni « Tous les métiers » ni « Tous » (départements) ne sont marqués
    filtres.forEach(function (b) { var k = cle(b); if (k === 'metier' || k === 'dep') b.setAttribute('aria-pressed', String(!choix.mes && b.dataset[k] === choix[k])); });
    publier.href = 'publier.html?type=' + choix.onglet;
    cartes.forEach(function (c) {
      // « Mes avis suivis » montre les avis suivis de tous les onglets
      var ok = (choix.suivi ? suivis.indexOf(c.dataset.id) !== -1 : c.dataset.source === choix.onglet) &&
        (!choix.metier || c._metiers.indexOf(choix.metier) !== -1) &&
        (!choix.mes || dansMes(c)) &&
        (!choix.dep || c.dataset.dep === choix.dep) &&
        // taille : avis du BOAMP seulement (les demandes privées n'en ont pas)
        (!choix.taille || c.dataset.source !== 'public' || c.dataset.taille === choix.taille) &&
        mots.every(function (m) { return c._texte.indexOf(m) !== -1; });
      c.hidden = !ok;
      if (ok) n++;
      // le métier filtré passe en tête de la carte (sinon il peut être caché derrière « +3 »)
      var ordre = c._tags.filter(function (t) { return t.dataset.m === choix.metier; })
        .concat(c._tags.filter(function (t) { return t.dataset.m !== choix.metier; }));
      ordre.forEach(function (t, i) { t.hidden = i >= 2; c._ancre.parentNode.insertBefore(t, c._ancre); });
      if (ordre.length > 2) c._ancre.title = ordre.slice(2).map(function (t) { return t.textContent; }).join(', ');
    });
    if (taille) document.getElementById('bloc-taille').hidden = choix.onglet !== 'public' && !choix.suivi;
    var filtre = mots.length || choix.metier || choix.dep || (choix.taille && (choix.onglet === 'public' || choix.suivi));
    var ex = cartes.filter(function (c) { return !c.hidden && c.querySelector('.exemple'); }).length;
    etat.textContent = choix.suivi ? n + (n > 1 ? ' avis suivis' : ' avis suivi') : n + ' avis ' + (choix.mes ? 'dans vos métiers' : filtre ? (n > 1 ? 'trouvés' : 'trouvé') : choix.onglet === 'public' ? 'en cours'
      : ex === n ? "d'exemple" : 'en cours' + (ex ? ', dont ' + ex + " d'exemple" : ''));
    vide.hidden = n > 0;
    // l'adresse garde le choix : un artisan peut l'enregistrer (#onglet=prive&metier=electricite&dep=2B)
    var h = CLES.filter(function (k) { return choix[k] !== DEFAUT[k]; }).map(function (k) { return k + '=' + choix[k]; }).join('&');
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }

  function choisir(k, valeur) {
    choix[k] = valeur;
    filtres.forEach(function (x) { if (cle(x) === k) x.setAttribute('aria-pressed', String(x.dataset[k] === valeur)); });
    if (k === 'taille' && taille) taille.value = valeur;
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

  // une colonne (téléphone) : la liste est sous les filtres, on l'amène à l'écran après « Mes métiers » (rapport 35)
  function versListe(comment) {
    if (!matchMedia('(max-width: 899px)').matches) return;
    etat.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : comment });
  }
  var boutonSuivis = document.querySelector('.filtre[data-suivi]');
  filtres.forEach(function (b) {
    b.addEventListener('click', function () {
      var k = cle(b);
      choisir(k, (k === 'suivi' || k === 'mes') && choix[k] ? '' : b.dataset[k]);
      if (k === 'onglet') choisir('suivi', '');
      // « Mes métiers » remplace le choix du métier et du département (et inversement), et ne se combine pas avec les suivis
      if (k === 'mes' && choix.mes) { choisir('metier', ''); choisir('dep', ''); choisir('suivi', ''); }
      if (k === 'metier' || k === 'dep' || (k === 'suivi' && choix.suivi)) choisir('mes', '');
      appliquer();
      if (k === 'mes' && choix.mes) versListe('smooth');
    });
  });
  liste.addEventListener('click', function (e) {
    var b = e.target.closest('.action'), c = b && b.closest('.avis');
    if (!c || b.tagName !== 'BUTTON') return;
    if (b.classList.contains('suivre')) {
      var oui = b.getAttribute('aria-pressed') !== 'true';
      suivis = suivis.filter(function (id) { return id !== c.dataset.id; }).concat(oui ? [c.dataset.id] : []);
      ecrire('aoc-suivis', suivis);
      b.setAttribute('aria-pressed', String(oui));
      b.textContent = oui ? 'Suivi' : 'Suivre';
      compter();
      // vue « Mes avis suivis » : la carte reste affichée (le bouton garde le focus), le compte suit
      if (choix.suivi) {
        var n = cartes.filter(function (x) { return !x.hidden && suivis.indexOf(x.dataset.id) !== -1; }).length;
        etat.textContent = n + (n > 1 ? ' avis suivis' : ' avis suivi');
      }
    } else if (b.classList.contains('agenda')) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics(c)], { type: 'text/calendar;charset=utf-8' }));
      a.download = 'date-limite-' + c.dataset.id + '.ics';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
  });
  q.addEventListener('input', appliquer);
  tri.addEventListener('change', trier);
  if (taille) taille.addEventListener('change', function () { choisir('taille', taille.value); appliquer(); });
  document.getElementById('effacer').addEventListener('click', function () {
    q.value = '';
    choisir('metier', '');
    choisir('dep', '');
    choisir('suivi', '');
    choisir('taille', '');
    choisir('mes', '');
    appliquer();
    etat.focus();
  });

  // Vue compacte (choix gardé dans ce navigateur)
  var vue = document.getElementById('vue');
  function compacte(oui) {
    liste.classList.toggle('compacte', oui);
    vue.setAttribute('aria-pressed', String(oui));
  }
  if (vue) compacte(lire('aoc-vue', '') === 'compacte'); // vue absente : ancienne page encore en cache
  if (vue) vue.addEventListener('click', function () {
    var oui = vue.getAttribute('aria-pressed') !== 'true';
    compacte(oui);
    ecrire('aoc-vue', oui ? 'compacte' : '');
  });

  // Ligne des métiers sur téléphone : le bouton qui reçoit le focus clavier est recalé entier dans la ligne
  document.querySelector('.metiers').addEventListener('focusin', function (e) { e.target.scrollIntoView({ inline: 'nearest', block: 'nearest' }); });

  // Lien direct, à l'ouverture comme sur une page déjà ouverte (favori, lien collé)
  function depuisAdresse() {
    CLES.forEach(function (k) { choisir(k, DEFAUT[k]); });
    location.hash.slice(1).split('&').forEach(function (p) {
      var kv = p.split('=');
      var v = CSS.escape(kv[1] || '');
      var connu = kv[0] === 'taille' ? taille && taille.querySelector('option[value="' + v + '"]') : document.querySelector('.filtre[data-' + kv[0] + '="' + v + '"]');
      if (CLES.indexOf(kv[0]) !== -1 && connu) choisir(kv[0], kv[1]);
    });
    // même règle qu'au toucher : « Mes métiers » remplace métier, département et suivis (adresse écrite à la main, rapport 35)
    if (choix.mes) { choisir('metier', ''); choisir('dep', ''); choisir('suivi', ''); }
    appliquer();
  }
  window.addEventListener('hashchange', depuisAdresse);
  depuisAdresse();
  if (choix.mes) versListe('auto'); // arrivée par « Mes appels d'offres » (compte) ou un favori #mes=1

  // Demandes publiées par les visiteurs (demandes.js, après la lecture sur Firestore) : ajoutées puis triées et filtrées comme les autres
  window.ajouterAvis = function (nouvelles) {
    nouvelles.forEach(function (c) { if (preparer(c)) cartes.push(c); });
    compterOnglets();
    trier();
    appliquer();
  };
})();
