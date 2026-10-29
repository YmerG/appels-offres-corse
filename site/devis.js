// Créer un devis (lot 20) : tout compte Entreprise connecté, depuis une carte (demande Privé / Particuliers : ?d=<id> ;
// avis BOAMP : ?a=<n° d'avis>). PDF fait dans le navigateur (devis-pdf.js), toujours téléchargeable.
// Envoi direct (devis/{demande}_{uid}, un seul) : demande Privé / Particuliers à laquelle l'entreprise a répondu, ou avis
// d'acheteur public qui accepte les devis par le site (moins de 40 000 € HT) ; les règles Firestore l'imposent aussi.
// Avis BOAMP, ou marché qui n'accepte pas les devis : « Déposer sur la plateforme officielle » et les pièces souvent demandées.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var form = $('form'), texte = $('demande-texte'), lignes = $('lignes'), envoyer = $('envoyer');
  var q = new URLSearchParams(location.search), id = q.get('d') || '', boamp = q.get('a') || '';
  var SEUIL = 40000; // € HT : au-delà, pas d'envoi par le site (règles Firestore : la même valeur)
  var m, f, dem, logo = null; // logo : JPEG (Uint8Array)

  function br() { return document.createElement('br'); }
  function dire(msg, champ) {
    if (champ) return AOC_FB.sous(champ, msg);
    $('erreur').textContent = msg;
    $('erreur').hidden = !msg;
  }
  function plateforme(lien) {
    $('plateforme').hidden = false;
    if (lien) $('plateforme-lien').href = lien;
    else $('plateforme-lien').parentNode.hidden = true;
  }
  function jour(d) { return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }

  // --- Lignes : désignation, quantité, unité, prix unitaire HT, TVA ; totaux recalculés à chaque frappe
  var n = 0;
  function ajouter(l) {
    l = l || {};
    var k = ++n, div = document.createElement('div');
    div.className = 'ligne-devis';
    var opt = function (liste, choisi, nom) {
      return liste.map(function (x) { return '<option value="' + x + '"' + (x === choisi ? ' selected' : '') + '>' + (nom ? nom(x) : x) + '</option>'; }).join('');
    };
    div.innerHTML = '<label for="des' + k + '">Désignation</label><input id="des' + k + '" class="l-des" maxlength="300" required>' +
      '<div class="l-chiffres"><div><label for="qte' + k + '">Quantité</label><input id="qte' + k + '" class="l-qte" type="number" inputmode="decimal" min="0" step="any" value="1"></div>' +
      '<div><label for="uni' + k + '">Unité</label><select id="uni' + k + '" class="l-uni">' + opt(AOC_DEVIS.UNITES, l.unite || 'u') + '</select></div>' +
      '<div><label for="pu' + k + '">Prix unitaire HT (€)</label><input id="pu' + k + '" class="l-pu" type="number" inputmode="decimal" min="0" step="0.01"></div>' +
      '<div><label for="tva' + k + '">TVA</label><select id="tva' + k + '" class="l-tva">' +
      opt(AOC_DEVIS.TAUX.map(String), String(l.tva || 20), function (t) { return t.replace('.', ',') + ' %'; }) + '</select></div></div>' +
      '<p class="l-pied"><output class="l-total" for="qte' + k + ' pu' + k + '"></output><button type="button" class="lien-bouton l-retirer">Retirer la ligne</button></p>';
    if (l.designation) div.querySelector('.l-des').value = l.designation;
    lignes.append(div);
    calculer();
    return div;
  }
  function lues() {
    return Array.prototype.map.call(lignes.children, function (div) {
      return { designation: div.querySelector('.l-des').value.trim(), quantite: Number(div.querySelector('.l-qte').value) || 0,
        unite: div.querySelector('.l-uni').value, prix: Math.round((Number(div.querySelector('.l-pu').value) || 0) * 100),
        tva: Number(div.querySelector('.l-tva').value) };
    });
  }
  function calculer() {
    var franchise = form.franchise.checked, t = AOC_DEVIS.totaux(lues(), franchise);
    Array.prototype.forEach.call(lignes.children, function (div, i) {
      div.querySelector('.l-total').textContent = 'Total HT : ' + AOC_DEVIS.euros(t.lignes[i].ht);
      div.querySelector('.l-tva').disabled = franchise;
      div.querySelector('.l-retirer').hidden = lignes.children.length < 2;
    });
    var dl = $('totaux');
    dl.textContent = '';
    function ligne(nom, val, fort) {
      var d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = nom;
      dd.textContent = val;
      if (fort) d.className = 'fort';
      d.append(dt, dd);
      dl.append(d);
    }
    ligne('Total HT', AOC_DEVIS.euros(t.ht));
    if (franchise) ligne('TVA', 'non applicable (art. 293 B du CGI)');
    else t.tva.forEach(function (x) { ligne('TVA ' + String(x.taux).replace('.', ',') + ' %', AOC_DEVIS.euros(x.montant)); });
    ligne('Total TTC', AOC_DEVIS.euros(t.ttc), true);
    $('ajouter').hidden = lignes.children.length >= 40;
  }
  form.addEventListener('input', calculer);
  form.addEventListener('change', calculer);
  $('ajouter').onclick = function () { ajouter().querySelector('.l-des').focus(); };
  lignes.addEventListener('click', function (e) {
    if (!e.target.classList.contains('l-retirer')) return;
    var div = e.target.closest('.ligne-devis'), suivante = div.nextElementSibling || div.previousElementSibling;
    div.remove();
    calculer();
    if (suivante) suivante.querySelector('.l-des').focus();
  });

  // --- Logo : réduit ici en JPEG sur fond blanc (un PNG transparent deviendrait noir), 60 Ko au plus
  function reduire(fichier) {
    return createImageBitmap(fichier).then(function (img) {
      function essai(larg, qualite) {
        var k = Math.min(1, larg / img.width, larg * 0.4 / img.height);
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        var g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', qualite); }).then(function (b) {
          return b && b.size <= 60000 ? b.arrayBuffer() : larg > 200 ? essai(larg * 0.75, 0.75) : null;
        });
      }
      return essai(600, 0.85);
    });
  }
  function montrerLogo() {
    $('logo-etat').hidden = !logo;
    if (logo) $('logo-apercu').src = URL.createObjectURL(new Blob([logo], { type: 'image/jpeg' }));
  }
  form.logo.addEventListener('change', function () {
    var fichier = this.files[0];
    AOC_FB.sous(form.logo, '');
    if (!fichier) return;
    reduire(fichier).then(function (b) {
      if (!b) return AOC_FB.sous(form.logo, 'Ce logo est trop lourd : choisissez une image plus simple.');
      logo = new Uint8Array(b);
      montrerLogo();
    }, function () { AOC_FB.sous(form.logo, 'Cette image ne peut pas être lue : choisissez un JPEG ou un PNG.'); });
  });
  $('logo-retirer').onclick = function () { logo = null; form.logo.value = ''; montrerLogo(); form.logo.focus(); };

  // --- Le devis, tel qu'il est rangé dans Firestore (devis-pdf.js le lit tel quel) ; null : un champ est à corriger
  function lire() {
    AOC_FB.effacer(form);
    dire('');
    var v = function (n) { return (form[n].value || '').trim(); };
    if (v('adresse').length < 5) return AOC_FB.sous(form.adresse, 'Indiquez l’adresse de votre entreprise.'), null;
    if (v('client').length < 2) return AOC_FB.sous(form.client, 'Indiquez le nom du client.'), null;
    if (v('lieu').length < 2) return AOC_FB.sous(form.lieu, 'Indiquez le lieu d’exécution.'), null;
    var ls = lues(), vide = Array.prototype.find.call(lignes.children, function (div, i) { return !ls[i].designation || !(ls[i].quantite > 0); });
    if (vide) {
      var champ = vide.querySelector('.l-des').value.trim() ? vide.querySelector('.l-qte') : vide.querySelector('.l-des');
      return AOC_FB.sous(champ, champ.classList.contains('l-des') ? 'Écrivez la désignation de cette ligne.' : 'Indiquez une quantité plus grande que 0.'), null;
    }
    var validite = Number(v('validite'));
    if (!(validite >= 1 && validite <= 365 && validite % 1 === 0)) return AOC_FB.sous(form.validite, 'Indiquez une validité de 1 à 365 jours.'), null;
    var frais = Math.round((Number(v('frais')) || 0) * 100);
    if (frais < 0) return AOC_FB.sous(form.frais, 'Le coût du devis ne peut pas être négatif.'), null;
    var e = { nom: m.profil.nom, siret: m.profil.siret, adresse: v('adresse'), franchise: form.franchise.checked };
    if (v('mentions')) e.mentions = v('mentions');
    if (v('assurance')) e.assurance = v('assurance');
    var d = { demande: id, entreprise: m.user.uid, destinataire: dem ? dem.uid : '', titre: dem ? dem.titre : $('demande-titre').textContent,
      lieu: v('lieu'), emetteur: e, client: { nom: v('client') }, lignes: ls, validite: validite, frais: frais };
    if (v('client-adresse')) d.client.adresse = v('client-adresse');
    ['debut', 'duree', 'conditions'].forEach(function (k) { if (v(k)) d[k] = v(k); });
    if (m.profil.decennale) d.decennale = m.profil.decennale;
    if (logo) d.logo = logo;
    return d;
  }

  // en-tête gardé pour les prochains devis (entetes/{uid}) ; échec : sans conséquence pour ce devis
  function garderEntete(d) {
    if (!m.user.emailVerified) return;
    var e = { adresse: d.emetteur.adresse, franchise: d.emetteur.franchise, maj: f.fs.serverTimestamp() };
    if (d.emetteur.mentions) e.mentions = d.emetteur.mentions;
    if (d.emetteur.assurance) e.assurance = d.emetteur.assurance;
    if (logo) e.logo = f.fs.Bytes.fromUint8Array(logo);
    f.fs.setDoc(f.fs.doc(f.db, 'entetes', m.user.uid), e).catch(function (x) { console.warn('En-tête non gardé :', x && x.code); });
  }

  $('telecharger').onclick = function () {
    var d = lire();
    if (!d) return;
    garderEntete(d);
    AOC_DEVIS.telecharger(Object.assign({}, d, { id: (id || boamp) + '_' + m.user.uid, date: new Date() }));
  };

  var envoye = null; // devis envoyé (pour « Télécharger ce devis »)
  $('pdf-envoye').onclick = function () { AOC_DEVIS.telecharger(envoye); };
  function fini(d, deja) {
    envoye = d;
    form.hidden = true;
    if (deja) {
      $('merci-titre').textContent = 'Devis déjà envoyé';
      $('merci-texte').textContent = 'Vous avez envoyé votre devis le ' + jour(d.date) + '. Un seul devis par ' + (dem && dem.type === 'public' ? 'avis' : 'demande') + ' : pour le modifier, écrivez au destinataire' +
        (dem && dem.type !== 'public' ? ' dans votre discussion.' : '.');
    }
    $('merci').hidden = false;
    $('merci').focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = lire();
    if (!d) return;
    if (!confirm('Envoyer ce devis ? Un seul devis par demande : il ne pourra plus être modifié.')) return;
    envoyer.disabled = true;
    envoyer.textContent = 'Envoi…';
    garderEntete(d);
    var did = id + '_' + m.user.uid, data = Object.assign({}, d, { cree: f.fs.serverTimestamp() });
    if (logo) data.logo = f.fs.Bytes.fromUint8Array(logo);
    f.fs.setDoc(f.fs.doc(f.db, 'devis', did), data).then(function () {
      fini(Object.assign({}, d, { id: did, date: new Date() }));
    }, function (err) {
      console.warn('Devis refusé :', err && err.message);
      envoyer.disabled = false;
      envoyer.textContent = 'Envoyer le devis';
      dire(err && err.code === 'permission-denied'
        ? "Le devis n'a pas été accepté : la demande vient peut-être d'être pourvue, retirée ou close, ou vous avez déjà envoyé un devis. Vous pouvez toujours télécharger le PDF."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez dans un instant.");
    });
  });

  // --- Ouverture : compte Entreprise, puis la demande (Firestore) ou l'avis BOAMP (data.json), puis ce qui est possible
  function montrer(cible) {
    var h = $('demande-titre');
    h.textContent = cible.titre;
    h.hidden = false;
    texte.textContent = cible.info;
    form.client.value = cible.client;
    form.lieu.value = cible.lieu;
    var p = m.profil;
    $('e-ident').textContent = p.nom + ' · SIRET ' + p.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4') + ' (modifiables dans Compte)';
    var dec = p.decennale, ed = $('e-decennale');
    ed.textContent = dec ? 'Assurance décennale de votre compte, ajoutée au devis : ' + dec.assureur + ', jusqu’au ' +
        new Date(dec.fin + 'T12:00').toLocaleDateString('fr-FR') + '.'
      : 'Aucune assurance décennale déclarée : elle doit figurer sur les devis de travaux de construction. ';
    if (!dec) {
      var a = document.createElement('a');
      a.href = 'compte.html';
      a.textContent = 'L’ajouter dans Compte';
      ed.append(a);
    }
    ajouter();
    form.hidden = false;
    return f.fs.getDoc(f.fs.doc(f.db, 'entetes', m.user.uid)).then(function (s) {
      if (!s.exists()) return;
      var e = s.data();
      form.adresse.value = e.adresse;
      form.mentions.value = e.mentions || '';
      form.assurance.value = e.assurance || '';
      form.franchise.checked = e.franchise === true;
      if (e.logo) { logo = e.logo.toUint8Array(); montrerLogo(); }
      calculer();
    }, function (x) { console.warn('En-tête :', x && x.code); });
  }
  function possible(msg) {
    envoyer.hidden = false;
    envoyer.textContent = 'Envoyer le devis';
    $('envoi-aide').textContent = msg;
    $('envoi-aide').hidden = false;
  }

  AOC_FB.moi().then(function (r) {
    m = r;
    f = r.f;
    var adresse = boamp ? 'devis.html?a=' + boamp : 'devis.html?d=' + id;
    if (boamp ? !/^\d{2}-\d{1,7}$/.test(boamp) : !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw { code: 'not-found' };
    if (!m.user || !m.profil) { location.replace('compte.html?retour=' + encodeURIComponent(adresse)); throw { code: 'redirection' }; }
    if (m.profil.type !== 'entreprise') {
      texte.textContent = 'Les devis sont réservés aux comptes Entreprise de travaux. ';
      var a = document.createElement('a');
      a.href = 'compte.html';
      a.textContent = 'Mon compte';
      texte.append(a);
      throw { code: 'redirection' };
    }
    if (boamp) return fetch('data.json').then(function (rep) { return rep.json(); }).then(function (j) {
      var a = j.avis.filter(function (x) { return x.id === boamp; })[0];
      if (!a) throw { code: 'not-found' };
      var limite = new Date(a.date_limite);
      return montrer({ titre: a.objet, client: a.acheteur, lieu: a.lieu, info: a.acheteur + ' · avis BOAMP n° ' + a.id + ' · réponses avant le ' + jour(limite) +
        '. Les offres se déposent sur la plateforme de l’acheteur : le PDF se télécharge, il ne s’envoie pas d’ici.' }).then(function () {
        plateforme(a.dossier && a.dossier[0] || a.lien);
      });
    });
    return f.fs.getDoc(f.fs.doc(f.db, 'demandes', id)).then(function (s) {
      if (!s.exists()) throw { code: 'not-found' };
      dem = s.data();
      var pub = dem.type === 'public', limite = dem.delai.toDate();
      var info = (pub ? dem.acheteur : dem.type === 'particulier' ? 'Particulier' : 'Société') + ' · ' + dem.commune + ' (' + dem.departement + ') · réponses avant le ' + jour(limite);
      return montrer({ titre: dem.titre, client: pub ? dem.acheteur : 'Le demandeur', lieu: dem.commune + ' (' + dem.departement + ')', info: info + '.' }).then(function () {
        if (dem.uid === m.user.uid) return texte.append(br(), 'C’est votre propre demande : vous pouvez faire un PDF, pas l’envoyer.');
        if (pub && !(dem.devis && (dem.budget || 0) < SEUIL && limite > new Date())) {
          texte.append(br(), 'Cet acheteur reçoit les offres sur sa plateforme : le PDF se télécharge, il ne s’envoie pas d’ici.');
          return plateforme(dem.lien);
        }
        if (!m.user.emailVerified) return texte.append(br(), 'Vérifiez votre e-mail (lien reçu à l’inscription) pour pouvoir envoyer un devis.');
        if (!pub && dem.pourvue) return texte.append(br(), 'Le demandeur a trouvé son entreprise : le devis ne peut plus être envoyé.');
        return Promise.all([f.fs.getDoc(f.fs.doc(f.db, 'devis', id + '_' + m.user.uid)),
          pub ? null : f.fs.getDoc(f.fs.doc(f.db, 'demandes', id, 'interets', m.user.uid))]).then(function (r) {
          if (r[0].exists()) {
            var d = r[0].data();
            if (d.logo) d.logo = d.logo.toUint8Array();
            return fini(Object.assign(d, { id: r[0].id, date: d.cree.toDate() }), true);
          }
          if (pub) return possible('L’acheteur accepte les devis par le site : il le reçoit par e-mail avec le PDF. Un seul devis par avis.');
          if (!r[1].exists()) {
            var a = document.createElement('a');
            a.href = 'interesse.html?d=' + encodeURIComponent(id);
            a.textContent = 'Répondre à la demande';
            return texte.append(br(), 'Pour envoyer votre devis au demandeur, répondez d’abord à sa demande (« Je suis intéressé »), puis revenez ici. En attendant, vous pouvez télécharger le PDF. ', a);
          }
          possible('Le demandeur le reçoit par e-mail avec le PDF, et dans son compte. Un seul devis par demande.');
        });
      });
    });
  }).catch(function (e) {
    if (e && e.code === 'redirection') return;
    console.warn('Devis :', e && (e.message || e.code));
    texte.textContent = e && (e.code === 'not-found' || e.code === 'permission-denied')
      ? 'Cette demande est introuvable : elle a peut-être été retirée ou close. Revenez à la liste.'
      : 'La page ne peut pas être chargée. Vérifiez votre connexion et réessayez.';
  });
})();
