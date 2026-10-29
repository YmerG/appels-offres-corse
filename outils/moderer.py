#!/usr/bin/env python3
"""Contrôle des demandes de travaux publiées d'Appels d'offres Corse, lancé toutes les heures sur le Mac de Rémy
(launchd : outils/fr.aocorse.moderation.plist).

Les demandes sont publiées dès leur création (firestore.rules). Ce script lit, SANS CLÉ, les demandes publiques
(statut « validee », comme le site) et vérifie celles qu'il n'a pas encore vues (voir verifier()). Lecture seule :
il n'écrit rien dans Firestore et ne lit jamais les coordonnées privées (demandes/{id}/prive, réservées à l'admin).
Si une demande pose problème, il prévient le Master une seule fois :
  python3 /Users/remy/ClaudeChat/tools/report.py "Modération AOC" "Demande à vérifier : <titre> — <raison> — <lien admin>"
(numéros, adresses et liens masqués dans le titre). Demandes déjà vues : .moderation-vues.json (local, pas publié).
Discussions privées (lot 18.6) : leurs nouveaux messages sont lus avec le compte admin (mot de passe dans le trousseau
du Mac, voir TROUSSEAU plus bas) et signalés de la même façon (« Message à vérifier : … »). Sans ce mot de passe : sautées.
Essai sur les vraies données, sans rien noter ni envoyer : --essai.
Contrôle automatique, sans réseau : python3 outils/test_moderer.py
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))
from collecte import normal  # noqa: E402  minuscules sans accents, comme pour les mots-clés des métiers


def cle_commune(t):
    """Même clé que AOC_COMMUNE (site/communes.js) : sans accents, majuscules, tirets, espaces, « L' » de tête, Saint/St."""
    t = re.sub(r"^\s*l['’]\s*", "", normal(t))
    t = re.sub(r"\bsainte\b", "ste", re.sub(r"\bsaint\b", "st", t))
    return re.sub(r"[^a-z]", "", t)


def lire_communes():
    """{clé : département} des 360 communes de Corse, depuis site/communes.js (liste officielle)."""
    t = (RACINE / "site" / "communes.js").read_text(encoding="utf-8")
    return {cle_commune(n): dep for n, dep in json.loads(re.search(r"AOC_COMMUNES = (\[.*?\]);", t).group(1))}


COMMUNES = lire_communes()
# shortcut: quelques hameaux souvent écrits à la place de leur commune ; en ajouter si les fausses alertes reviennent
COMMUNES.update({cle_commune(n): dep for n, dep in (
    ("Porticcio", "2A"), ("Sagone", "2A"), ("Tiuccia", "2A"), ("Pinarellu", "2A"), ("Pinarello", "2A"), ("Porto", "2A"),
    ("Moriani-Plage", "2B"), ("Moriani", "2B"), ("Folelli", "2B"), ("Casamozza", "2B"), ("Erbalunga", "2B"), ("Macinaggio", "2B"))})

# Tout ce qui permettrait de joindre le demandeur sans passer par le site (ses coordonnées restent privées).
TELEPHONE = re.compile(r"(?:\+33\s*(?:\(0\))?\s*|\b0)[1-9](?:[\s.\-/,]*\d\d){4}\b|\+\d(?:[\s.\-/,]?\d){7,}")
# fournisseur seul (« pas de compte Gmail ») : rien ; suivi de « : », « . », « point », « com », « fr » : une adresse
EMAIL = re.compile(r"\S+\s*(?:@|\(at\)|\[at\]|\s(?:at|arobase)\s)\s*\S+"
                   r"|(?<![a-z])(?:g\W?mail|hotmail|outlook|yahoo|wanadoo|laposte|icloud|protonmail)\s*(?::|\.|point\b|com\b|fr\b)"
                   r"|\bpoint\W+(?:com|fr|net|org)\b", re.I)
LIEN = re.compile(r"https?://|\bwww\b|\b[\w-]+\.(?:com|fr|net|org|eu|io|corsica|info|biz|me|ly|gl|be|ch)\b"
                  r"|\b[\w-]+\s*\.\s*(?:com|fr|net|org|corsica)\b", re.I)
# Numéro en toutes lettres : « zéro six douze trente-quatre… »
NOMBRES = ("zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|vingts"
           "|trente|quarante|cinquante|soixante|septante|huitante|nonante|cent|et")
EN_LETTRES = re.compile(rf"\bz[eé]ro(?:[\s,.-]+(?:{NOMBRES})\b){{4,}}", re.I)
# Listes en minuscules sans accents (comparées à normal(texte)), pluriel compris, même collées à des chiffres.
RESEAUX = ["facebook", "fb", "instagram", "insta", "whatsapp", "whats app", "snapchat", "snap", "tiktok", "telegram",
           "messenger", "linkedin", "twitter", "leboncoin", "wa me", "viber", "wechat", "skype", "discord"]
# pas « con » (« avec » en corse et en italien), ni voleur, escroc, arnaqueur (souvent la raison des travaux)
INSULTES = ["conne", "connard", "connasse", "salope", "pute", "putain", "merde", "merdique", "encule", "enculer",
            "batard", "fdp", "ntm", "nique", "niquer", "abruti", "debile", "cretin", "pd", "tapette", "bouffon",
            "enfoire", "salaud", "salopard", "ordure", "couille", "bite", "chier"]
PUB = ["casino", "crypto", "bitcoin", "forex", "trading", "viagra", "cialis", "porno", "sexe", "escort",
       "cliquez", "abonnez", "code promo", "backlink", "seo", "loterie", "gagnez", "gagner de l argent",
       "pret d argent", "investissement garanti", "travail a domicile"]


def _mots(liste):
    return re.compile(r"(?<![a-z])(?:" + "|".join(re.escape(m).replace(r"\ ", r"\W+") for m in liste) + r")s?(?![a-z])")


RE_RESEAUX, RE_INSULTES, RE_PUB = _mots(RESEAUX), _mots(INSULTES), _mots(PUB)


def absurde(t):
    """Texte qui ne ressemble pas à du français : tapé au hasard (« qsdfghjk »), mot géant, presque pas de mots."""
    lettres = [c for c in normal(t) if "a" <= c <= "z"]
    mots = re.findall(r"[^\W\d_]{2,}", t)
    if len(mots) < 3 or any(len(m) > 30 for m in t.split()):
        return True
    voy = sum(c in "aeiouy" for c in lettres) / len(lettres)
    return not 0.25 <= voy <= 0.65


def verifier(d):
    """Raisons de signaler la demande à Rémy ([] = rien à signaler). La date limite est contrôlée par les règles."""
    r = []
    titre, desc = (d.get("titre") or "").strip(), (d.get("description") or "").strip()
    if d.get("photos"):
        r.append("photos à regarder")  # publiques aussi : seul un humain peut les juger
    if not 8 <= len(titre) <= 120:
        r.append("titre trop court ou trop long")
    if not 30 <= len(desc) <= 1500:
        r.append("description trop courte ou trop longue")
    commune = d.get("commune") or ""
    r += contenu(titre + "\n" + desc + "\n" + commune)  # la commune est affichée sur la carte publique : contrôlée aussi
    for t in (titre, desc):
        if criarde(t):
            r.append("trop de majuscules")
            break
    if desc and absurde(titre + " " + desc):
        r.append("texte incompréhensible")
    # « Ota (Porto) » : la commune ou le hameau entre parenthèses
    dep = next((COMMUNES[k] for k in map(cle_commune, [commune] + re.findall(r"[^()]+", commune)) if k in COMMUNES), None)
    if re.search(r"[^\w\s'’()-]|[\d_]", commune):
        r.append("caractères inattendus dans la commune")
    elif not dep:
        r.append("commune inconnue en Corse")
    elif dep != d.get("departement"):
        r.append(f"commune en {dep}, département {d.get('departement')}")
    return r


def unifier(t):
    """Tirets et espaces Unicode (insécables, fines…) ramenés à « - » et « », pour ne pas tromper les recherches."""
    return re.sub(r"[  -​  　]", " ", re.sub(r"[‐-―−﹘﹣－]", "-", t))


def contenu(texte, coordonnees=True):
    """Raisons liées au texte lui-même ; coordonnees=False pour la discussion privée, où s'échanger un numéro est normal."""
    r = []
    texte = unifier(texte)
    n = " " + normal(texte).replace("’", "'").replace("'", " ") + " "
    if coordonnees:
        colle = re.sub(r"(?<=\d)[\s.\-/,]+(?=\d)", "", texte)  # « 0 6 . 1 2 . 3 4… » : chiffres recollés
        if TELEPHONE.search(texte) or EN_LETTRES.search(n) or re.search(r"(?<!\d)0[1-9]\d{8}(?!\d)", colle):
            r.append("numéro de téléphone")
        for motif, raison in ((EMAIL, "adresse e-mail"), (LIEN, "lien vers un site")):
            if motif.search(texte):
                r.append(raison)
        if RE_RESEAUX.search(n):
            r.append("réseau social ou messagerie")
    if RE_INSULTES.search(n):
        r.append("mot grossier")
    if RE_PUB.search(n):
        r.append("publicité ou spam")
    if re.search(r"([^\W\d_])\1{3,}|[!?]{4,}", texte) or re.search(r"\b(\w+)(?:\W+\1\b){3,}", n):
        r.append("répétitions")
    return r


def criarde(t):
    lettres = [c for c in t if c.isalpha()]
    return len(lettres) >= 12 and sum(c.isupper() for c in lettres) > 0.6 * len(lettres)


def masquer(t):
    """Titre du message : sans numéro, adresse ni lien (le message sort du site)."""
    t = unifier(t)
    for motif in (TELEPHONE, EMAIL, LIEN, EN_LETTRES):
        t = motif.sub("[masqué]", t)
    return " ".join(t.split())


CONFIG = (RACINE / "site" / "firebase-config.js").read_text(encoding="utf-8")
PROJET = re.search(r"projectId: '([^']+)'", CONFIG).group(1)
CLE_API = re.search(r"apiKey: '([^']+)'", CONFIG).group(1)  # clé publique du site, pas un secret
REQUETE = f"https://firestore.googleapis.com/v1/projects/{PROJET}/databases/(default)/documents:runQuery?key={CLE_API}"
ADMIN = "https://ymerg.github.io/appels-offres-corse/admin.html"
REPORT = "/Users/remy/ClaudeChat/tools/report.py"
ETAT = RACINE / ".moderation-vues.json"


def valeur(v):
    """Valeur Firestore REST → Python (champs lus : textes et nombres entiers)."""
    (genre, x), = v.items()
    return int(x) if genre == "integerValue" else x


def publiees():
    """Demandes publiques, sans photos (sous-collection) ni coordonnées : la même requête que le site (demandes.js)."""
    q = {"structuredQuery": {
        "from": [{"collectionId": "demandes"}],
        "where": {"fieldFilter": {"field": {"fieldPath": "statut"}, "op": "EQUAL", "value": {"stringValue": "validee"}}},
        "select": {"fields": [{"fieldPath": c} for c in ("titre", "description", "commune", "departement", "photos", "type")]}}}
    req = urllib.request.Request(REQUETE, data=json.dumps(q).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    return [dict({k: valeur(v) for k, v in x["document"].get("fields", {}).items()}, id=x["document"]["name"].rsplit("/", 1)[1])
            for x in res if "document" in x]


def signaler(texte):
    return subprocess.run([sys.executable, REPORT, "Modération AOC", texte], timeout=60).returncode == 0


def moderer(demandes, vues, essai, signaler):
    """Un passage : vérifie les demandes pas encore vues, signale celles qui posent problème. Renvoie les demandes vues à garder."""
    garder = {d["id"] for d in demandes} & vues  # demande retirée ou supprimée : oubliée
    bilan = {"nouvelles": 0, "à vérifier": 0, "signalées": 0}
    for d in sorted(demandes, key=lambda d: d["id"]):
        if d["id"] in vues:
            continue
        bilan["nouvelles"] += 1
        if d.get("type") == "public":  # avis d'acheteur (lot 19) : relu dans admin.html avant d'être publié
            print(f"{d['id']} : avis d'acheteur, déjà validé à la main")
            garder.add(d["id"])
            continue
        raisons = verifier(d)
        if not raisons:
            print(f"{d['id']} : rien à signaler")
            garder.add(d["id"])
            continue
        bilan["à vérifier"] += 1
        print(f"{d['id']} : à vérifier ({', '.join(raisons)})")
        texte = f"Demande à vérifier : {masquer(d.get('titre') or '(sans titre)')} — {', '.join(raisons)} — {ADMIN}#d-{d['id']}"
        if essai:
            print(f"  essai, pas envoyé : {texte}")
        elif signaler(texte):  # échec : réessayé au prochain passage
            garder.add(d["id"])
            bilan["signalées"] += 1
    print("Bilan : " + ", ".join(f"{k} {v}" for k, v in bilan.items()) + (" (essai : rien n'est noté ni envoyé)" if essai else ""))
    return garder


# Discussions privées (lot 18.6) : lues avec le compte admin du site (les règles le permettent pour la modération).
# Mot de passe dans le trousseau du Mac, jamais dans un fichier :
#   security add-generic-password -s aocorse-admin -a <e-mail admin> -w      (le mot de passe est demandé)
TROUSSEAU = "aocorse-admin"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJET}/databases/(default)/documents"


def verifier_message(texte):
    """Raisons de signaler un message de discussion. Pas les coordonnées : s'échanger un numéro y est normal."""
    return contenu(texte, coordonnees=False) + (["trop de majuscules"] if criarde(texte) else [])


def connexion_admin():
    """Jeton du compte admin, ou None si le trousseau n'a pas son mot de passe."""
    try:
        att = subprocess.run(["security", "find-generic-password", "-s", TROUSSEAU], capture_output=True, text=True, timeout=20)
        mdp = subprocess.run(["security", "find-generic-password", "-s", TROUSSEAU, "-w"], capture_output=True, text=True, timeout=20)
    except OSError:
        return None
    email = re.search(r'"acct"<blob>="([^"]+)"', att.stdout)
    if att.returncode or mdp.returncode or not email:
        return None
    corps = {"email": email.group(1), "password": mdp.stdout.rstrip("\n"), "returnSecureToken": True}
    req = urllib.request.Request(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={CLE_API}",
                                 data=json.dumps(corps).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["idToken"]


def requete_admin(parent, q, jeton):
    req = urllib.request.Request(f"{parent}:runQuery", data=json.dumps({"structuredQuery": q}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + jeton})
    with urllib.request.urlopen(req, timeout=30) as r:
        return [x["document"] for x in json.loads(r.read()) if "document" in x]


def apres(champ, depuis):
    return {"fieldFilter": {"field": {"fieldPath": champ}, "op": "GREATER_THAN", "value": {"timestampValue": depuis}}}


def quand(iso):
    """Heure Firestore (« …T10:00:00.123456789Z ») → datetime, pour comparer (le texte seul ne se trie pas toujours bien)."""
    return datetime.fromisoformat(re.sub(r"(\.\d{6})\d+", r"\1", iso).replace("Z", "+00:00"))


def nouveaux_messages(jeton, depuis):
    """Messages écrits après « depuis », avec leur demande : discussions mises à jour depuis, puis leurs nouveaux messages."""
    out = []
    for d in requete_admin(BASE, {"from": [{"collectionId": "discussions"}], "where": apres("maj", depuis)}, jeton):
        demande = d["fields"]["demande"]["stringValue"]
        for m in requete_admin(f"https://firestore.googleapis.com/v1/{d['name']}",
                               {"from": [{"collectionId": "messages"}], "where": apres("cree", depuis),
                                "orderBy": [{"field": {"fieldPath": "cree"}}]}, jeton):
            out.append({"demande": demande, "texte": m["fields"]["texte"]["stringValue"], "cree": m["fields"]["cree"]["timestampValue"]})
    return out


def moderer_messages(messages, depuis, essai, signaler):
    """Signale les messages qui posent problème, dans l'ordre. Renvoie le nouveau « depuis » : arrêté au premier envoi raté."""
    for m in sorted(messages, key=lambda m: quand(m["cree"])):
        raisons = verifier_message(m["texte"])
        if raisons:
            extrait = masquer(m["texte"])
            extrait = extrait if len(extrait) <= 80 else extrait[:79] + "…"
            texte = f"Message à vérifier : « {extrait} » — {', '.join(raisons)} — {ADMIN}#d-{m['demande']}"
            print(f"message du {m['cree']} (demande {m['demande']}) : à vérifier ({', '.join(raisons)})")
            if essai:
                print(f"  essai, pas envoyé : {texte}")
            elif not signaler(texte):
                return depuis  # réessayé au prochain passage
        if quand(m["cree"]) > quand(depuis):
            depuis = m["cree"]
    return depuis


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--essai", action="store_true", help="vraies données : rien n'est noté ni envoyé")
    a = p.parse_args()
    print(datetime.now().strftime("%d/%m/%Y %H:%M"))
    try:
        demandes = publiees()
    except (OSError, ValueError) as e:  # pas de réseau, Firestore indisponible : on réessaie dans une heure
        sys.exit(f"Lecture impossible ({type(e).__name__} : {e}) : rien de changé.")
    etat = json.loads(ETAT.read_text()) if ETAT.exists() else {}
    garder = moderer(demandes, set(etat.get("vues", [])), a.essai, signaler)
    depuis = etat.get("messages_depuis", "2026-01-01T00:00:00Z")
    try:
        jeton = connexion_admin()
        if jeton:
            depuis = moderer_messages(nouveaux_messages(jeton, depuis), depuis, a.essai, signaler)
        else:
            print("Discussions pas contrôlées : mot de passe admin absent du trousseau (voir README).")
    except (OSError, ValueError, KeyError) as e:
        print(f"Discussions pas contrôlées ({type(e).__name__}) : nouvel essai dans une heure.")
    if not a.essai:
        ETAT.write_text(json.dumps({"vues": sorted(garder), "messages_depuis": depuis}, indent=0))


if __name__ == "__main__":
    main()
