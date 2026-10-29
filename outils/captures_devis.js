// Captures du lot 20 (devis), téléphone 390 + ordinateur 1280, sans serveur : site servi par page.route sur site.test,
// Firebase remplacé par un faux (compte Entreprise connecté, une demande à laquelle il a répondu, un devis déjà envoyé).
// Vérifie aussi que « Télécharger le PDF » produit un vrai PDF dans le navigateur. Pour l'outil browser_run_code_unsafe de Playwright MCP.
async (page) => {
  const PREFIXE = 'lot20';
  const racine = '/Users/remy/SitesWeb/AppelsOffresCorse/site';
  const dest = '/Users/remy/SitesWeb/AppelsOffresCorse/captures/';
  const ctx = page.context();
  await ctx.addInitScript(() => {
    window.confirm = function () { return true; }; // « Envoyer ce devis ? » (la fenêtre bloquerait Playwright MCP)
    localStorage.setItem('aoc-mes-metiers', JSON.stringify({ metiers: ['plomberie-cvc', 'second-oeuvre'], zone: ['2B'] }));
    function ts(s) { var d = new Date(s); return { toDate: function () { return d; }, toMillis: function () { return d.getTime(); } }; }
    var dans = function (j) { return ts(Date.now() + j * 864e5); };
    var store = {
      'users/u1': { type: 'entreprise', nom: 'Plomberie Test SARL', siret: '12345678000014', metiers: ['plomberie-cvc', 'second-oeuvre'], zone: ['2B'],
        cree: 1, decennale: { assureur: 'Mutuelle Exemple', fin: '2027-06-30' } },
      'demandes/dem1': { type: 'particulier', metier: 'plomberie-cvc', titre: 'Rénovation salle de bains', description: 'Douche à l’italienne, 6 m².',
        commune: 'Corte', departement: '2B', delai: dans(12), statut: 'validee', cree: dans(-2), uid: 'p1', nbInterets: 1 },
      'demandes/dem1/interets/u1': { nom: 'Plomberie Test SARL' },
      'entetes/u1': { adresse: '1 rue du Port, 20250 Corte', mentions: 'SARL au capital de 10 000 € · RCS Bastia 123 456 780', franchise: false },
      'devis/dem2_u1': { demande: 'dem2', entreprise: 'u1', destinataire: 'p2', titre: 'Remplacer un chauffe-eau', lieu: 'Bastia (2B)',
        emetteur: { nom: 'Plomberie Test SARL', siret: '12345678000014', adresse: '1 rue du Port, 20250 Corte', franchise: false },
        client: { nom: 'Le demandeur' }, validite: 30, frais: 0, cree: dans(-1),
        lignes: [{ designation: 'Chauffe-eau 200 L', quantite: 1, unite: 'u', prix: 65000, tva: 10 }, { designation: 'Pose', quantite: 3, unite: 'h', prix: 4500, tva: 10 }] }
    };
    var ecrit = window.__ecrit = [];
    var user = { uid: 'u1', email: 'ent@test.fr', emailVerified: true };
    function snap(p) {
      return { id: p.split('/').pop(), ref: p, exists: function () { return !!store[p]; }, data: function () { return store[p] && Object.assign({}, store[p]); } };
    }
    var fs = {
      doc: function () { return Array.prototype.slice.call(arguments, 1).join('/'); },
      collection: function () { return Array.prototype.slice.call(arguments, 1).join('/'); },
      where: function (champ, op, v) { return { champ: champ, v: v }; },
      query: function (c, w) { return { c: c, w: w }; },
      getDoc: function (p) { return Promise.resolve(snap(p)); },
      getDocs: function (q) {
        var docs = Object.keys(store).filter(function (k) {
          return k.indexOf(q.c + '/') === 0 && k.split('/').length === q.c.split('/').length + 1 && (!q.w || store[k][q.w.champ] === q.w.v);
        }).map(snap);
        return Promise.resolve({ docs: docs, size: docs.length, forEach: function (cb) { docs.forEach(cb); } });
      },
      setDoc: function (p, d) { ecrit.push(p); return Promise.resolve(); },
      updateDoc: function () { return Promise.resolve(); },
      serverTimestamp: function () { return 'heure-serveur'; },
      Bytes: { fromUint8Array: function (u) { return u; } }
    };
    var f = { auth: { authStateReady: function () { return Promise.resolve(); }, currentUser: user }, db: {},
      au: { onAuthStateChanged: function (a, cb) { setTimeout(function () { cb(user); }); }, signOut: function () { return Promise.resolve(); } }, fs: fs };
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
  const bilan = [];
  for (const [w, h, nom] of [[390, 844, '390'], [1280, 900, '1280']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: 'light' });
    // demande à laquelle l'entreprise a répondu : envoi possible
    await page.goto('http://site.test/devis.html?d=dem1');
    await page.waitForTimeout(800);
    await page.fill('.l-des', 'Dépose et pose d’une douche à l’italienne');
    await page.fill('.l-pu', '1850');
    await page.click('#ajouter');
    await page.locator('.l-des').nth(1).fill('Main-d’œuvre plomberie');
    await page.locator('.l-qte').nth(1).fill('6');
    await page.locator('.l-uni').nth(1).selectOption('h');
    await page.locator('.l-pu').nth(1).fill('45');
    await page.screenshot({ path: dest + PREFIXE + '-' + nom + '-devis.png', fullPage: true });
    if (nom === '390') {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#telecharger')]);
      const chemin = dest + PREFIXE + '-telecharge.pdf';
      await dl.saveAs(chemin);
      bilan.push('PDF téléchargé : ' + dl.suggestedFilename());
      await page.click('#envoyer');
      await page.waitForTimeout(400);
      bilan.push('écrit : ' + (await page.evaluate(() => window.__ecrit.join(', '))));
      await page.screenshot({ path: dest + PREFIXE + '-390-envoye.png' });
    }
    // avis BOAMP : pas d'envoi, plateforme officielle et pièces
    await page.goto('http://site.test/devis.html?a=26-95985');
    await page.waitForTimeout(800);
    await page.screenshot({ path: dest + PREFIXE + '-' + nom + '-boamp.png', fullPage: true });
    // compte : Mes devis
    await page.goto('http://site.test/compte.html#devis');
    await page.waitForTimeout(800);
    await page.locator('#devis').screenshot({ path: dest + PREFIXE + '-' + nom + '-mes-devis.png' });
    // acheteurs : la case « J'accepte les devis par le site »
    await page.goto('http://site.test/acheteurs.html');
    await page.waitForTimeout(800);
    await page.locator('#bloc-devis').scrollIntoViewIfNeeded();
    await page.screenshot({ path: dest + PREFIXE + '-' + nom + '-acheteurs.png' });
    await page.fill('#budget', '250000');
    bilan.push(nom + ' : case cachée à 250 000 € : ' + (await page.locator('#bloc-devis').isHidden()));
    // accueil : bouton « Devis » sur les cartes
    await page.goto('http://site.test/index.html');
    await page.waitForTimeout(1200);
    bilan.push(nom + ' : boutons Devis sur l’accueil : ' + (await page.locator('.action.devis').count()));
    await page.locator('.action.devis').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: dest + PREFIXE + '-' + nom + '-accueil.png' });
  }
  return { erreurs: err, bilan: bilan };
}
