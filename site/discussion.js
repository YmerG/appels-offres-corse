// Discussion entre le demandeur et une entreprise qui a répondu (discussions/{demande}_{uid entreprise}, lot 18.6).
// Lisible par les 2 participants seulement (et l'admin, pour la modération) : les règles Firestore l'imposent.
// Firestore Lite n'écoute pas en direct : relecture toutes les 15 s tant que la page est à l'écran.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var id = new URLSearchParams(location.search).get('id') || '';
  var F = window.AOC_FB, f, moi, ref, disc, nb = -1;
  F.ouverte = id; // pastille « Compte » et icône : sans cette discussion, lue dès son ouverture (firebase-config.js)

  function heure(ts) {
    return ts ? ts.toDate().toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'à l’instant';
  }
  function dire(id, msg) { $(id).textContent = msg; $(id).hidden = !msg; }

  function afficher(s, msgs) {
    disc = s.data();
    var demandeur = moi.uid === disc.particulier;
    var autre = demandeur ? disc.nomEntreprise : 'Le demandeur';
    document.title = disc.titre + ' · Discussion';
    $('titre').textContent = disc.titre;
    $('avec').textContent = demandeur ? 'Discussion avec ' + disc.nomEntreprise + ', qui a répondu à votre demande.'
      : 'Discussion avec le demandeur. Vos coordonnées lui sont aussi transmises par l’administrateur.';
    if (msgs.length !== nb) { // redessinée seulement s'il y a du nouveau : le texte en cours de lecture ne saute pas
      var fil = $('fil');
      fil.textContent = '';
      msgs.forEach(function (m) {
        var x = m.data(), li = document.createElement('li'), qui = document.createElement('p'), p = document.createElement('p');
        li.className = 'bulle' + (x.auteur === moi.uid ? ' moi' : '');
        qui.className = 'qui';
        qui.textContent = (x.auteur === moi.uid ? 'Vous' : autre) + ' · ' + heure(x.cree);
        p.textContent = x.texte;
        li.append(qui, p);
        fil.append(li);
      });
      if (nb !== -1 && fil.lastElementChild) fil.lastElementChild.scrollIntoView({ block: 'nearest' });
      nb = msgs.length;
    }
    $('f-msg').hidden = !disc.ouverte;
    $('fermee').hidden = disc.ouverte;
    $('fermer').hidden = !(demandeur && disc.ouverte);
    // lue : l'heure du serveur, puis la pastille de l'icône est recalculée
    if (F.nonLue(disc, moi.uid)) {
      f.fs.updateDoc(ref, demandeur ? { luP: f.fs.serverTimestamp() } : { luE: f.fs.serverTimestamp() })
        .then(function () { return F.discussions(f, moi.uid); })
        .then(function (docs) { F.badge(docs.filter(function (d) { return d.id !== id && F.nonLue(d.data(), moi.uid); }).length); })
        .catch(function (e) { console.warn('Lu :', e && e.code); });
    }
  }

  function charger() {
    return Promise.all([f.fs.getDoc(ref), f.fs.getDocs(f.fs.query(f.fs.collection(ref, 'messages'), f.fs.orderBy('cree')))])
      .then(function (r) {
        if (!r[0].exists()) throw { code: 'not-found' };
        dire('etat', '');
        afficher(r[0], r[1].docs);
      }, function (e) {
        console.warn('Discussion :', e && (e.code || e.message));
        $('f-msg').hidden = true;
        dire('etat', e && (e.code === 'not-found' || e.code === 'permission-denied')
          ? 'Cette discussion est introuvable : elle a peut-être été supprimée avec sa demande.'
          : 'La discussion ne peut pas être chargée. Vérifiez votre connexion : nouvel essai dans un instant.');
      });
  }

  F.moi().then(function (r) {
    f = r.f;
    moi = r.user;
    if (!moi) return location.replace('compte.html?retour=' + encodeURIComponent('discussion.html?id=' + id));
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) return dire('etat', 'Adresse de discussion abîmée. Retrouvez-la dans votre compte.');
    ref = f.fs.doc(f.db, 'discussions', id);
    F.boutonNotifs($('notifs'));
    charger().then(function () { if (disc) $('fil').lastElementChild && $('fil').lastElementChild.scrollIntoView({ block: 'nearest' }); });
    setInterval(function () { if (!document.hidden) charger(); }, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) charger(); });
  }, function () { dire('etat', 'Le service de comptes est injoignable : vérifiez votre connexion.'); });

  $('texte').addEventListener('input', function () {
    var n = $('texte').value.length;
    $('reste').textContent = n ? n + ' / 1 000' : '1 000 caractères au plus';
  });

  // le message et la mise à jour de la discussion dans la même écriture (les règles vérifient les deux ; outils/notifier.py lit maj)
  $('f-msg').addEventListener('submit', function (e) {
    e.preventDefault();
    var texte = $('texte').value.trim();
    if (!texte) return dire('erreur', 'Écrivez votre message.');
    dire('erreur', '');
    $('envoyer').disabled = true;
    var m = f.fs.doc(f.fs.collection(ref, 'messages'));
    var lot = f.fs.writeBatch(f.db);
    lot.set(m, { auteur: moi.uid, texte: texte, cree: f.fs.serverTimestamp() });
    lot.update(ref, { maj: f.fs.serverTimestamp(), dernier: moi.uid, dernierMsg: m.id });
    lot.commit().then(function () {
      $('texte').value = '';
      $('reste').textContent = '1 000 caractères au plus';
      return charger();
    }, function (err) {
      console.warn('Envoi :', err && err.code);
      dire('erreur', err && err.code === 'permission-denied' ? "Message refusé : la discussion vient peut-être d'être fermée." : "L'envoi n'a pas abouti. Vérifiez votre connexion et réessayez.");
      return charger();
    }).then(function () { $('envoyer').disabled = false; $('texte').focus(); });
  });

  $('fermer').onclick = function () {
    if (!confirm('Fermer cette discussion ? Ni vous ni l’entreprise ne pourrez plus y écrire.')) return;
    f.fs.updateDoc(ref, { ouverte: false }).then(charger, function (e) { dire('etat', 'La discussion n’a pas pu être fermée (' + (e && e.code) + ').'); });
  };
})();
