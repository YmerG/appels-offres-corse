# Appels d'offres Corse : étape 1 (prototype)

Une page qui regroupe les **appels d'offres publics en cours en Corse-du-Sud (2A) et en Haute-Corse (2B)**, classés par métier.
Pour l'ouvrir : double-clic sur `site/index.html` (pas besoin de serveur ni d'Internet, sauf pour ouvrir les avis officiels).

Rien n'est en ligne, il n'y a ni dépôt GitHub ni nom de domaine, et rien n'a été dépensé.

## Ce que fait la page
- La liste des avis dont la date limite n'est pas passée, **triée par date limite** (ou par date de publication, ou par montant).
- Un **filtre par métier** (12 familles, voir plus bas), un filtre par **département**, et une **recherche** dans l'objet, l'acheteur et le lieu.
- Pour chaque avis : l'objet, l'acheteur, le lieu d'exécution, le **montant estimé s'il est connu** (HT), le type de procédure, la date et l'heure limites, un compte à rebours (« Demain », « J-5 ») et le badge **« Bientôt clos »** à 7 jours ou moins. Toute la carte mène à l'**avis officiel sur boamp.fr**.
- Un avis rectifié remplace l'avis d'origine (pastille « Rectifié »). Les avis clos depuis la dernière collecte disparaissent tout seuls à l'ouverture.
- Le choix reste dans l'adresse : `index.html#metier=electricite&dep=2B` affiche directement l'électricité en Haute-Corse. Un artisan peut l'enregistrer dans ses favoris.
- Téléphone d'abord, mode sombre automatique, police Source Serif 4 hébergée sur le site (gratuite, licence OFL), aucune autre dépendance.
- Mention « Données BOAMP (licence ouverte) » dans le pied de page, avec le rappel que seul l'avis officiel fait foi.
- **Aucune donnée personnelle** : les avis contiennent des noms, téléphones et courriels de correspondants, qui ne sont jamais repris.

### Onglets « Privé – sociétés » et « Particuliers » (démonstration)
- Trois onglets au-dessus de la liste : **Public** (les vrais avis du BOAMP, inchangés), **Privé – sociétés** et **Particuliers**.
- Les deux derniers ne contiennent que des **avis fictifs** (10 chacun), écrits à la main dans `site/exemples.json` : chaque carte porte le badge **« Exemple »** et un cadre en pointillés, et l'onglet affiche le bandeau **« Avis fictifs pour la démonstration »**. Aucun nom de société ou de personne, aucune coordonnée, aucun lien (le test automatique le vérifie).
- `collecte.py` lit ce fichier mais ne l'écrit jamais. Les dates y sont relatives (« publié il y a 3 jours, réponse dans 18 jours ») et recalculées à chaque collecte : les exemples ne périment pas.
- Les filtres métier, département, recherche et tri marchent dans chaque onglet ; les compteurs suivent l'onglet. Adresse directe : `index.html#onglet=prive` ou `#onglet=particulier&metier=plomberie-cvc`. Le haut de page ne compte que les avis publics.

### Publier une demande de travaux (version de test)
- Dans les onglets Privé et Particuliers, le bouton **« Publier une demande de travaux »** ouvre `site/publier.html`. Le formulaire est pensé pour le téléphone et demande : société ou particulier, métier (les 12), titre, description, commune, département, budget facultatif, date limite (de demain à 90 jours), nom, téléphone ou e-mail, et une case de consentement.
- **Stockage : Firebase Firestore** (offre gratuite Spark). Chaque demande arrive **« en attente »**. Elle n'apparaît sur le site qu'après validation sur `site/admin.html` (connexion Firebase Auth, un seul compte admin).
- **Les coordonnées ne sont jamais publiques :** elles sont rangées à part (`demandes/{id}/prive/contact`), et seul l'admin peut les lire. Ce sont les règles `firestore.rules` qui l'imposent, pas le navigateur. Le public ne peut que **créer** une demande. Les champs et les longueurs sont contrôlés, et le statut est forcément « en attente ». Personne d'autre que l'admin ne peut modifier ou supprimer une demande.
- **Anti-spam simple :** un champ piège invisible (un robot qui le remplit croit avoir envoyé sa demande, mais rien n'est écrit) et des longueurs maximales.
- **Refuser** ou **retirer** une demande la supprime définitivement, avec ses coordonnées et les messages des artisans.
- **« Je suis intéressé » (contact artisan → demandeur) :** chaque demande publiée (pas les exemples) a ce bouton. Il ouvre `site/interesse.html?d=<id>` : message (10 à 1 000 caractères), nom ou société, téléphone ou e-mail, consentement, champ piège. Le message est rangé dans `demandes/{id}/interets/`, **lisible par l'admin seulement**, jamais affiché sur le site. Pas d'e-mail automatique (offre gratuite, sans Cloud Functions) : l'admin voit les messages sous chaque demande dans `admin.html` et les **transmet lui-même au demandeur**. Les règles refusent un message sur une demande en attente, retirée ou close. L'admin peut supprimer un message (spam).
- **Durée de conservation :** une demande est « échue » 3 mois après sa date limite. La page admin la signale et propose un bouton « Supprimer les demandes échues », ce qui tient la promesse de la page Confidentialité. Pour l'instant, cette suppression se fait à la main. Si on l'oublie trop souvent, on pourra passer à une suppression automatique (règle TTL de Firestore).
- **`site/confidentialite.html` :** la page RGPD. Éditeur « Accordu (nom provisoire) », contact maitreagent@gmail.com. Restent « à compléter » : l'adresse de l'éditeur et la région de stockage.
- **Mode test :** les bandeaux « Version de test : ne publiez pas de vraies coordonnées » sont écrits en dur dans `index.html`, `publier.html`, `interesse.html`, `admin.html` et `confidentialite.html`. Il faudra les retirer à l'ouverture.
- **Fichiers :**
  - `site/firebase-config.js` : configuration ; Firebase est chargé à la demande, et la page s'ouvre toujours d'un double-clic ;
  - `site/demandes.js` : affiche les demandes validées ;
  - `site/publier.js`, `site/interesse.js` et `site/admin.js` : les deux formulaires et la page admin ;
  - `firestore.rules`, `firebase.json`, `.firebaserc` : règles de sécurité et réglages de l'émulateur.

**Tester en local (émulateur Firebase, rien en ligne) :**
- Lancer le test des règles : `npx -y firebase-tools@latest emulators:exec --only firestore,auth "python3 outils/test_regles.py"`.
- Pour essayer les pages : lancer `npx -y firebase-tools@latest emulators:start --only firestore,auth`, puis `python3 outils/test_regles.py --demo` (compte admin `admin@test.local` / `admin-test-1234`), et ouvrir le site sur `http://localhost:…`. Sur localhost, le site se branche tout seul sur l'émulateur.
- Tant que `firebase-config.js` contient le projet `demo-appels-offres-corse`, la version en ligne ne contacte pas Firebase. Elle n'affiche que les avis publics et les exemples, et le formulaire répond « L'envoi n'a pas abouti ».

**Pour passer sur un vrai projet Firebase** (le Master, avec l'accord de Rémy) :
1. Créer le projet `appels-offres-corse` sur le compte de Roulette Combo, en offre Spark gratuite, **sans activer la facturation**.
2. Créer Firestore en région Europe (`eur3`).
3. Activer Authentication avec la méthode « E-mail/Mot de passe ».
4. Créer l'appli web, puis coller sa configuration dans `site/firebase-config.js` à la place de la configuration de démo.
5. Créer le compte admin (Authentication, Ajouter un utilisateur), copier son UID, puis créer à la main le document Firestore `config/admins` avec un champ `uids`, de type tableau, qui contient cet UID.
6. Déployer **les règles seulement** : `npx -y firebase-tools@latest deploy --only firestore:rules --project appels-offres-corse`.
7. Ajouter `ymerg.github.io` aux domaines autorisés d'Authentication.

## Comment ça marche
- `collecte.py` (Python, bibliothèque standard) interroge l'API ouverte du BOAMP, puis écrit `site/index.html` (à partir de `modele.html`) et `site/data.json`.
  Lancer : `python3 collecte.py` (environ 5 s). Test sans Internet : `python3 outils/test_collecte.py`.
- `.github/workflows/collecte.yml` relancerait la collecte deux fois par jour sur GitHub. **La mise en ligne y est en commentaire** : elle n'est à activer qu'avec l'accord de Rémy.

## Les métiers (codes CPV regroupés)
Gros œuvre, bâtiment · Second œuvre, finitions · Électricité, éclairage · Plomberie, chauffage, clim · Voirie, réseaux (VRD) · Espaces verts · Nettoyage, déchets · Informatique, télécoms · Études, maîtrise d'œuvre · Restauration, alimentation · Services · Fournitures, équipements.
Un avis à plusieurs lots peut avoir plusieurs métiers : une rénovation qui contient un lot électricité apparaît aussi chez les électriciens.
Sans code CPV (certains petits marchés), le classement se fait avec les mots-clés du BOAMP. Pour un marché de **travaux**, on ajoute toujours les métiers des mots-clés du BOAMP à ceux des codes CPV, car c'est là qu'apparaissent les lots électricité, plomberie, serrurerie… Les codes de matériaux d'un chantier ne le rangent pas en « Fournitures ». **Limite :** quelques avis sont mal rangés (exemple : des « observations en mer » classées en espaces verts). Le tableau `CPV` de `collecte.py` s'affine facilement avec les retours des artisans.

## Sources de données
| Source | Ce qu'elle donne | État |
|---|---|---|
| **API BOAMP** (boamp-datadila.opendatasoft.com, jeu `boamp`) | Avis de marché nationaux et européens, MAPA publiés au BOAMP, DSP. Filtre `code_departement in ("20A","20B")` (le BOAMP écrit **20A/20B**, pas 2A/2B). Gratuit, sans clé, Licence Ouverte 2.0 | **Utilisée** : 85 avis en cours le 28/10/2026 |
| **DECP** (data.economie.gouv.fr, `decp-v3-marches-valides`…) | Marchés **déjà attribués** (titulaire, montant), pas les appels en cours | Pour une étape 2 : « qui a gagné quoi » |
| **TED** (api.ted.europa.eu) | Avis européens, API ouverte | Inutile pour l'instant : ces avis sont déjà au BOAMP (famille JOUE) |
| **Profils acheteurs** (achatspublicscorse.com, marches-publics.info, PLACE…) | Les petits marchés que l'acheteur ne publie pas au BOAMP | **Non utilisés** : pas d'API ouverte connue, et achatspublicscorse.com refuse les robots dans son `robots.txt`. Ne pas aspirer ces sites. À voir avec eux, ou via les flux qu'ils proposeraient |

Bon à savoir :
- **L'heure limite** est l'heure écrite dans l'avis, lue en heure de Paris, comme sur boamp.fr. Le fuseau donné par l'API est souvent faux : parfois « Z », parfois « +02:00 » en plein hiver. Cette règle a été vérifiée par le Testeur sur boamp.fr.
- **Le département** affiché est celui que donne le BOAMP, c'est-à-dire celui de l'acheteur. Quelques chantiers se trouvent dans l'autre département, par exemple un acheteur de Haute-Corse qui fait des travaux à Ajaccio.
- **Le lieu** est celui de l'avis. Il donne parfois l'adresse d'un service sur le continent, comme Marseille.

## Pour aller plus loin (non fait, à décider)
- Mise en ligne gratuite (Cloudflare Pages comme Nutizie), avec une page de mentions légales. **Accord de Rémy nécessaire.**
- Alerte par courriel ou flux RSS par métier, pages par métier pour Google, avis attribués (DECP). Comptes et dépôt de chantiers par les particuliers : étape suivante.

## Captures
`captures/v1-*.png` : 390 et 360 px (téléphone), 1440 px (ordinateur), clair et sombre, en haut de page et sur la liste des cartes. Aussi `v1-390-clair-filtre.png` (électricité, 2B).
`captures/v4-*.png` : onglets d'exemples (390, 360, 1440 px, clair et sombre).
