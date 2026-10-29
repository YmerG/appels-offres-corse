// Devis (lot 20) : totaux et PDF. Le même code sert dans le navigateur (devis.html, compte.html : jsPDF, site/lib)
// et dans Node (outils/devis_pdf.js : le PDF joint à l'e-mail du destinataire) : un devis donne toujours le même PDF.
// Montants en centimes (entiers) ; TVA par ligne : 20, 10, 5,5 ou 0 %.
(function (racine) {
  var TAUX = [20, 10, 5.5, 0];
  var UNITES = ['u', 'h', 'j', 'm', 'm²', 'm³', 'ml', 'kg', 't', 'forfait', 'lot', 'ens.'];

  // une ligne lue dans Firestore n'est pas vérifiée champ par champ par les règles : on la remet en forme ici
  function ligne(l) {
    l = l || {};
    var q = Number(l.quantite), p = Math.round(Number(l.prix));
    return { designation: String(l.designation || '').slice(0, 300), quantite: isFinite(q) && q > 0 ? Math.min(q, 1e6) : 0,
      unite: UNITES.indexOf(l.unite) !== -1 ? l.unite : 'u', prix: isFinite(p) && p >= 0 ? Math.min(p, 1e10) : 0,
      tva: TAUX.indexOf(Number(l.tva)) !== -1 ? Number(l.tva) : 20 };
  }

  // { lignes (remises en forme, avec ht), ht, tva: [{ taux, base, montant }], ttc } ; TVA calculée par taux sur le total HT du taux
  function totaux(lignes, franchise) {
    var ls = (lignes || []).slice(0, 40).map(ligne);
    var parTaux = {};
    ls.forEach(function (l) {
      if (franchise) l.tva = 0;
      l.ht = Math.round(l.quantite * l.prix);
      parTaux[l.tva] = (parTaux[l.tva] || 0) + l.ht;
    });
    var tva = TAUX.filter(function (t) { return t in parTaux; }).map(function (t) {
      return { taux: t, base: parTaux[t], montant: Math.round(parTaux[t] * t / 100) };
    });
    var ht = ls.reduce(function (s, l) { return s + l.ht; }, 0);
    return { lignes: ls, ht: ht, tva: tva, ttc: ht + tva.reduce(function (s, t) { return s + t.montant; }, 0) };
  }

  // 123456 → « 1 234,56 € » (espaces simples : la police du PDF n'a pas l'espace fine)
  function euros(c) {
    var s = (Math.abs(c) / 100).toFixed(2).split('.');
    return (c < 0 ? '-' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + s[1] + ' €';
  }
  function taux(t) { return String(t).replace('.', ',') + ' %'; }
  function quantite(q) { return String(Math.round(q * 100) / 100).replace('.', ','); }
  function jour(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); }

  // polices de base du PDF (WinAnsi) : accents, €, « », ’ et œ passent ; le reste devient « ? »
  var WINANSI = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  function propre(s) {
    return String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\r/g, '')
      .replace(/[^\n\x20-\x7e\xa0-\xff]/g, function (c) { return WINANSI.indexOf(c) !== -1 ? c : '?'; });
  }

  // n° du devis : date et début de son identifiant (D20261029-AB12C), le même sur le site et dans l'e-mail
  function numero(date, id) {
    return 'D' + date.getFullYear() + ('0' + (date.getMonth() + 1)).slice(-2) + ('0' + date.getDate()).slice(-2) + '-' +
      String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
  }

  // d : le devis tel qu'il est rangé dans Firestore (devis/{id}), plus { id, date (Date) } ; emetteur { nom, siret, adresse, mentions?, assurance?, franchise? }, logo? (JPEG, Uint8Array),
  // decennale? { assureur, contrat?, fin }, client { nom, adresse }, titre (objet), lieu, lignes, validite (jours), debut?, duree?,
  // conditions?, frais (centimes, 0 : gratuit) } → document jsPDF
  function pdf(jsPDF, d) {
    var doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var G = 15, L = 180, D = G + L, y = 15, BAS = 280;
    var e = d.emetteur || {}, t = totaux(d.lignes, e.franchise), num = numero(d.date, d.id);
    doc.setProperties({ title: propre('Devis ' + num + ' - ' + e.nom), creator: "Appels d'offres Corse" });
    function police(taille, gras) { doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(taille); }
    function texte(s, x, larg, taille, gras, opt) {
      police(taille, gras);
      var lignes = doc.splitTextToSize(propre(s), larg);
      doc.text(lignes, x, y, opt || {});
      return lignes.length * taille * 0.42;
    }
    function place(h) { if (y + h > BAS) { doc.addPage(); y = 15; } }

    // en-tête : l'entreprise à gauche (logo, nom, adresse, SIRET, mentions), le devis à droite
    var yG = y;
    if (d.logo && d.logo.length) {
      try {
        var p = doc.getImageProperties(d.logo);
        var h = Math.min(20, 50 * p.height / p.width), w = h * p.width / p.height;
        doc.addImage(d.logo, 'JPEG', G, y, w, h);
        y += h + 3;
      } catch (x) { /* logo illisible : devis sans logo */ }
    }
    y += 4;
    y += texte(e.nom, G, 100, 12, true);
    y += texte(e.adresse, G, 100, 9);
    y += texte('SIRET ' + String(e.siret || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4'), G, 100, 9);
    if (e.mentions) y += texte(e.mentions, G, 100, 8);
    var yE = y;
    y = yG + 4;
    texte('DEVIS', D, 70, 20, true, { align: 'right' });
    y += 8;
    texte('N° ' + num, D, 70, 10, true, { align: 'right' });
    y += 5;
    texte('Date : ' + jour(d.date), D, 70, 9, false, { align: 'right' });
    y += 4.5;
    var fin = new Date(d.date.getTime() + (d.validite || 30) * 864e5);
    texte('Valable ' + (d.validite || 30) + ' jours, jusqu’au ' + jour(fin), D, 70, 9, false, { align: 'right' });
    // client : cadre à droite
    y += 8;
    var c = d.client || {}, hc = 6 + doc.splitTextToSize(propre(c.nom + '\n' + c.adresse), 66).length * 4.2;
    doc.setDrawColor(150);
    doc.roundedRect(D - 72, y - 5, 72, hc + 2, 2, 2);
    texte('Client', D - 69, 66, 8, true);
    y += 4.5;
    y += texte(c.nom, D - 69, 66, 10, true);
    y += texte(c.adresse, D - 69, 66, 9);
    y = Math.max(y + 6, yE + 6);

    // objet, lieu, dates
    y += texte('Objet : ' + d.titre, G, L, 10, true) + 1;
    y += texte('Lieu d’exécution : ' + d.lieu, G, L, 9);
    y += texte('Début des travaux : ' + (d.debut || 'à convenir') + ' · Durée estimée : ' + (d.duree || 'à convenir'), G, L, 9) + 3;

    // lignes : Désignation | Qté | Unité | PU HT | TVA | Total HT
    var COL = [G + 2, 122, 126, 160, 172, D - 2];
    function entete() {
      doc.setFillColor(235, 238, 242);
      doc.rect(G, y - 4.5, L, 7, 'F');
      police(8.5, true);
      doc.text('Désignation', COL[0], y);
      doc.text('Qté', COL[1], y, { align: 'right' });
      doc.text('Unité', COL[2], y);
      doc.text('PU HT', COL[3], y, { align: 'right' });
      doc.text('TVA', COL[4], y, { align: 'right' });
      doc.text('Total HT', COL[5], y, { align: 'right' });
      y += 7;
    }
    entete();
    t.lignes.forEach(function (l) {
      police(9);
      var des = doc.splitTextToSize(propre(l.designation), 102);
      var h = des.length * 3.9 + 2.5;
      if (y + h > BAS) { doc.addPage(); y = 15; entete(); police(9); }
      doc.text(des, COL[0], y);
      doc.text(quantite(l.quantite), COL[1], y, { align: 'right' });
      doc.text(propre(l.unite), COL[2], y);
      doc.text(propre(euros(l.prix)), COL[3], y, { align: 'right' });
      doc.text(taux(l.tva), COL[4], y, { align: 'right' });
      doc.text(propre(euros(l.ht)), COL[5], y, { align: 'right' });
      y += h - 3.9;
      doc.setDrawColor(220);
      doc.line(G, y - 1, D, y - 1);
      y += 3.9;
    });

    // totaux, à droite
    place(12 + t.tva.length * 5);
    y += 2;
    function total(nom, val, gras) {
      police(gras ? 11 : 9.5, gras);
      doc.text(propre(nom), 160, y, { align: 'right' });
      doc.text(propre(val), D - 2, y, { align: 'right' });
      y += gras ? 6 : 5;
    }
    total('Total HT', euros(t.ht));
    if (!e.franchise) t.tva.forEach(function (x) { total('TVA ' + taux(x.taux) + ' sur ' + euros(x.base), euros(x.montant)); });
    total('Total TTC', euros(t.ttc), true);
    y += 3;

    // mentions : TVA, taux horaire, devis gratuit ou payant, assurance, conditions
    var m = [];
    if (e.franchise) m.push('TVA non applicable, article 293 B du CGI.');
    t.lignes.filter(function (l) { return l.unite === 'h'; }).forEach(function (l) {
      m.push('Taux horaire de main-d’œuvre : ' + euros(Math.round(l.prix * (1 + l.tva / 100))) + ' TTC (' + l.designation.slice(0, 60) + ').');
    });
    m.push(d.frais > 0 ? 'Devis payant : ' + euros(d.frais) + ' TTC.' : 'Devis gratuit.');
    var dec = d.decennale;
    // une seule ligne : la décennale du compte, puis les coordonnées de l'assureur et la zone couverte tapées dans l'en-tête
    var assur = dec && dec.assureur ? 'Assurance décennale : ' + dec.assureur + (dec.contrat ? ', contrat ' + dec.contrat : '') +
      (dec.fin ? ', valable jusqu’au ' + jour(new Date(dec.fin + 'T12:00')) : '') + '.' : e.assurance ? 'Assurance :' : '';
    if (e.assurance) assur += ' Coordonnées de l’assureur et zone couverte : ' + e.assurance;
    if (assur) m.push(assur);
    if (d.conditions) m.push(d.conditions);
    m.forEach(function (s) {
      police(8.5);
      var h = doc.splitTextToSize(propre(s), L).length * 3.6;
      place(h);
      y += texte(s, G, L, 8.5) + 1;
    });

    // bon pour accord
    place(38);
    y += 4;
    doc.setDrawColor(150);
    doc.roundedRect(D - 90, y - 4, 90, 32, 2, 2);
    texte('Bon pour accord', D - 87, 80, 9, true);
    y += 4.5;
    texte('Mention manuscrite « Devis reçu avant l’exécution des travaux, bon pour accord », date et signature du client :', D - 87, 84, 8);

    // pied de chaque page
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      police(7.5);
      doc.setTextColor(110);
      doc.text(propre('Devis ' + num + ' · ' + e.nom + ' · page ' + i + '/' + n), G, 290);
      doc.text("Établi avec Appels d'offres Corse", D, 290, { align: 'right' });
      doc.setTextColor(0);
    }
    return doc;
  }

  // navigateur : le PDF téléchargé (jsPDF chargé par site/lib/jspdf.umd.min.js)
  function telecharger(d) {
    pdf(racine.jspdf.jsPDF, d).save('devis-' + numero(d.date, d.id) + '.pdf');
  }

  racine.AOC_DEVIS = { TAUX: TAUX, UNITES: UNITES, totaux: totaux, euros: euros, numero: numero, pdf: pdf, telecharger: telecharger };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
