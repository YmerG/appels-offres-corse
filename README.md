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
