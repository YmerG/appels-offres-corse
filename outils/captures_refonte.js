// Captures de toutes les pages (téléphone 390 + ordinateur 1280, clair + sombre), sans serveur : site servi par page.route sur site.test,
// Firebase remplacé par un faux (compte Entreprise connecté, sans demande). Pour l'outil browser_run_code_unsafe de Playwright MCP.
// Préfixe des fichiers : window.__prefixe dans la page n'existe pas ici ; on le lit dans PREFIXE ci-dessous (à changer à chaque étape).
async (page) => {
  const PREFIXE = 'refonte-3';
  const racine = '/Users/remy/SitesWeb/AppelsOffresCorse/site';
  const dest = '/Users/remy/SitesWeb/AppelsOffresCorse/captures/';
  const ctx = page.context();
  await ctx.addInitScript(() => {
    var store = { 'users/u1': { type: 'entreprise', nom: 'Plomberie Test', siret: '12345678000014', metiers: ['plomberie-cvc', 'second-oeuvre'], zone: ['2B'], cree: 1, alertes: true } };
    var user = { uid: 'u1', email: 'ent@test.fr', emailVerified: true };
    var f = { auth: { authStateReady: function () { return Promise.resolve(); }, currentUser: /connexion/.test(location.search) ? null : user }, db: {}, au: { onAuthStateChanged: function (a, cb) { setTimeout(function () { cb(/connexion/.test(location.search) ? null : user); }); }, signOut: function () { return Promise.resolve(); } },
      fs: { doc: function (db, c, id) { return c + '/' + id; }, collection: function () {}, where: function () {}, query: function () {}, orderBy: function () {}, limit: function () {},
        getDocs: function () { return Promise.resolve({ docs: [], size: 0, forEach: function () {} }); },
        getDoc: function (p) { return Promise.resolve({ exists: function () { return !!store[p]; }, data: function () { return JSON.parse(JSON.stringify(store[p] || {})); } }); },
        updateDoc: function () { return Promise.resolve(); } } };
    var vrai;
    Object.defineProperty(window, 'AOC_FB', { configurable: true, get: function () { return vrai; }, set: function (v) { v.ouvrir = function () { return Promise.resolve(f); }; vrai = v; } });
  });
  await ctx.route(/^https?:\/\//, r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'site.test') return r.abort();
    return r.fulfill({ path: racine + (u.pathname === '/' ? '/index.html' : u.pathname) }).catch(() => r.abort());
  });
  const err = [];
  page.on('pageerror', e => err.push(page.url() + ' : ' + e.message));
  const pages = [['accueil', 'index.html'], ['publier', 'publier.html'], ['compte', 'compte.html'], ['connexion', 'compte.html?connexion'],
    ['interesse', 'interesse.html'], ['confidentialite', 'confidentialite.html'], ['admin', 'admin.html']];
  for (const [w, h, nom] of [[390, 844, '390'], [1280, 900, '1280']]) {
    await page.setViewportSize({ width: w, height: h });
    for (const sombre of [false, true]) {
      await page.emulateMedia({ colorScheme: sombre ? 'dark' : 'light', reducedMotion: 'no-preference' });
      for (const [n, url] of pages) {
        if (sombre && n !== 'accueil' && n !== 'publier') continue;
        await page.goto('http://site.test/' + url);
        await page.waitForTimeout(1300);
        await page.screenshot({ path: dest + PREFIXE + '-' + nom + (sombre ? '-sombre' : '') + '-' + n + '.png', fullPage: n !== 'accueil' });
        // détails : cartes de la liste, métier choisi dans Publier
        if (n === 'accueil') {
          await page.evaluate(() => document.getElementById('etat').scrollIntoView());
          await page.screenshot({ path: dest + PREFIXE + '-' + nom + (sombre ? '-sombre' : '') + '-accueil-liste.png' });
        }
        if (n === 'publier') {
          await page.locator('.pastilles label').nth(3).click();
          await page.screenshot({ path: dest + PREFIXE + '-' + nom + (sombre ? '-sombre' : '') + '-publier-choisi.png' });
        }
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  return err;
}
