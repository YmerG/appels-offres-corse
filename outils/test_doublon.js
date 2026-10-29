// node outils/test_doublon.js : rapprochement d'un avis d'acheteur avec un avis du BOAMP (AOC_FB.doublon), sans navigateur
var assert = require('assert');
global.window = global;
global.location = { hostname: 'site.test', protocol: 'file:' };
if (typeof navigator === 'undefined') global.navigator = {};
require('../site/firebase-config.js');
var d = AOC_FB.doublon;
// avis d'acheteur comme dans Firestore (delai = Timestamp), avis BOAMP comme dans data.json (date_limite = texte)
function A(acheteur, titre, delai) { return { acheteur: acheteur, titre: titre, delai: delai && { toDate: function () { return new Date(delai); } } }; }
function B(acheteur, objet, dateLimite) { return { acheteur: acheteur, objet: objet, date_limite: dateLimite || '2026-11-16T12:00:00+01:00' }; }

var corte = A('Commune de Corte', 'Réfection de la voirie communale, tranche 2', '2026-11-16T18:00:00+01:00'); // même jour, autre heure
// même avis, écrit autrement au BOAMP
assert.ok(d(corte, B('COMMUNE DE CORTE', 'Travaux de réfection de voirie communale - Tranche 2')));
assert.ok(d(corte, B('Mairie de Corte', 'Voirie communale : réfection (tranche n°2)')));
// mots proches, autre date limite : un autre marché (rapport 50)
assert.ok(!d(corte, B('Commune de Corte', 'Travaux de réfection de voirie communale - Tranche 2', '2026-11-17T12:00:00+01:00')));
// autre acheteur, même objet : pas un doublon
assert.ok(!d(corte, B('Commune de Calvi', 'Réfection de la voirie communale, tranche 2')));
// même acheteur, autre marché
assert.ok(!d(corte, B('Commune de Corte', 'Fourniture de repas pour la cantine scolaire')));
assert.ok(!d(corte, B('Commune de Corte', 'Réfection de la toiture de la mairie')));
// cas réel du rapport 50 : même acheteur, mots voisins (« achat de pièces détachées »), autre date limite
assert.ok(!d(A('Collectivité de Corse', 'Achat de pièces détachées pour véhicules légers', '2026-11-27T12:00:00+01:00'),
  B('Collectivité de Corse', "Achat de pièces détachées d'origine (ou équivalent) pour les matériels de débroussaillement multimarques (2 lots) de la Collectivité de Corse")));
// les deux marchés Ametarra de data.json (expertise comptable / commissariat aux comptes) : distincts
var expertise = B('SPL AMETARRA', 'Accord cadre mono attributaire - Marché de service pour la mission d’expertise comptable, de déclarations fiscales et de gestion de la paie de la société publique locale SPL Ametarra', '2026-10-29T15:33:00+01:00');
assert.ok(!d(A('SPL Ametarra', 'Mission de commissariat aux comptes de la SPL Ametarra', '2026-10-30T16:16:00+01:00'), expertise));
// le vrai doublon reste repéré
assert.ok(d(A('SPL Ametarra', "Mission d'expertise comptable, déclarations fiscales et paie", '2026-10-29T15:33:00+01:00'), expertise));
// acheteur réduit à des mots courants, ou date absente : jamais rapproché
assert.ok(!d(A('Mairie', corte.titre, '2026-11-16T18:00:00+01:00'), B('Commune de Corte', corte.titre)));
assert.ok(!d(A('Commune de Corte', corte.titre), B('Commune de Corte', corte.titre)));
assert.ok(d(A('Communauté de communes du Centre Corse', 'Collecte des déchets ménagers', '2026-11-16T09:00:00+01:00'),
  B('CC du Centre Corse', 'Marché de collecte des déchets ménagers et assimilés')));
console.log('doublons : ok');
