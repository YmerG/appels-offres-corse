// node outils/test_devis.js : totaux du devis (lot 20) et PDF fabriqué par outils/devis_pdf.js, sans réseau.
var assert = require('assert');
var path = require('path');
var cp = require('child_process');
var D = require(path.join(__dirname, '..', 'site', 'devis-pdf.js')).AOC_DEVIS;

// TVA par taux, sur le total HT de chaque taux ; quantités décimales arrondies au centime
var t = D.totaux([
  { designation: 'Pose carrelage', quantite: 12.5, unite: 'm²', prix: 4500, tva: 10 },
  { designation: 'Main-d’œuvre', quantite: 3, unite: 'h', prix: 4000, tva: 10 },
  { designation: 'Fourniture', quantite: 1, unite: 'forfait', prix: 33333, tva: 20 },
  { designation: 'Isolation', quantite: 2, unite: 'm²', prix: 1001, tva: 5.5 }
]);
assert.strictEqual(t.ht, 56250 + 12000 + 33333 + 2002);
assert.deepStrictEqual(t.tva.map(function (x) { return [x.taux, x.base, x.montant]; }), [[20, 33333, 6667], [10, 68250, 6825], [5.5, 2002, 110]]);
assert.strictEqual(t.ttc, t.ht + 6667 + 6825 + 110);
// franchise en base (293 B) : aucune TVA
assert.strictEqual(D.totaux([{ quantite: 2, prix: 1000, tva: 20 }], true).ttc, 2000);
// ligne abîmée (les règles ne vérifient pas chaque ligne) : remise en forme, jamais NaN
var abime = D.totaux([{ designation: 'x'.repeat(500), quantite: 'abc', unite: '<b>', prix: -5, tva: 7 }]);
assert.deepStrictEqual([abime.lignes[0].designation.length, abime.lignes[0].unite, abime.lignes[0].tva, abime.ttc], [300, 'u', 20, 0]);
assert.strictEqual(D.euros(123456789), '1 234 567,89 €');
assert.strictEqual(D.euros(5), '0,05 €');
assert.strictEqual(D.numero(new Date(2026, 9, 29), 'ab-12cd_xyz'), 'D20261029-AB12C');

// PDF par le script de l'e-mail : un vrai PDF, accents et € compris, plusieurs pages si beaucoup de lignes
var devis = { id: 'ab12cd_xyz', date: '2026-10-29T10:00:00Z', validite: 30, titre: 'Rénovation salle de bains', lieu: 'Corte (2B)',
  emetteur: { nom: 'Plomberie Test SARL', siret: '12345678000014', adresse: '1 rue de l’Église, 20250 Corte', mentions: 'SARL au capital de 10 000 €', assurance: 'Mutuelle Test, Paris, France' },
  decennale: { assureur: 'Mutuelle Test', fin: '2027-06-30' }, client: { nom: 'Demandeur', adresse: 'Corte' }, frais: 0,
  lignes: Array.from({ length: 35 }, function (_, i) { return { designation: 'Poste n° ' + (i + 1) + ' : dépose, évacuation des déchets', quantite: 1, unite: 'u', prix: 10000, tva: 10 }; }),
  logo: 'pas-un-jpeg' };
var sortie = cp.execFileSync('node', [path.join(__dirname, 'devis_pdf.js')], { input: JSON.stringify(devis) });
assert.strictEqual(sortie.slice(0, 5).toString(), '%PDF-');
assert.ok(sortie.length > 3000 && sortie.length < 200000, sortie.length);
assert.ok(/\/Count 2/.test(sortie.toString('latin1')), '2 pages');
// coordonnées de l'assureur sur la même ligne que la décennale (rapport 52)
assert.ok(/Assurance d.cennale : Mutuelle Test, valable jusqu.au 30\/06\/2027\. Coordonn.es de l.assureur et zone couverte : Mutuelle Test, Paris, France/
  .test(sortie.toString('latin1').replace(/\) Tj[\s\S]*?\(/g, ' ')), 'assurance');
console.log('devis : ok');
