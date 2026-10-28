#!/usr/bin/env python3
"""E-mails automatiques d'Appels d'offres Corse (option B de ETUDE-EMAILS.md), lancé toutes les 30 min par
.github/workflows/emails.yml :
  1. au demandeur, quand sa demande est publiée (statut « validee ») ;
  2. au demandeur, quand l'admin a noté des réponses transmises (champ « reponses ») ;
  3. aux comptes Entreprise qui ont coché les alertes (users/{uid}.alertes == true), pour une demande publiée
     de leur métier et de leur département, encore ouverte.

Firestore est seulement LU (compte de service en lecture seule, voir ETUDE-EMAILS.md) : rien n'y est écrit.
Ce qui est déjà envoyé est noté dans etat-emails.json (cache GitHub), jamais deux fois le même e-mail.
Premier passage (pas d'état) : tout ce qui existe déjà est noté comme envoyé, sans rien envoyer.
Aucune adresse dans les journaux : seulement le type d'e-mail et l'identifiant de la demande.

Sans BREVO_API_KEY, FIREBASE_SERVICE_ACCOUNT ou EXPEDITEUR : ne fait rien.
Essai sans aucun envoi ni réseau (Testeur) :
  python3 outils/envoyer_emails.py --essai outils/emails-essai.json --etat /tmp/etat.json --apercus /tmp/apercus
Essai sur les vraies données, sans envoi ni état modifié : --sans-envoi (bouton « Run workflow » sur GitHub).
"""
import argparse
import html
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from collecte import METIERS  # noqa: E402  libellés des métiers, les mêmes que sur le site

PARIS = ZoneInfo("Europe/Paris")
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
PLAFOND_JOUR = 280  # offre gratuite Brevo : 300 e-mails par jour ; le reste part le lendemain
BREVO = "https://api.brevo.com/v3/smtp/email"


def date_fr(d):
    d = d.astimezone(PARIS)
    return f"{d.day} {MOIS[d.month - 1]} {d.year}"


def a_envoyer(demandes, abonnes, deja, maintenant):
    """E-mails que l'état actuel justifie et pas encore envoyés : [(clé, demande, abonné ou None)].
    demandes : demandes publiées {id, uid, titre, commune, departement, metier, delai, reponses?, budget?} ;
    abonnes : {uid, metiers, zone} des comptes Entreprise qui ont coché les alertes."""
    out = []
    for d in demandes:
        i = d["id"]
        out.append((f"validee:{i}", d, None))
        n = d.get("reponses") or 0
        if n:
            out.append((f"reponses:{i}:{n}", d, None))
        # alertes : une seule tournée par demande, au moment où elle est publiée (pas aux abonnés arrivés après)
        if f"alertes:{i}" not in deja and d["delai"] > maintenant:
            for a in abonnes:
                if a["uid"] != d["uid"] and d["metier"] in a["metiers"] and d["departement"] in a["zone"]:
                    out.append((f"alerte:{i}:{a['uid']}", d, a))
    return [e for e in out if e[0] not in deja]


def message(cle, d, abonne, nom, site):
    """(sujet, texte, html) ; tout ce qui vient des utilisateurs est échappé dans le HTML."""
    titre = d["titre"].replace("\n", " ").replace("\r", " ")
    lieu = f"{d['commune']} ({d['departement']})"
    cite = f"« {titre} »"  # espaces insécables : les guillemets restent collés au titre
    fin = date_fr(d["delai"])
    stop = None  # lien de désinscription (alertes seulement)
    if cle.startswith("validee:"):
        sujet = f"Votre demande est publiée : {titre}"
        suite = (f"Les entreprises peuvent y répondre jusqu'au {fin}. Nous vous transmettons leurs coordonnées dès qu'elles répondent."
                 if d["delai"] > datetime.now(timezone.utc)
                 else f"Sa date limite, le {fin}, est passée : elle ne reçoit plus de réponses.")  # validée trop tard
        lignes = [f"Bonjour {nom},", f"Votre demande {cite}, à {lieu}, a été vérifiée et publiée.", suite,
                  ("Suivre ma demande", f"{site}compte.html#mes-demandes")]
        pourquoi = "Vous recevez cet e-mail parce que vous avez publié cette demande sur Appels d'offres Corse."
    elif cle.startswith("reponses:"):
        n = d.get("reponses") or 0
        sujet = f"Réponses à votre demande : {titre}"
        quoi = f"{n} entreprises ont répondu : nous vous avons transmis leurs coordonnées" if n > 1 \
            else "Une entreprise a répondu : nous vous avons transmis ses coordonnées"
        lignes = [f"Bonjour {nom},", f"{quoi}, pour votre demande {cite}, à {lieu}.",
                  ("Suivre ma demande", f"{site}compte.html#mes-demandes")]
        pourquoi = "Vous recevez cet e-mail parce que vous avez publié cette demande sur Appels d'offres Corse."
    else:
        metier = METIERS.get(d["metier"], (d["metier"],))[0]
        sujet = f"Nouvelle demande ({metier}) : {titre}"
        budget = f" Budget indicatif : {d['budget']:,} €.".replace(",", " ") if d.get("budget") else ""
        lignes = [f"Bonjour {nom},", f"Une nouvelle demande correspond à vos métiers : {cite}, à {lieu}.{budget}",
                  f"Réponses possibles jusqu'au {fin}.",
                  ("Voir la demande et répondre", f"{site}interesse.html?d={d['id']}")]
        pourquoi = "Vous recevez cette alerte parce que vous l'avez demandée dans votre compte Entreprise."
        stop = f"{site}compte.html?alertes=non#alertes"
    texte = "\n\n".join(l if isinstance(l, str) else f"{l[0]} : {l[1]}" for l in lignes) + f"\n\n--\n{pourquoi}\n" \
        + (f"Pour ne plus la recevoir : {stop}\n" if stop else "")
    corps = "".join(
        f"<p>{html.escape(l)}</p>" if isinstance(l, str)
        else f'<p><a href="{html.escape(l[1])}" style="display:inline-block;padding:10px 18px;border-radius:99px;'
             f'background:#b5532a;color:#fff;text-decoration:none;font-weight:600">{html.escape(l[0])}</a></p>'
        for l in lignes)
    page = (f'<div style="font:16px/1.5 system-ui,sans-serif;color:#1d2a33;max-width:560px">{corps}'
            f'<p style="font-size:13px;color:#5c6a73;border-top:1px solid #e3ded4;padding-top:10px">{html.escape(pourquoi)}'
            + (f' <a href="{html.escape(stop)}" style="color:#5c6a73">Ne plus recevoir ces alertes</a>' if stop else "")
            + "</p></div>")
    return sujet, texte, page


def envoyer_brevo(cle_api, expediteur, adresse, nom, sujet, texte, page, site, alerte):
    corps = {"sender": {"name": "Appels d'offres Corse", "email": expediteur}, "to": [dict({"email": adresse}, **({"name": nom} if nom else {}))],
             "subject": sujet, "textContent": texte, "htmlContent": page}
    if alerte:  # bouton « Se désabonner » des messageries
        corps["headers"] = {"List-Unsubscribe": f"<mailto:{expediteur}?subject=desinscription>, <{site}compte.html?alertes=non#alertes>"}
    req = urllib.request.Request(BREVO, data=json.dumps(corps).encode(), method="POST",
                                 headers={"api-key": cle_api, "content-type": "application/json", "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return 200 <= r.status < 300, r.status
    except urllib.error.HTTPError as e:
        return False, e.code  # pas le corps de la réponse : il peut contenir l'adresse
    except OSError:
        return False, "réseau"


class Fichier:
    """Données d'essai (JSON) : même interface que Firestore, aucune connexion."""
    def __init__(self, chemin):
        j = json.loads(Path(chemin).read_text(encoding="utf-8"))
        self.j = j
        self.comptes = j.get("comptes", {})

    def demandes(self):
        out = []
        for i, d in self.j["demandes"].items():
            if d.get("statut") == "validee":
                out.append(dict(d, id=i, delai=datetime.fromisoformat(d["delai"])))
        return out

    def abonnes(self):
        return [dict(p, uid=u) for u, p in self.j.get("users", {}).items() if p.get("type") == "entreprise" and p.get("alertes") is True]

    def compte(self, uid):
        c = self.comptes.get(uid)
        return c["email"] if c and c.get("verifie") else None

    def contact(self, d):
        c = self.j["demandes"][d["id"]].get("contact", {})
        return self.compte(d["uid"]), c.get("nom") or ""


class Firestore:
    """Lecture seule : demandes publiées, leurs coordonnées privées, profils abonnés aux alertes, e-mails des comptes."""
    def __init__(self, compte_json):
        import firebase_admin
        from firebase_admin import auth, credentials, firestore
        from google.cloud.firestore_v1.base_query import FieldFilter
        firebase_admin.initialize_app(credentials.Certificate(json.loads(compte_json)))
        self.auth, self.db, self.FieldFilter = auth, firestore.client(), FieldFilter

    def demandes(self):
        q = self.db.collection("demandes").where(filter=self.FieldFilter("statut", "==", "validee"))
        return [dict(s.to_dict(), id=s.id) for s in q.stream()]

    def abonnes(self):
        q = self.db.collection("users").where(filter=self.FieldFilter("alertes", "==", True))
        return [dict(s.to_dict(), uid=s.id) for s in q.stream() if s.to_dict().get("type") == "entreprise"]

    def compte(self, uid):
        try:
            u = self.auth.get_user(uid)
        except Exception:  # compte supprimé
            return None
        return u.email if u.email_verified and not u.disabled else None

    def contact(self, d):
        # adresse : celle du compte, vérifiée ; jamais l'e-mail tapé dans la demande (pas vérifié : faute de frappe ou adresse d'un autre)
        c = self.db.document(f"demandes/{d['id']}/prive/contact").get().to_dict() or {}
        return self.compte(d["uid"]), c.get("nom") or ""


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--essai", metavar="FICHIER", help="données d'essai JSON : rien n'est envoyé, aucun réseau")
    p.add_argument("--apercus", metavar="DOSSIER", help="avec --essai : écrit chaque e-mail en .html dans ce dossier")
    p.add_argument("--sans-envoi", action="store_true", help="vraies données, rien envoyé, état inchangé")
    p.add_argument("--etat", default="etat-emails.json")
    p.add_argument("--premier-passage", action="store_true", help="avec --essai : simuler le tout premier passage (rien envoyé)")
    a = p.parse_args()

    depot = os.environ.get("GITHUB_REPOSITORY", "")  # « propriétaire/dépôt » sur GitHub Actions
    pages = f"https://{depot.split('/')[0].lower()}.github.io/{depot.split('/')[1]}/" if "/" in depot else "https://example.invalid/"
    site = (os.environ.get("SITE_URL") or pages).rstrip("/") + "/"
    cle_api, compte_json, expediteur = (os.environ.get(k, "").strip() for k in ("BREVO_API_KEY", "FIREBASE_SERVICE_ACCOUNT", "EXPEDITEUR"))
    if a.essai:
        source = Fichier(a.essai)
    elif not compte_json or (not a.sans_envoi and not (cle_api and expediteur)):
        print("E-mails pas encore configurés (secrets BREVO_API_KEY, FIREBASE_SERVICE_ACCOUNT, variable EXPEDITEUR) : rien à faire.")
        return
    else:
        source = Firestore(compte_json)

    chemin = Path(a.etat)
    etat = json.loads(chemin.read_text()) if chemin.exists() else None
    maintenant = datetime.now(timezone.utc)
    demandes, abonnes = source.demandes(), source.abonnes()
    ids = {d["id"] for d in demandes}
    # demande supprimée ou dépubliée : on oublie ce qui la concerne
    deja = {c for c in (etat or {}).get("cles", []) if c.split(":")[1] in ids}
    evts = a_envoyer(demandes, abonnes, deja, maintenant)

    if etat is None and (not a.essai or a.premier_passage):
        print(f"Premier passage : {len(evts)} e-mails déjà justifiés notés comme envoyés, aucun envoi.")
        deja |= {e[0] for e in evts} | {f"alertes:{i}" for i in ids}
        evts = []

    jour = maintenant.astimezone(PARIS).date().isoformat()
    envoyes = (etat or {}).get("envoyes", 0) if (etat or {}).get("jour") == jour else 0
    bilan = {"envoyés": 0, "sans adresse": 0, "échecs": 0, "reportés (plafond du jour)": 0}

    def sauver():  # après chaque envoi : un passage coupé au milieu ne renvoie pas ce qui est déjà parti
        if not a.sans_envoi:
            chemin.write_text(json.dumps({"cles": sorted(deja), "jour": jour, "envoyes": envoyes}, indent=0))
    if a.apercus:
        Path(a.apercus).mkdir(parents=True, exist_ok=True)
    for cle, d, abonne in evts:
        if envoyes >= PLAFOND_JOUR:
            bilan["reportés (plafond du jour)"] += 1
            continue
        if abonne:
            adresse, nom = source.compte(abonne["uid"]), abonne.get("nom") or ""
        else:
            adresse, nom = source.contact(d)
        if not adresse:  # pas d'e-mail vérifié : on n'essaiera plus
            bilan["sans adresse"] += 1
            deja.add(cle)
            continue
        sujet, texte, page = message(cle, d, abonne, nom, site)
        genre = cle.split(":")[0]
        if a.essai or a.sans_envoi:
            if a.apercus:
                (Path(a.apercus) / (cle.replace(":", "_") + ".html")).write_text(
                    f"<p><b>À :</b> {html.escape(adresse)}<br><b>Objet :</b> {html.escape(sujet)}</p><hr>{page}", encoding="utf-8")
            ok, code = True, "essai"
        else:
            ok, code = envoyer_brevo(cle_api, expediteur, adresse, nom, sujet, texte, page, site, bool(abonne))
        print(f"{genre} {d['id']} : {('prêt, pas envoyé' if code == 'essai' else 'envoyé') if ok else 'échec'} ({code})")
        if ok:
            deja.add(cle)
            envoyes += 1
            bilan["envoyés"] += 1
            sauver()
        else:
            bilan["échecs"] += 1  # réessayé au prochain passage

    # tournée d'alertes finie pour une demande quand plus aucune alerte n'est en attente
    attente = {c.split(":")[1] for c, _, _ in a_envoyer(demandes, abonnes, deja, maintenant) if c.startswith("alerte:")}
    deja |= {f"alertes:{i}" for i in ids if i not in attente}

    print("Bilan : " + ", ".join(f"{k} {v}" for k, v in bilan.items()) + (" (essai : rien n'est parti)" if a.essai or a.sans_envoi else ""))
    sauver()


if __name__ == "__main__":
    main()
