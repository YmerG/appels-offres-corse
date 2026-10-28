# Étude : e-mails automatiques, gratuitement (point 6 de la v10.4)

Rédigée le 28/10/2026 par le Développeur web. **Rien n'est installé** : c'est une proposition à valider par Rémy.

Ce qu'il faut envoyer :
1. au demandeur, quand sa demande est **validée** (publiée) ;
2. au demandeur, quand il a **reçu des réponses** ;
3. aux entreprises, une **alerte** quand une demande de leur métier et de leur département est publiée.

## Ce qui est exclu, parce que c'est payant

- **L'extension Firebase « Trigger Email »** et toute **Cloud Function** : elles exigent le forfait Blaze, payant à l'usage, avec une carte bancaire ([documentation Firebase](https://firebase.google.com/docs/extensions/official/firestore-send-email?hl=en), [fiche de l'extension](https://firebase.google.cn/products/extensions/firestore-send-email)). Sur le forfait gratuit Spark, un serveur Firebase ne peut pas contacter un service d'e-mail.
- **EmailJS appelé depuis le site** : c'est gratuit jusqu'à environ 200 envois par mois ([tarifs rapportés](https://toolradar.com/tools/emailjs/pricing)). Mais la clé serait lisible dans le navigateur, donc n'importe qui pourrait envoyer des e-mails à notre nom. Je le déconseille.

## Option A, tout de suite, sans aucun compte : des boutons « Prévenir » dans la page admin

- **Comment ça marche :** dans `admin.html`, un bouton « Prévenir le demandeur » apparaît après « Valider » et après « J'ai transmis ces réponses ». Il ouvre ta messagerie avec le message déjà écrit (lien `mailto:`). Tu n'as plus qu'à cliquer sur « Envoyer ».
- **Coût et installation :** 0 €, aucun service à créer, une petite modification de `admin.js`.
- **Limites :**
  - Ce n'est pas automatique : c'est toi qui envoies.
  - Les **alertes aux entreprises** ne sont pas possibles avec cette option. L'e-mail des entreprises n'est pas lisible depuis la page admin : il est rangé dans Firebase Authentication, pas dans leur profil.

## Option B, automatique et gratuite (recommandée quand il y aura du monde) : GitHub Actions + Gmail

- **Comment ça marche :** un petit programme Python tourne sur GitHub toutes les 30 minutes. Le projet a déjà un dépôt GitHub et un fichier `.github/workflows/collecte.yml`. Le programme :
  1. lit Firestore avec une clé « compte de service » Firebase, gratuite sur le forfait Spark ;
  2. repère les demandes nouvellement validées, les réponses transmises et les nouvelles demandes à signaler aux entreprises ;
  3. envoie les e-mails ;
  4. note dans Firestore ce qui a été envoyé, pour ne jamais envoyer deux fois.
- **Envoi des e-mails, au choix :**
  - **Gmail**, avec un « mot de passe d'application » de l'adresse du site (par exemple maitreagent@gmail.com) : environ **500 envois par jour**, et 100 destinataires au plus par message. Il faut activer la validation en deux étapes ([limites Gmail](https://developer.nylas.com/docs/cookbook/email/gmail-smtp-settings/), [guide Nodemailer](https://nodemailer.com/usage/using-gmail)).
  - **Brevo**, offre gratuite : **300 envois par jour**, sans carte bancaire ([page Brevo](https://www.brevo.com/features/email-api/)). Les e-mails arrivent mieux dans les boîtes de réception, mais il faut créer un compte Brevo.
- **Coût :** 0 €.
  - Si le dépôt GitHub est public, les minutes de GitHub Actions sont illimitées.
  - S'il est privé, le forfait gratuit donne 2 000 minutes par mois ([GitHub](https://learn.microsoft.com/en-us/training/modules/github-introduction-products/4-github-billing), [forum GitHub](https://github.community/t/for-public-repositories-is-there-a-monthly-limit-on-minutes/129017)). Une exécution toutes les 30 minutes représente environ 1 440 minutes par mois : ça tient. Toutes les 15 minutes, ça ne tiendrait plus.
- **Limites :**
  - Les e-mails partent avec jusqu'à 30 minutes de retard, et GitHub décale parfois ses exécutions planifiées.
  - La clé du compte de service donne tous les droits sur la base. Elle doit rester uniquement dans les « secrets » de GitHub, jamais dans le site.
- **Ce que Rémy devrait faire :**
  - activer la validation en deux étapes sur l'adresse Gmail du site et créer un mot de passe d'application, ou bien créer un compte Brevo ;
  - créer la clé du compte de service dans la console Firebase ;
  - me laisser ranger ces deux secrets dans GitHub.
- **Ce que je devrais faire :**
  - Écrire le programme `outils/envoyer_emails.py` et le fichier `.github/workflows/emails.yml`.
  - Ajouter dans le profil Entreprise une case « Recevoir les alertes par e-mail », décochée par défaut, avec l'e-mail de l'entreprise. Cela demande de changer les règles de sécurité et `test_regles.py`.
  - Ajouter un lien de désabonnement dans chaque alerte.
  - Compléter la page Confidentialité : quel service envoie les e-mails (Google ou Brevo), et pourquoi.

## Ma recommandation

1. **Maintenant : l'option A.** Elle ne demande rien à Rémy, c'est environ une heure de travail, et le demandeur est prévenu dès aujourd'hui.
2. **Dès qu'il y aura plus de quelques demandes par semaine, ou qu'on voudra les alertes par métier : l'option B avec Gmail.** On passera à Brevo si des e-mails arrivent dans les indésirables.

## Option B choisie par Rémy (Brevo) : où on en est (28/10/2026)

**Prêt, pas encore branché :** `outils/envoyer_emails.py`, `.github/workflows/emails.yml` (toutes les 30 min), `outils/test_emails.py` et des données fictives `outils/emails-essai.json`. Tant que les secrets n'existent pas, le workflow affiche « rien à faire » et s'arrête.

- **Ce qui est envoyé :** au demandeur quand sa demande est publiée, puis quand l'admin note des réponses transmises ; aux comptes Entreprise **qui ont coché les alertes**, une alerte par demande publiée de leur métier et de leur département, encore ouverte, sauf leurs propres demandes. Toujours à l'adresse **vérifiée du compte**, jamais à l'e-mail tapé dans le formulaire (il n'est pas vérifié : ce peut être une faute de frappe ou l'adresse de quelqu'un d'autre).
- **Rien n'est écrit dans Firestore :** le programme lit seulement. Ce qui est déjà envoyé est noté dans `etat-emails.json`, gardé dans le cache de GitHub. Ce fichier ne contient aucune adresse, seulement des identifiants de demandes et de comptes.
- **Jamais deux fois le même e-mail.** Au tout premier passage, ce qui existe déjà est noté comme envoyé, sans rien envoyer.
- **Aucune adresse dans les journaux.** Ils montrent seulement le type d'e-mail, l'identifiant de la demande et un bilan chiffré. En cas d'erreur Brevo, ils montrent le code d'erreur, jamais le message (il peut contenir l'adresse).
- **Plafond : 280 e-mails par jour** (offre gratuite Brevo : 300). Le reste part le lendemain, et un échec est réessayé au passage suivant.
- **Désinscription :** chaque alerte contient le lien `compte.html?alertes=non#alertes` et l'en-tête `List-Unsubscribe` (le bouton « Se désabonner » de Gmail, qui écrit à l'adresse d'envoi).
- **Mode test, sans envoi ni réseau (Testeur) :** `python3 outils/test_emails.py` (contrôle automatique), ou `python3 outils/envoyer_emails.py --essai outils/emails-essai.json --etat /tmp/etat.json --apercus /tmp/apercus` pour voir chaque e-mail en HTML. Sur GitHub, « Run workflow » est coché « sans envoi » par défaut : il lit les vraies données et compte, sans rien envoyer.

**Ce que Rémy doit faire (aucun compte créé par l'équipe) :**
1. **Brevo :** créer le compte gratuit, valider l'adresse d'envoi (par exemple maitreagent@gmail.com), créer une clé API.
   - Sans nom de domaine à nous, Brevo prévient qu'une adresse Gmail comme expéditeur peut faire arriver des e-mails dans les indésirables. À surveiller au premier essai.
2. **Google Cloud** (projet appels-offres-corse, gratuit) : créer un **compte de service** avec seulement les rôles « Lecteur Cloud Datastore » (`roles/datastore.viewer`) et « Lecteur Firebase Authentication » (`roles/firebaseauth.viewer`). Créer une clé JSON pour ce compte. Avec ces rôles, il ne peut rien écrire, même par erreur.
3. **GitHub**, dans Settings → Secrets and variables → Actions :
   - secrets `BREVO_API_KEY` et `FIREBASE_SERVICE_ACCOUNT` (tout le contenu du JSON) ;
   - variable `EXPEDITEUR` (l'adresse validée dans Brevo) ;
   - variable `SITE_URL`, facultative : sinon, l'adresse GitHub Pages du dépôt.
4. Lancer une fois « Run workflow » sans envoi, puis laisser tourner.

**Ce qui reste à faire de mon côté, après la validation du lot 2 par le Testeur :**
- `firestore.rules` : champ facultatif `alertes` (booléen) dans le profil Entreprise, plus les cas correspondants dans `test_regles.py` ;
- `compte.html` et `compte.js` : case « Recevoir les alertes par e-mail », décochée par défaut, avec `id="alertes"`. Le lien `?alertes=non` la décoche après connexion ;
- `confidentialite.html` : Brevo envoie les e-mails, et l'adresse lui est transmise pour cela.

Tant que ces trois points ne sont pas faits, personne ne reçoit d'alerte. Les e-mails au demandeur, eux, marchent déjà.

**Limites :**
- GitHub décale parfois ses passages planifiés de plusieurs minutes.
- Sur un dépôt public, GitHub suspend les tâches planifiées après 60 jours sans activité sur le dépôt : il faut alors les réactiver.
- Si le cache est perdu (7 jours sans passage), le programme refait un « premier passage » : rien n'est renvoyé, mais un e-mail peut être manqué.
- Chaque passage lit toutes les demandes publiées : environ 100 lectures pour 100 demandes. C'est loin de la limite gratuite de 50 000 par jour.

## Points à confirmer avant l'option B

- **Dépôt GitHub public ou privé :** ça décide du nombre de minutes gratuites.
- **Limites de Gmail :** les chiffres viennent de guides tiers. Il faut les revérifier sur la page officielle de Google.
- **Offre gratuite de Brevo :** à revérifier le jour de l'inscription.
