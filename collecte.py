"""Collecte les appels d'offres en cours en Corse (2A, 2B) depuis l'API ouverte du BOAMP et génère le site statique dans site/.

Usage : python3 collecte.py
Produit site/index.html (avis déjà dans la page : s'ouvre sans serveur, même sans JS)
et site/data.json (les mêmes données, pour d'autres usages).
Données : BOAMP (DILA), Licence Ouverte 2.0. Bibliothèque standard uniquement.
On ne reprend aucune donnée personnelle des avis (noms, téléphones, courriels des correspondants).
"""
import html
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

try:
    from zoneinfo import ZoneInfo
    PARIS = ZoneInfo("Europe/Paris")
except Exception:  # pas de base des fuseaux : on reste en UTC
    PARIS = timezone.utc

ICI = Path(__file__).resolve().parent
SORTIE = ICI / "site"
API = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records"
UA = "Mozilla/5.0 (compatible; AppelsOffresCorse/1.0; lecture de l'API ouverte du BOAMP)"
DEPARTEMENTS = {"20A": ("2A", "Corse-du-Sud"), "20B": ("2B", "Haute-Corse")}  # codes du BOAMP -> codes usuels
CHAMPS = ("idweb,objet,famille_libelle,code_departement,dateparution,datelimitereponse,nomacheteur,etat,"
          "annonce_lie,descripteur_libelle,type_marche,gestion,donnees,url_avis,contractfolderid")
JOURS = "lun. mar. mer. jeu. ven. sam. dim.".split()
MOIS = "janv. févr. mars avr. mai juin juil. août sept. oct. nov. déc.".split()

# Métiers : nom affiché et couleur (assez foncée pour du texte sur fond clair)
METIERS = {
    "gros-oeuvre": ("Gros œuvre, bâtiment", "#8a4b2a"),
    "second-oeuvre": ("Second œuvre, finitions", "#946000"),
    "electricite": ("Électricité, éclairage", "#7a6400"),
    "plomberie-cvc": ("Plomberie, chauffage, clim", "#0b6e8a"),
    "voirie-vrd": ("Voirie, réseaux (VRD)", "#4a5560"),
    "espaces-verts": ("Espaces verts", "#2f7d32"),
    "nettoyage": ("Nettoyage, déchets", "#127a6a"),
    "informatique": ("Informatique, télécoms", "#4b4fc4"),
    "etudes": ("Études, maîtrise d'œuvre", "#7b3fa0"),
    "restauration": ("Restauration, alimentation", "#b03a2e"),
    "services": ("Services", "#2c5d8f"),
    "fournitures": ("Fournitures, équipements", "#6b5b3e"),
}
# shortcut: regroupement par préfixes CPV, quelques avis mal rangés (ex. observations en mer -> espaces verts) ; affiner avec les retours des artisans
# Début du code CPV -> métier ; le préfixe le plus long l'emporte. Au-delà : 45 = gros œuvre, < 45 = fournitures, >= 50 = services.
CPV = {
    "4511": "gros-oeuvre", "45112": "voirie-vrd", "4511271": "espaces-verts", "45221": "voirie-vrd",
    "4523": "voirie-vrd", "4524": "voirie-vrd", "45236": "voirie-vrd", "34928": "voirie-vrd", "34992": "voirie-vrd", "904": "voirie-vrd",
    "4532": "second-oeuvre", "4534": "second-oeuvre", "4541": "second-oeuvre", "4542": "second-oeuvre",
    "4543": "second-oeuvre", "4544": "second-oeuvre", "4545": "second-oeuvre",
    "4531": "electricite", "45261215": "electricite", "3121": "electricite", "3122": "electricite", "315": "electricite", "3168": "electricite",
    "50711": "electricite", "50232": "electricite", "09331": "electricite",
    "4533": "plomberie-cvc", "4535": "plomberie-cvc", "50712": "plomberie-cvc", "50720": "plomberie-cvc", "50730": "plomberie-cvc",
    "39715": "plomberie-cvc", "4216": "plomberie-cvc", "4252": "plomberie-cvc", "4253": "plomberie-cvc", "4441": "plomberie-cvc",
    "77": "espaces-verts", "034": "espaces-verts",
    "905": "nettoyage", "906": "nettoyage", "907": "nettoyage", "909": "nettoyage",
    "30": "informatique", "32": "informatique", "48": "informatique", "72": "informatique", "503": "informatique", "6421": "informatique",
    "301997": "services",  # titres-restaurant, rangés par le CPV parmi le matériel de bureau
    "71": "etudes", "73": "etudes", "9071": "etudes", "9072": "etudes", "7931": "etudes", "0334": "fournitures",
    "03": "restauration", "15": "restauration", "555": "restauration", "553": "restauration",
}
# Sans code CPV (certains avis MAPA) : on se rabat sur les descripteurs du BOAMP, en minuscules sans accents
DESCRIPTEURS = [
    ("electricite", r"electricite|eclairage|illumination|photovolta"),
    ("plomberie-cvc", r"plomberie|chauffage|climatisation|ventilation|sanitaire|thermique"),
    ("voirie-vrd", r"voirie|reseaux divers|assainissement|terrassement|signalisation|eau potable"),
    ("espaces-verts", r"espaces verts|elagage|paysag|mobilier urbain"),
    ("nettoyage", r"nettoyage|ordures|dechets|proprete|blanchissage"),
    ("informatique", r"informatique|logiciel|telecom"),
    ("etudes", r"maitrise d'oeuvre|etude|ingenierie|assistance a maitrise|architect|diagnostic"),
    ("restauration", r"denrees|repas|restauration|traiteur|alimentaire"),
    ("second-oeuvre", r"menuiserie|peinture \(travaux|platrerie|revetements|isolation|etancheite|serrurerie|metallerie|ferronnerie|vitrerie"),
    ("gros-oeuvre", r"maconnerie|batiment|demolition|charpente|couverture|tous corps|monuments|ouvrage metallique|amiante"),
]
# shortcut: graphies officielles des communes vues mal écrites dans les avis ; compléter au fil des collectes
NOMS_OFFICIELS = {"lilerousse": "L'Île-Rousse", "ilerousse": "L'Île-Rousse", "portovecchio": "Porto-Vecchio"}
PETITS_MOTS = {"di", "de", "du", "des", "la", "le", "les", "d", "l", "a", "e", "en", "sur"}
PAR_TYPE = {"TRAVAUX": "gros-oeuvre", "FOURNITURES": "fournitures"}  # sinon services


def normal(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


def propre(s, n=0):
    """Espaces normalisés ; un texte TOUT EN CAPITALES passe en minuscules (plus lisible)."""
    s = re.sub(r"(?<![^\W\d_])uvre", "œuvre", " ".join((s or "").replace("\x9c", "œ").split()))  # « mise en uvre » : le BOAMP perd parfois le « œ »
    if sum(c.isupper() for c in s) > 0.7 * sum(c.isalpha() for c in s) > 0:
        s = s[0] + s[1:].lower()
    return s if not n or len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"


def metier_cpv(code):
    for i in range(len(code), 1, -1):
        if code[:i] in CPV:
            return CPV[code[:i]]
    return "gros-oeuvre" if code[:2] == "45" else "fournitures" if code[:2] < "45" else "services"


def feuilles(o, chemin=()):
    """Toutes les valeurs d'un avis avec leur chemin (préfixes d'espace de noms retirés)."""
    if isinstance(o, dict):
        for k, v in o.items():
            yield from feuilles(v, chemin + (k.split(":")[-1],))
    elif isinstance(o, list):
        for v in o:
            yield from feuilles(v, chemin)
    else:
        yield chemin, o


def de_lot(chemin):
    return any(c in ("ProcurementProjectLot", "lots", "lot") for c in chemin)


def nombre(v):
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def lieu_texte(t):
    """« Petrapola\\n20243\\nIsolaccio » -> Isolaccio ; « FRM02 - Haute-Corse » -> None (département seul)."""
    t = re.sub(r"\s*\(2[ab]\)", "", str(t), flags=re.I)  # « CALVI (2B) »
    lignes = [l.strip(" ,-") for l in t.splitlines() if l.strip(" ,-")]
    if not lignes or re.match(r"FRM0?\d?\b", lignes[0]):
        return None
    for i, l in enumerate(lignes[:-1]):
        if re.fullmatch(r"20\d{3}", l):
            return lignes[i + 1]
    m = re.search(r"\b20\d{3}\s+([^\d,:()\n-]{2,40})", " ".join(lignes))
    if m:
        return m.group(1).strip()
    l = lignes[0]  # une ligne courte sans « : » ni chiffre est un nom de lieu ; sinon le département suffira
    return l if len(l) <= 30 and not re.search(r"[:\d]", l) else None


def nom_lieu(l):
    """« Bastia cedex », « Mairie de San martino di lota » -> Bastia, San Martino di Lota ;
    « Cantine scolaire », « Section F » -> None (le département prendra la place)."""
    l = re.sub(r"\s*\(2[ab]\)|\s+cedex.*|^(?:mairie|commune|ville|village) d[eu]\s+", "", propre(l), flags=re.I).strip(" -")
    if not l or re.search(r"\b(?:cantine|section|ecole|college|lycee|locaux|plusieurs|divers|voir)\b", normal(l)):
        return None
    l = re.sub(r"(?i)^corse du sud$", "Corse-du-Sud", l)
    if re.sub(r"[\W_]", "", normal(l)) in NOMS_OFFICIELS:
        return NOMS_OFFICIELS[re.sub(r"[\W_]", "", normal(l))]
    mots = re.split(r"([ '-])", l)  # majuscule à chaque mot sauf les petits mots : Isolaccio-di-Fiumorbo
    return "".join(m if i and m.lower() in PETITS_MOTS else m[:1].upper() + m[1:] for i, m in enumerate(mots))


def analyser(donnees):
    """Codes CPV (principal d'abord), montant (valeur, "estimé" | "max") et lieu d'exécution d'un avis."""
    cpv_haut, cpv_lots, lieux = [], [], []
    montants = {(lot, genre): [] for lot in (False, True) for genre in ("estimé", "max")}
    for chemin, v in feuilles(donnees):
        fin = chemin[-2:]
        if chemin[-1] == "classPrincipale" or fin == ("ItemClassificationCode", "#text"):
            m = re.match(r"\d{8}", str(v).strip())
            if m:
                (cpv_lots if de_lot(chemin) else cpv_haut).append(m.group())
        elif fin in (("EstimatedOverallContractAmount", "#text"), ("valeurEstimee", "valeur"), ("estimationValeur", "valeur")):
            montants[de_lot(chemin), "estimé"].append(nombre(v))
        elif fin in (("FrameworkMaximumAmount", "#text"), ("fourchette", "valeurHaute")):
            montants[de_lot(chemin), "max"].append(nombre(v))
        elif chemin[-1] == "CityName" and "RealizedLocation" in chemin or (chemin[-1] == "ville" and "lieuExecutionLivraison" in chemin):
            lieux.append(str(v).strip())
        elif chemin[-1] in ("lieuExecutionLivraison", "lieuExecution") or fin == ("Description", "#text") and "RealizedLocation" in chemin:
            lieux.append(lieu_texte(v))
    montant = None
    for lot, genre in ((False, "estimé"), (False, "max"), (True, "estimé"), (True, "max")):
        vals = [x for x in montants[lot, genre] if x]
        if vals:
            montant = (max(vals) if not lot else sum(vals), genre)
            break
    return list(dict.fromkeys(cpv_haut + cpv_lots)), montant, next((nom_lieu(l) for l in lieux if l and nom_lieu(l)), None)


def metiers_de(r, cpvs):
    texte = normal(" ".join(r.get("descripteur_libelle") or []))
    descr = [k for k, motif in DESCRIPTEURS if re.search(motif, texte)]
    par_cpv = [metier_cpv(c) for c in cpvs]
    if "TRAVAUX" in (r.get("type_marche") or []):
        # les lots d'un chantier se lisent mieux dans les descripteurs ; les CPV de matériaux (44…, 09…) ne sont pas des fournitures
        trouves = [m for m in par_cpv if m != "fournitures"] + descr
    else:
        trouves = par_cpv or descr
    return list(dict.fromkeys(trouves)) or [PAR_TYPE.get(((r.get("type_marche") or ["SERVICES"])[0]), "services")]


def date_limite(r):
    """Heure écrite dans l'avis, lue en heure de Paris comme sur boamp.fr : le fuseau fourni (Z, +02:00 en hiver…) est souvent faux."""
    brut = (json.loads(r.get("gestion") or "{}").get("INDEXATION") or {}).get("DATE_LIMITE_REPONSE") or r.get("datelimitereponse")
    if not brut:
        return None
    return datetime.fromisoformat(brut[:19]).replace(tzinfo=PARIS)


def lire_api(depuis):
    """Tous les avis de Corse dont la date limite n'est pas passée (pages de 100)."""
    tout, offset = [], 0
    ou = f'code_departement in ("20A","20B") and datelimitereponse >= date\'{depuis:%Y-%m-%d}\''
    while True:
        url = API + "?" + urlencode({"where": ou, "select": CHAMPS, "order_by": "datelimitereponse", "limit": 100, "offset": offset})
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as rep:
            page = json.load(rep)["results"]
        tout += page
        offset += 100
        if len(page) < 100 or offset >= 9900:  # l'API refuse au-delà de 10 000
            return tout


def avis_de(brut, maintenant):
    remplaces = {i for r in brut for i in (r.get("annonce_lie") or [])}  # avis initiaux remplacés par un rectificatif
    gardes = {}
    for r in sorted(brut, key=lambda r: r.get("dateparution") or ""):
        limite = date_limite(r)
        if r["idweb"] in remplaces or not limite or limite < maintenant:
            continue
        cpvs, montant, lieu = analyser(json.loads(r.get("donnees") or "{}"))
        if lieu and normal(lieu) == normal(r.get("nomacheteur") or ""):
            lieu = None  # le « lieu » recopie parfois le nom de l'acheteur
        deps = [DEPARTEMENTS[c] for c in (r.get("code_departement") or []) if c in DEPARTEMENTS]
        cle = r.get("contractfolderid") or (normal(r.get("objet") or ""), r.get("nomacheteur"))
        gardes[cle] = {  # le plus récent l'emporte (republication d'un même marché)
            "id": r["idweb"],
            "objet": propre(r.get("objet"), 220),
            "acheteur": " ".join((r.get("nomacheteur") or "").split()),  # sigles gardés (SPL, CHU…)
            "lieu": lieu or (deps[0][1] if deps else "Corse"),
            "departement": deps[0][0] if deps else "",
            "metiers": metiers_de(r, cpvs),
            "cpv": cpvs[:8],
            "montant": montant[0] if montant else None,
            "montant_type": montant[1] if montant else None,
            "date_limite": limite.isoformat(),
            "publie": r.get("dateparution"),
            "procedure": r.get("famille_libelle") or "",
            "rectifie": r.get("etat") == "RECTIFICATIF",
            "lien": r.get("url_avis") or f"https://www.boamp.fr/pages/avis/?q=idweb:{r['idweb']}",
        }
    return sorted(gardes.values(), key=lambda a: a["date_limite"])


def euros(x):
    if x >= 1e6:
        return f"{x / 1e6:.1f}".replace(".", ",").replace(",0", "") + " M€"
    return f"{round(x):,}".replace(",", " ") + " €"


def date_fr(iso, heure=True):
    d = datetime.fromisoformat(iso).astimezone(PARIS)
    h = f", {d.hour} h" + (f" {d:%M}" if d.minute else "") if heure else ""
    return f"{JOURS[d.weekday()]} {d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]} {d.year}{h}"


def carte(a):
    e = html.escape
    d = datetime.fromisoformat(a["date_limite"]).astimezone(PARIS)
    # tous les métiers sont dans la page (2 visibles) : le filtre actif remonte le sien en tête (app.js)
    noms = "".join(f'<span class="metier" data-m="{m}" style="--c:{METIERS[m][1]}"{" hidden" if i >= 2 else ""}>{METIERS[m][0]}</span>'
                   for i, m in enumerate(a["metiers"]))
    if len(a["metiers"]) > 2:
        noms += f'<span class="metier autres" title="{e(", ".join(METIERS[m][0] for m in a["metiers"][2:]))}">+{len(a["metiers"]) - 2}</span>'
    infos = [("Lieu", e(a["lieu"]))]
    if a["montant"]:
        infos.append(("Montant max." if a["montant_type"] == "max" else "Montant estimé", euros(a["montant"]) + " HT"))
    infos.append(("Procédure", e(a["procedure"])))
    dl = "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in infos)
    rectif = '<span class="rectif">Rectifié</span>' if a["rectifie"] else ""
    return (f'<article class="avis" data-metiers="{" ".join(a["metiers"])}" data-dep="{a["departement"]}" '
            f'data-limite="{e(a["date_limite"])}" data-publie="{e(a["publie"] or "")}" data-montant="{round(a["montant"] or 0)}" style="--c:{METIERS[a["metiers"][0]][1]}">'
            f'<div class="echeance" aria-hidden="true"><span class="jour">{d.day}</span><span class="mois">{MOIS[d.month - 1]}</span>'
            f'<span class="reste"></span></div>'
            f'<div class="corps"><p class="haut">{noms}<span class="dep">{e(a["departement"])}</span>{rectif}</p>'
            f'<h3><a href="{e(a["lien"])}" rel="noopener">{e(a["objet"])}</a></h3>'
            f'<p class="acheteur">{e(a["acheteur"])}</p><dl class="infos">{dl}</dl>'
            f'<p class="limite"><span class="badge" hidden>Bientôt clos</span>Réponse avant le '
            f'<time datetime="{e(a["date_limite"])}">{date_fr(a["date_limite"])}</time></p></div></article>')


def main():
    maintenant = datetime.now(timezone.utc)
    try:
        brut = lire_api(maintenant - timedelta(days=1))
    except Exception as err:  # API en panne ou pas d'Internet : on garde le site précédent
        sys.exit(f"API du BOAMP injoignable ({err}) : site non modifié.")
    avis = avis_de(brut, maintenant)
    if not avis:
        sys.exit("Aucun avis en cours trouvé : site non modifié.")

    nb = {k: sum(k in a["metiers"] for a in avis) for k in METIERS}
    boutons = "".join(
        f'<button type="button" class="filtre" data-metier="{k}" aria-pressed="false" style="--c:{coul}">'
        f'<span class="pastille" aria-hidden="true"></span>{nom} <span class="nb">{nb[k]}</span></button>'
        for k, (nom, coul) in METIERS.items() if nb[k])
    remplacements = {
        "<!--METIERS-->": boutons,
        "<!--AVIS-->": "\n".join(carte(a) for a in avis),
        "<!--NB-->": str(len(avis)),
        "<!--NB_2A-->": str(sum(a["departement"] == "2A" for a in avis)),
        "<!--NB_2B-->": str(sum(a["departement"] == "2B" for a in avis)),
        "<!--MAJ-->": f'<time datetime="{maintenant.isoformat(timespec="seconds")}">{maintenant.astimezone(PARIS):%d/%m/%Y à %H h %M}</time>',
    }
    page = (ICI / "modele.html").read_text(encoding="utf-8")
    for cle, val in remplacements.items():
        page = page.replace(cle, val)
    SORTIE.mkdir(exist_ok=True)
    (SORTIE / "index.html").write_text(page, encoding="utf-8")
    donnees = {"genere_le": maintenant.isoformat(timespec="seconds"), "source": "BOAMP (DILA), Licence Ouverte 2.0",
               "metiers": {k: v[0] for k, v in METIERS.items()}, "avis": avis}
    (SORTIE / "data.json").write_text(json.dumps(donnees, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(brut)} avis lus, {len(avis)} en cours -> {SORTIE / 'index.html'}")
    for k, (nom, _) in METIERS.items():
        print(f"  {nb[k]:3d}  {nom}")


if __name__ == "__main__":
    main()
