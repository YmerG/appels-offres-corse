// node outils/test_communes.js : recherche d'une commune (communes.js), sans navigateur
var assert = require('assert');
global.window = global;
global.document = { createElement: function () { return { append: function () {} }; }, body: { append: function () {} } };
require('../site/communes.js');

assert.deepStrictEqual(AOC_COMMUNE('aleria'), ['Aléria', '2B']);
assert.deepStrictEqual(AOC_COMMUNE(' Ville di Paraso '), ['Ville-di-Paraso', '2B']);
assert.deepStrictEqual(AOC_COMMUNE('AJACCIO'), ['Ajaccio', '2A']);
assert.deepStrictEqual(AOC_COMMUNE('Ile Rousse'), ["L'Île-Rousse", '2B']);
assert.deepStrictEqual(AOC_COMMUNE('l’ile-rousse'), ["L'Île-Rousse", '2B']);
assert.deepStrictEqual(AOC_COMMUNE('St Florent'), ['Saint-Florent', '2B']);
assert.deepStrictEqual(AOC_COMMUNE('ste lucie de tallano'), ['Sainte-Lucie-de-Tallano', '2A']);
// pas des communes : le département doit être choisi à la main
assert.strictEqual(AOC_COMMUNE('Porticcio'), null);
assert.strictEqual(AOC_COMMUNE('Cap Corse'), null);
assert.strictEqual(AOC_COMMUNE('Paris'), null);
assert.strictEqual(AOC_COMMUNE(''), null);
// chaque commune se retrouve elle-même : deux communes ne se confondent pas une fois la saisie simplifiée
AOC_COMMUNES.forEach(function (c) { assert.strictEqual(AOC_COMMUNE(c[0])[0], c[0]); });
console.log('communes : ok (' + AOC_COMMUNES.length + ')');
