#!/usr/bin/env node
// Devis (lot 20) : refait le PDF d'un devis avec le même code que le site (site/devis-pdf.js + site/lib/jspdf),
// pour la pièce jointe de l'e-mail (outils/envoyer_emails.py). Aucune dépendance à installer.
// Entrée (JSON, sur l'entrée standard) : le devis, avec date en texte ISO et logo en base64 ; sortie : le PDF.
//   node outils/devis_pdf.js < devis.json > devis.pdf
var path = require('path');
var site = path.join(__dirname, '..', 'site');
var jsPDF = require(path.join(site, 'lib', 'jspdf.umd.min.js')).jsPDF;
var AOC_DEVIS = require(path.join(site, 'devis-pdf.js')).AOC_DEVIS;

function lire(cb) {
  var morceaux = [];
  process.stdin.on('data', function (m) { morceaux.push(m); });
  process.stdin.on('end', function () { cb(JSON.parse(Buffer.concat(morceaux).toString('utf8'))); });
}

lire(function (d) {
  d.date = new Date(d.date);
  // logo : JPEG seulement (réencodé par le navigateur à l'envoi) ; autre chose : devis sans logo
  var logo = d.logo ? Buffer.from(d.logo, 'base64') : null;
  d.logo = logo && logo[0] === 0xff && logo[1] === 0xd8 ? new Uint8Array(logo) : null;
  process.stdout.write(Buffer.from(AOC_DEVIS.pdf(jsPDF, d).output('arraybuffer')));
});
