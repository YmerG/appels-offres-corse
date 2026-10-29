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
- Téléphone d'abord, mode sombre automatique, aucune autre dépendance.
- Style « luxe épuré » (refonte v11) : ivoire, encre profonde #0e1c28, or patiné (#7d5f24 pour le texte, #d6b46e sur fond sombre) ; titres en Playfair Display hébergée sur le site (gratuite, licence OFL), texte en police du système ; animations douces (cartes qui apparaissent, chiffres qui montent, pastilles qui réagissent), coupées si le téléphone demande « réduire les animations ». Captures : `outils/captures_refonte.js` (Playwright, sans serveur).
- **Outils de l'artisan (v12, lot 1)**, sous chaque carte :
  - **« Dossier de consultation »** : lien direct vers le DCE lu dans l'avis (`collecte.py`, fonction `dossier`), sinon « Plateforme de l'acheteur ». Environ 3 avis sur 4 ont le vrai lien.
  - **« Suivre »** : l'avis est gardé dans ce navigateur (rien n'est envoyé) ; le bouton « Mes avis suivis » au-dessus des filtres les montre, tous onglets confondus (`index.html#suivi=1`).
  - **« Agenda »** : un fichier .ics avec la date limite et un rappel 2 jours avant (à essayer sur iPhone et Android une fois en ligne).
  - Pastille **« Nouveau »** sur les avis publiés depuis la visite précédente (jour de visite gardé dans le navigateur).
  - Étude des concurrents : `captures/VEILLE-CONCURRENCE.md`.
- **Autres plateformes (v12, lot 10, point 13 de la veille)** : dans l'onglet Public, un encadré rappelle que les marchés de moins de 90 000 € ne passent pas toujours au BOAMP et renvoie vers l'alerte gratuite de marches-publics.info et d'achatspublicscorse.com (aussi dans la FAQ de « Comment ça marche »). Simples liens : leurs annonces ne sont pas recopiées (robots.txt, pas d'API ouverte).
- **5 entreprises au plus par demande (v12, lot 3)** :
  - chaque entreprise ne répond qu'une fois à une demande (son message porte l'identifiant de son compte) ; la carte affiche « 2 entreprises sur 5 ont déjà répondu » ;
  - dans « Mes demandes », le demandeur peut cliquer **« Ma demande est pourvue »** (et la rouvrir) ;
  - une demande pourvue ou complète disparaît de la liste, ne reçoit plus de réponses et ne déclenche plus d'alertes ; l'admin la voit marquée « Pourvue » ou « Complète » ;
  - les règles Firestore l'imposent (compteur `nbInterets` augmenté dans la même écriture que le message) ; l'admin recalcule le compteur quand il supprime un message.
- **Photos dans la demande (v12, lot 4)** :
  - jusqu'à 3 photos dans « Publier », réduites dans le navigateur en JPEG de 300 Ko au plus (ce qui retire la position GPS) ; vignettes avec bouton « × » pour en retirer une ;
  - stockées en octets dans Firestore (`demandes/{id}/photos/1 à 3`), pas dans Cloud Storage (payant) ; écrites seulement en même temps que la demande, par son auteur ;
  - visibles par l'admin avant validation, puis par tous via le bouton « Photos (n) » de la carte (chargées seulement au clic) ; supprimées avec la demande.
- **Assurance décennale déclarée (v12, lot 5)** :
  - une entreprise peut indiquer dans son compte son assureur, la date de fin et le n° de contrat (facultatif) ; rien n'est vérifié par le site ;
  - l'admin la voit sous chaque réponse (« EXPIRÉE » si la date est passée) et la transmet au demandeur avec les coordonnées ;
  - « Je suis intéressé » rappelle de la déclarer si elle manque ou si elle est expirée (lien vers le compte dans un nouvel onglet) ; règles Firestore : `decennaleValide` (profil Entreprise seulement).
  - lot 6 : « EXPIRÉE » en rouge et en gras côté admin ; dans « Mon compte », un bandeau prévient l'entreprise si sa décennale est expirée ou expire sous 30 jours (pas d'e-mail).
- **Filtre « Taille du marché » (v12, lot 7)** : Toutes, Petits (moins de 90 000 €), Moyens (dès 90 000 €), Gros (marchés européens). Lu dans la famille de procédure du BOAMP (`collecte.py`, fonction `taille`), car le montant manque sur un avis sur deux. Avis publics seulement (caché dans les onglets des demandes), gardé dans l'adresse (`#taille=petit`).
- **Page « Marchés attribués » (`resultats.html`, lot 8)** : les résultats de marché corses du BOAMP sur 12 mois (environ 420), du plus récent au plus ancien, avec un filtre par métier. Pour chaque marché : acheteur, lieu, montant attribué (ou maximum d'un accord-cadre), nombre d'offres reçues, lien vers le résultat officiel. Écrite par `collecte.py` (fonctions `resultat`, `resultats_de`, `carte_resultat`) à partir de `modele-resultats.html`. Si l'API ne répond pas, la page précédente est gardée.
  - Le **nom de l'entreprise retenue n'est pas recopié** : c'est parfois une personne (entrepreneur individuel). Il reste sur l'avis officiel. Décision de Rémy en attente.
  - Les petits marchés à l'ancien format du BOAMP (environ 3 sur 10) n'ont le prix et le titulaire qu'en texte libre : la fiche renvoie vers l'avis officiel.
  - Les lots sans gagnant (infructueux, sans suite) sont écartés.
- **« Chercher un partenaire » (`partenaire.html`, lot 9)** : bouton « Partenaire » sous chaque avis public. Un compte Entreprise à l'e-mail vérifié laisse un message (ce qu'il apporte, ce qu'il cherche) et ses coordonnées. Rangé dans Firestore `partenaires/<n° d'avis>_<uid>` (un par entreprise et par avis), lu par l'admin seulement : la page admin les regroupe par avis, et dès 2 entreprises l'admin transmet à chacune les coordonnées des autres, à la main. Supprimé 3 mois après la date limite de l'avis (bouton de purge de l'admin).
  - Les règles ne vérifient pas que l'avis est encore ouvert (les avis BOAMP ne sont pas dans Firestore) : la page le vérifie dans `data.json`, et l'admin écarte les avis clos.
  - Pas d'e-mail automatique à l'admin ni aux entreprises pour l'instant.
  - Lieux : « Sans objet », code postal seul, « Services techniques… », phrases entières sont remplacés par le département (`nom_lieu`, rapport 29).
- **Interface (v12, lot 2)** :
  - bouton **« Vue compacte »** à côté du nombre d'avis : seulement l'essentiel de chaque carte (sur téléphone, environ 250 px au lieu de 540, boutons réduits à leur icône) ; le choix est gardé dans le navigateur ;
  - page **`comment-ca-marche.html`** (lien sous les chiffres de l'en-tête et dans le pied de page) : parcours entreprise et particulier en 3 étapes, « Combien ça coûte ? » (gratuit pendant la version de test, **à décider par Rémy pour la suite**), ce qui est vérifié et ce qu'il faut vérifier soi-même (décennale, devis écrit), questions fréquentes.
- Mention « Données BOAMP (licence ouverte) » dans le pied de page, avec le rappel que seul l'avis officiel fait foi.
- **Aucune donnée personnelle** : les avis contiennent des noms, téléphones et courriels de correspondants, qui ne sont jamais repris.

### Onglets « Privé – sociétés » et « Particuliers » (démonstration)
- Trois onglets au-dessus de la liste : **Public** (les vrais avis du BOAMP, inchangés), **Privé – sociétés** et **Particuliers**.
- Les deux derniers ne contiennent que des **avis fictifs** (10 chacun), écrits à la main dans `site/exemples.json` : chaque carte porte le badge **« Exemple »** et un cadre en pointillés, et l'onglet affiche le bandeau **« Avis fictifs pour la démonstration »**. Aucun nom de société ou de personne, aucune coordonnée, aucun lien (le test automatique le vérifie).
- `collecte.py` lit ce fichier mais ne l'écrit jamais. Les dates y sont relatives (« publié il y a 3 jours, réponse dans 18 jours ») et recalculées à chaque collecte : les exemples ne périment pas.
- Les filtres métier, département, recherche et tri marchent dans chaque onglet ; les compteurs suivent l'onglet. Adresse directe : `index.html#onglet=prive` ou `#onglet=particulier&metier=plomberie-cvc`. Le haut de page ne compte que les avis publics.

### Comptes (version de test)
- **`site/compte.html`** (lien « Compte » dans l'en-tête de chaque page) : créer un compte, se connecter, « Mot de passe oublié ? », se déconnecter, modifier son profil, **supprimer son compte** (mot de passe demandé). Firebase Authentication, méthode E-mail/Mot de passe ; un **e-mail de vérification** part à l'inscription (en français), avec un bouton « Renvoyer le lien ».
- Deux types, choisis à l'inscription et **non modifiables** ensuite :
  - **Particulier** (nom, commune) : il publie des demandes et les retrouve dans **« Mes demandes »** (`compte.html#mes-demandes`), avec leur suivi en étapes : Envoyée → En vérification → Publiée → Réponses reçues (nombre noté par l'admin avec le bouton « J'ai transmis ces réponses » de `admin.html`), une phrase « La suite : … », et une pastille sur les nouveautés (ici et sur le bouton « Compte » de l'en-tête ; état vu gardé dans le navigateur) ; la publication se fait en 3 étapes (Quoi, Où, Quand) avec un brouillon gardé dans le navigateur ;
  - **Entreprise de travaux** (raison sociale, SIRET, métiers, départements 2A/2B) : elle répond aux demandes et peut aussi publier les siennes, seulement dans « Privé – sociétés » (elle les retrouve aussi dans « Mes demandes ») ; elle ne peut pas répondre à sa propre demande. Le **SIRET** doit avoir 14 chiffres et une clé de contrôle juste (calcul de Luhn, exception La Poste), puis **exister et être en activité** dans l'annuaire officiel (API gratuite `recherche-entreprises.api.gouv.fr`, sans clé, appelée depuis le navigateur). Si l'API ne répond pas en 6 s, l'inscription passe quand même : l'admin vérifie avec le lien « SIRET » de `admin.html`. Les règles Firestore ne vérifient que les 14 chiffres : un SIRET inventé peut passer en écrivant directement dans Firestore (il faudrait une Cloud Function, offre payante).
  - Les deux peuvent ajouter un téléphone facultatif, qui sert seulement à pré-remplir les formulaires.
- **Profil `users/{uid}`** : lisible par son titulaire et par l'admin seulement, jamais par le public. Chacun ne modifie que le sien, sans pouvoir changer son type ni sa date de création. Le type est aussi figé dans `types/{uid}`, écrit une seule fois avec le premier profil et jamais modifié ni supprimé. Supprimer son profil puis le recréer ne change donc pas le type.
- **Pas de dépôt sans compte :** `publier.html` renvoie vers `compte.html` si l'on n'est pas connecté, puis ramène au formulaire après la connexion. Publier est réservé aux comptes à l'e-mail vérifié (Entreprise : onglet Privé – sociétés seulement), et « Je suis intéressé » aux comptes **Entreprise** vérifiés. Les formulaires sont pré-remplis depuis le profil. Les règles Firestore l'imposent aussi : connexion, `email_verified`, bon type de profil, et champ `uid` égal au compte.
- **Admin :** liste des comptes en lecture seule (type, nom, date, SIRET avec lien vers sa fiche officielle, métiers et zone) ; chaque demande indique le type du compte qui l'a publiée (et, pour une entreprise, sa raison sociale et son SIRET). Les e-mails ne sont visibles que dans la console Firebase.
- **À savoir :** le champ `uid` d'une demande publiée est lisible publiquement, comme le reste de la demande. C'est un identifiant technique, sans nom ni coordonnée. Il permet seulement de voir que deux demandes viennent du même compte.

### Publier une demande de travaux (version de test)
- Dans les onglets Privé et Particuliers, le bouton **« Publier une demande de travaux »** ouvre `site/publier.html`. Le formulaire est pensé pour le téléphone et demande : société ou particulier, métier (les 12), titre, description, commune, département, budget facultatif, date limite (de demain à 90 jours), nom, téléphone ou e-mail, et une case de consentement.
- **Stockage : Firebase Firestore** (offre gratuite Spark). Chaque demande arrive **« en attente »**. Elle n'apparaît sur le site qu'après validation sur `site/admin.html` (connexion Firebase Auth, un seul compte admin).
- **Les coordonnées ne sont jamais publiques :** elles sont rangées à part (`demandes/{id}/prive/contact`), et seul l'admin peut les lire. Ce sont les règles `firestore.rules` qui l'imposent, pas le navigateur. Le public ne peut que **créer** une demande. Les champs et les longueurs sont contrôlés, et le statut est forcément « en attente ». Personne d'autre que l'admin ne peut modifier ou supprimer une demande.
- **Anti-spam simple :** un champ piège invisible (un robot qui le remplit croit avoir envoyé sa demande, mais rien n'est écrit) et des longueurs maximales.
- **Refuser** ou **retirer** une demande la supprime définitivement, avec ses coordonnées et les messages des artisans.
- **« Je suis intéressé » (contact artisan → demandeur) :** chaque demande publiée (pas les exemples) a ce bouton. Il ouvre `site/interesse.html?d=<id>` : message (10 à 1 000 caractères), nom ou société, téléphone ou e-mail, consentement, champ piège. Le message est rangé dans `demandes/{id}/interets/`, **lisible par l'admin seulement**, jamais affiché sur le site. Pas d'e-mail automatique (offre gratuite, sans Cloud Functions) : l'admin voit les messages sous chaque demande dans `admin.html` et les **transmet lui-même au demandeur**. Les règles refusent un message sur une demande en attente, retirée ou close. L'admin peut supprimer un message (spam).
- **Durée de conservation :** une demande est « échue » 3 mois après sa date limite. La page admin la signale et propose un bouton « Supprimer les demandes échues », ce qui tient la promesse de la page Confidentialité. Pour l'instant, cette suppression se fait à la main. Si on l'oublie trop souvent, on pourra passer à une suppression automatique (règle TTL de Firestore).
- **`site/confidentialite.html` :** la page RGPD. Éditeur « Accordu (nom provisoire) », contact maitreagent@gmail.com. Restent « à compléter » : l'adresse de l'éditeur et la région de stockage.
- **Mode test :** les bandeaux « Version de test : ne publiez pas de vraies coordonnées » sont écrits en dur dans `index.html`, `publier.html`, `interesse.html`, `compte.html`, `admin.html` et `confidentialite.html`. Il faudra les retirer à l'ouverture.
- **Fichiers :**
  - `site/firebase-config.js` : configuration ; Firebase est chargé à la demande, et la page s'ouvre toujours d'un double-clic ;
  - `site/demandes.js` : affiche les demandes validées ;
  - `site/publier.js`, `site/interesse.js`, `site/compte.js` et `site/admin.js` : les formulaires, la page Compte et la page admin ;
  - `firestore.rules`, `firebase.json`, `.firebaserc` : règles de sécurité et réglages de l'émulateur.

**Tester en local (émulateur Firebase, rien en ligne) :**
- Lancer le test des règles : `npx -y firebase-tools@latest emulators:exec --project demo-appels-offres-corse --only firestore,auth "python3 outils/test_regles.py"`.
- Pour essayer les pages : lancer `npx -y firebase-tools@latest emulators:start --project demo-appels-offres-corse --only firestore,auth`, puis `python3 outils/test_regles.py --demo`, et ouvrir le site sur `http://localhost:…`. Comptes prêts, e-mails déjà vérifiés : admin `admin@test.local` / `admin-test-1234`, particulier `particulier@test.local` / `particulier-1234`, entreprise `entreprise@test.local` / `entreprise-1234`.
- Sur localhost (ou un domaine `.test`), le site se branche tout seul sur l'émulateur, avec le projet `demo-appels-offres-corse`. Il ne touche donc jamais au vrai projet. Avec l'émulateur, les e-mails (vérification, mot de passe) ne partent pas : leurs liens s'affichent dans le terminal de l'émulateur.

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
- Alerte par courriel ou flux RSS par métier, pages par métier pour Google, avis attribués complétés par les DECP (titulaires des petits marchés). Comptes et dépôt de chantiers par les particuliers : étape suivante.

## Captures
`captures/v1-*.png` : 390 et 360 px (téléphone), 1440 px (ordinateur), clair et sombre, en haut de page et sur la liste des cartes. Aussi `v1-390-clair-filtre.png` (électricité, 2B).
`captures/v4-*.png` : onglets d'exemples (390, 360, 1440 px, clair et sombre).
