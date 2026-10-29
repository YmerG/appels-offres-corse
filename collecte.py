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
    "gros-oeuvre": ("Gros œuvre, bâtiment", "#c93400"),
    "second-oeuvre": ("Second œuvre, finitions", "#7f6545"),
    "electricite": ("Électricité, éclairage", "#b25000"),
    "plomberie-cvc": ("Plomberie, chauffage, clim", "#0071a4"),
    "voirie-vrd": ("Voirie, réseaux (VRD)", "#6c6c70"),
    "espaces-verts": ("Espaces verts", "#248a3d"),
    "nettoyage": ("Nettoyage, déchets", "#0c817b"),
    "informatique": ("Informatique, télécoms", "#3634a3"),
    "etudes": ("Études, maîtrise d'œuvre", "#8944ab"),
    "restauration": ("Restauration, alimentation", "#d30f45"),
    "services": ("Services", "#0040dd"),
    "fournitures": ("Fournitures, équipements", "#008299"),
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
    l = re.sub(r"\s*\(2[ab]\)|\s+cedex.*|\s+(?:mail|courriel|t[ée]l)\b.*|^(?:mairie|commune|ville|village)\s+(?!di\s)(?:de\s+|du\s+|d['’]\s*)?", "", propre(l), flags=re.I).strip(" -")
    # rapport 30 : « Ville d'Ajaccio » -> Ajaccio, mais « Ville di Pietrabugno » est une commune
    # rapport 29 : « Sans Objet », « Services Techniques Municipaux », « Hôtel Consulaire », « 20620 », « Ba », phrase entière
    if (sum(c.isalpha() for c in l) < 3 or len(l) > 60
            or re.search(r"\b(?:cantine|section|ecole|college|lycee|locaux|plusieurs|divers|voir|sans objet|services?|hotel|lieux)\b", normal(l))):
        return None
    l = re.sub(r"(?i)^corse du sud$", "Corse-du-Sud", re.sub(r"(?i)^haute corse$", "Haute-Corse", l))
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


def dossier(donnees):
    """Adresse du dossier de consultation (DCE) écrite dans l'avis, sinon celle de la plateforme de l'acheteur : (url, "dce" | "profil") ou None."""
    dce, profil = [], []
    for chemin, v in feuilles(donnees):
        v = html.unescape(str(v).strip())  # « &amp;type=DCE » dans certains avis
        if v.lower().startswith("www."):
            v = "https://" + v
        if not re.fullmatch(r"https?://[^\s\"'<>]+", v):
            continue
        est_dce = chemin[-1] == "URI" and "CallForTendersDocumentReference" in chemin or chemin[-1] in ("urlDocConsul", "urlDocument")
        # une adresse sans chemin ni paramètre (https://www.marches-publics.gouv.fr) n'est que l'accueil de la plateforme
        accueil = bool(re.fullmatch(r"https?://[^/?#]+/?", v))
        if est_dce and not accueil:
            dce.append(v)
        elif est_dce or chemin[-1] in ("BuyerProfileURI", "urlProfilAch", "urlProfilAcheteur"):
            profil.append((accueil, v))
    # plateforme : une adresse précise avant un simple accueil (tri stable : sinon, l'ordre de l'avis)
    return (dce[0], "dce") if dce else (sorted(profil, key=lambda p: p[0])[0][1], "profil") if profil else None


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
        donnees = json.loads(r.get("donnees") or "{}")
        cpvs, montant, lieu = analyser(donnees)
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
            "dossier": dossier(donnees),
        }
    return sorted(gardes.values(), key=lambda a: a["date_limite"])


def sous(o, cle):
    """Valeur de la clé cle juste sous o (préfixe d'espace de noms ignoré) ; dans une liste, la première trouvée."""
    if isinstance(o, list):
        return next((t for t in (sous(v, cle) for v in o) if t is not None), None)
    if not isinstance(o, dict):
        return None
    for k, v in o.items():
        if k.split(":")[-1] == cle:
            return v
    return None


def chercher(o, cle):
    """Comme sous, à n'importe quelle profondeur."""
    t = sous(o, cle)
    if t is not None or not isinstance(o, (dict, list)):
        return t
    return next((t for t in (chercher(v, cle) for v in (o.values() if isinstance(o, dict) else o)) if t is not None), None)


def liste(v):
    return v if isinstance(v, list) else [] if v is None else [v]


def texte(o, *cles):
    for k in cles:
        o = sous(o, k)
    return o.get("#text") if isinstance(o, dict) else o


def resultat(donnees):
    """Résultat d'un avis d'attribution eForms : (montant, "attribué" | "max", offres reçues par lot gagné).
    None pour l'ancien format (petits marchés) : le titulaire et le prix n'y sont qu'en texte libre.
    () si aucun lot n'a de gagnant (infructueux, sans suite)."""
    nr = chercher(donnees, "NoticeResult")
    if not isinstance(nr, dict):
        # ancien format : écarté si l'avis entier, ou chacun de ses lots, est déclaré infructueux ou sans suite (rapport 34)
        t = chercher(donnees, "attributionMarche")
        if isinstance(t, str) and all(re.search(r"(?i)déclarée? (infructueu|sans suite)|classement sans suite", p)
                                      for p in re.split(r"(?im)^lot n°", t) if p.strip()):
            return ()
        return None
    prix = {texte(t, "ID"): nombre(texte(t, "LegalMonetaryTotal", "PayableAmount") or 0) or 0 for t in liste(sous(nr, "LotTender"))}
    gagnes, offres, somme = 0, [], 0
    for lot in liste(sous(nr, "LotResult")):
        if texte(lot, "TenderResultCode") != "selec-w":
            continue
        gagnes += 1
        stats = {texte(s, "StatisticsCode"): nombre(texte(s, "StatisticsNumeric") or "") for s in liste(sous(lot, "ReceivedSubmissionsStatistics"))}
        if stats.get("tenders"):
            offres.append(int(stats["tenders"]))
        somme += sum(prix.get(texte(t, "ID"), 0) for t in liste(sous(lot, "LotTender")))
    if not gagnes:
        return ()
    # le total déclaré par l'acheteur d'abord : les lots d'un accord-cadre répètent souvent le même maximum
    for cle, genre in (("TotalAmount", "attribué"), ("OverallMaximumFrameworkContractsAmount", "max")):
        v = nombre(texte(nr, cle) or "")
        if v:
            return v, genre, offres
    return (somme or None), "attribué", offres


def lire_resultats(depuis):
    """Avis d'attribution de Corse publiés depuis la date donnée (pages de 100)."""
    tout, offset = [], 0
    ou = f'code_departement in ("20A","20B") and nature="ATTRIBUTION" and dateparution >= date\'{depuis:%Y-%m-%d}\''
    while True:
        url = API + "?" + urlencode({"where": ou, "select": CHAMPS, "order_by": "dateparution desc", "limit": 100, "offset": offset})
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as rep:
            page = json.load(rep)["results"]
        tout += page
        offset += 100
        if len(page) < 100 or offset >= 9900:
            return tout


def resultats_de(brut):
    """Marchés attribués, du plus récent au plus ancien. Le nom du titulaire n'est pas repris (souvent un entrepreneur
    individuel, donc une personne) : il reste sur l'avis officiel."""
    remplaces = {i for r in brut for i in (r.get("annonce_lie") or [])}
    sortie = []
    for r in brut:
        donnees = json.loads(r.get("donnees") or "{}")
        res = resultat(donnees)
        if r["idweb"] in remplaces or res == ():
            continue
        cpvs, _, lieu = analyser(donnees)
        if lieu and normal(lieu) == normal(r.get("nomacheteur") or ""):
            lieu = None
        deps = [DEPARTEMENTS[c] for c in (r.get("code_departement") or []) if c in DEPARTEMENTS]
        sortie.append({
            "id": r["idweb"], "objet": propre(r.get("objet"), 220),
            "acheteur": " ".join((r.get("nomacheteur") or "").split()),
            "lieu": lieu or (deps[0][1] if deps else "Corse"), "departement": deps[0][0] if deps else "",
            "metiers": metiers_de(r, cpvs), "publie": r.get("dateparution"), "procedure": r.get("famille_libelle") or "",
            "montant": res[0] if res else None, "montant_type": res[1] if res else None, "offres": res[2] if res else [],
            "lien": r.get("url_avis") or f"https://www.boamp.fr/pages/avis/?q=idweb:{r['idweb']}",
        })
    # même marché publié deux fois (rapport 33) : on garde le plus récent. Sans montant, seulement le même jour,
    # car deux attributions à des mois d'écart sont souvent deux lots différents
    vus, uniques = set(), []
    for a in sorted(sortie, key=lambda a: a["publie"] or "", reverse=True):
        cle = (normal(a["objet"]), normal(a["acheteur"]), a["montant"], tuple(a["offres"]), "" if a["montant"] else a["publie"])
        if cle not in vus:
            vus.add(cle)
            uniques.append(a)
    return uniques


def exemples_de(maintenant, chemin=SORTIE / "exemples.json"):
    """Avis FICTIFS des onglets Privé et Particuliers (site/exemples.json, écrit à la main) ; dates recalculées à chaque collecte."""
    if not chemin.exists():
        return []
    jour = maintenant.astimezone(PARIS).date()
    tout = []
    for source, liste in json.loads(chemin.read_text(encoding="utf-8")).items():
        if source not in ("prive", "particulier"):
            continue
        for x in liste:
            d = jour + timedelta(days=x["delai_jours"])
            tout.append({
                "source": source, "objet": x["objet"], "acheteur": x["demandeur"], "lieu": x["lieu"], "departement": x["departement"],
                "metiers": [m for m in x["metiers"] if m in METIERS] or ["services"],
                "montant": x.get("budget"), "montant_type": "budget", "taxe": "TTC" if source == "particulier" else "HT",
                "duree": x.get("duree"), "procedure": x["demande"], "rectifie": False, "lien": None,
                "date_limite": datetime(d.year, d.month, d.day, x.get("heure", 12), tzinfo=PARIS).isoformat(),
                "publie": (jour - timedelta(days=x["publie_jours"])).isoformat(),
            })
    return tout


def euros(x):
    # espaces insécables (fine pour les milliers) : « 120 000 € HT » ne se coupe jamais en fin de ligne (rapport 39)
    if x >= 1e6:
        return f"{x / 1e6:.1f}".replace(".", ",").replace(",0", "") + " M€"
    return f"{round(x):,}".replace(",", " ") + "\u00a0€"


def insecable(texte):
    """« Marchés <90 k€ (MAPA) » : ni « 90 » / « k€ », ni « k€ » / « (MAPA) » sur deux lignes."""
    return re.sub(r"(?<=\d) (?=k€)|(?<=k€) (?=\()", "\u00a0", texte)


def date_fr(iso, heure=True):
    d = datetime.fromisoformat(iso).astimezone(PARIS)
    h = f", {d.hour} h" + (f" {d:%M}" if d.minute else "") if heure else ""
    return f"{JOURS[d.weekday()]} {d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]} {d.year}{h}"


def taille(procedure):
    """Taille du marché d'après la famille de procédure du BOAMP : petit (< 90 k€), moyen, europeen, ou "" (DSP…)."""
    p = normal(procedure).replace(" ", "")
    if "<90" in p or "mapa" in p:
        return "petit"
    if "entre90" in p:
        return "moyen"
    return "europeen" if "europeen" in p else ""


def etiquettes(metiers):
    # tous les métiers sont dans la page (2 visibles) : le filtre actif remonte le sien en tête (app.js)
    noms = "".join(f'<span class="metier" data-m="{m}" style="--c:{METIERS[m][1]}"{" hidden" if i >= 2 else ""}>{METIERS[m][0]}</span>'
                   for i, m in enumerate(metiers))
    if len(metiers) > 2:
        noms += f'<span class="metier autres" title="{html.escape(", ".join(METIERS[m][0] for m in metiers[2:]))}">+{len(metiers) - 2}</span>'
    return noms


def carte_resultat(a):
    e = html.escape
    d = datetime.fromisoformat(a["publie"])
    infos = [("Lieu", e(a["lieu"]))]
    if a["montant"]:
        infos.append(("Montant max." if a["montant_type"] == "max" else "Montant attribué", euros(a["montant"]) + " HT"))
    if a["offres"]:
        o = sorted(a["offres"])
        infos.append(("Offres reçues", str(o[0]) if len(o) == 1 else f"{o[0]} par lot" if o[0] == o[-1] else f"{o[0]} à {o[-1]} par lot"))
    if not a["montant"] and not a["offres"]:
        infos.append(("Montant, entreprise", "voir l'avis officiel"))
    infos.append(("Procédure", e(a["procedure"])))
    dl = "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in infos)
    # pour les repères de resultats.js : le maximum d'un accord-cadre n'est pas un prix, il est écarté
    rep = f' data-montant="{round(a["montant"])}"' if a["montant"] and a["montant_type"] == "attribué" else ""
    if a["offres"]:
        rep += f' data-offres="{sorted(a["offres"])[len(a["offres"]) // 2]}"'
    return (f'<article class="avis" data-metiers="{" ".join(a["metiers"])}" data-dep="{a["departement"]}"{rep} style="--c:{METIERS[a["metiers"][0]][1]}">'
            f'<div class="echeance" aria-hidden="true"><span class="jour">{d.day}</span><span class="mois">{MOIS[d.month - 1]}</span></div>'
            f'<div class="corps"><p class="haut">{etiquettes(a["metiers"])}<span class="dep">{e(a["departement"])}</span></p>'
            f'<h3><a href="{e(a["lien"])}" rel="noopener">{e(a["objet"])}</a></h3>'
            f'<p class="acheteur">{e(a["acheteur"])}</p><dl class="infos">{dl}</dl>'
            f'<p class="limite">Résultat publié le <time datetime="{e(a["publie"])}">{date_fr(a["publie"], heure=False)}</time></p></div></article>')


GARDE = ' class="garde"'


def carte(a):
    e = html.escape
    d = datetime.fromisoformat(a["date_limite"]).astimezone(PARIS)
    noms = etiquettes(a["metiers"])
    infos = [("Lieu", e(a["lieu"]))]
    if a["montant"]:
        genre = {"max": "Montant max.", "budget": "Budget indicatif"}.get(a["montant_type"], "Montant estimé")
        infos.append((genre, euros(a["montant"]) + " " + a.get("taxe", "HT")))
    if a.get("duree"):
        infos.append(("Durée", e(a["duree"])))
    infos.append(("Procédure" if a["lien"] else "Demande", insecable(e(a["procedure"]))))
    # vue compacte (style.css) : seuls le lieu et le montant restent, ou la procédure s'il n'y a pas de montant
    garde = (0, 1 if a["montant"] else len(infos) - 1)
    dl = "".join(f'<div{GARDE if i in garde else ""}><dt>{k}</dt><dd>{v}</dd></div>' for i, (k, v) in enumerate(infos))
    rectif = '<span class="rectif">Rectifié</span>' if a["rectifie"] else ""
    source = a.get("source", "public")
    # les exemples n'ont pas d'avis officiel : titre sans lien ; cachés sans JS (ils ne se montrent que dans leur onglet)
    exemple = '<span class="exemple">Exemple</span>' if source != "public" else ""
    titre = f'<a href="{e(a["lien"])}" rel="noopener">{e(a["objet"])}</a>' if a["lien"] else e(a["objet"])
    # boutons Suivre et Agenda ajoutés par app.js (ils ne servent qu'avec JS) ; le lien du dossier marche sans
    actions = ""
    if a.get("dossier"):
        url, genre = a["dossier"]
        nom = "Dossier de consultation" if genre == "dce" else "Plateforme de l'acheteur"
        actions = (f'<p class="actions"><a class="action dossier" href="{e(url)}" rel="noopener" target="_blank" '
                   f'aria-label="{nom} (nouvel onglet) : {e(a["objet"])}">{nom}</a></p>')
    ident = f' data-id="{e(a["id"])}"' if a.get("id") else ""
    if source == "public":
        ident += f' data-taille="{taille(a["procedure"])}"'
    return (f'<article class="avis"{ident} data-source="{source}" data-metiers="{" ".join(a["metiers"])}" data-dep="{a["departement"]}" '
            f'data-limite="{e(a["date_limite"])}" data-publie="{e(a["publie"] or "")}" data-montant="{round(a["montant"] or 0)}" style="--c:{METIERS[a["metiers"][0]][1]}"'
            f'{" hidden" if exemple else ""}>'
            f'<div class="echeance" aria-hidden="true"><span class="jour">{d.day}</span><span class="mois">{MOIS[d.month - 1]}</span>'
            f'<span class="reste"></span></div>'
            f'<div class="corps"><p class="haut">{exemple}{noms}<span class="dep">{e(a["departement"])}</span>{rectif}</p>'
            f'<h3>{titre}</h3>'
            f'<p class="acheteur">{e(a["acheteur"])}</p><dl class="infos">{dl}</dl>'
            f'<p class="limite"><span class="badge" hidden>Bientôt clos</span>Réponse avant le '
            f'<time datetime="{e(a["date_limite"])}">{date_fr(a["date_limite"])}</time></p>{actions}</div></article>')


def main():
    maintenant = datetime.now(timezone.utc)
    try:
        brut = lire_api(maintenant - timedelta(days=1))
    except Exception as err:  # API en panne ou pas d'Internet : on garde le site précédent
        sys.exit(f"API du BOAMP injoignable ({err}) : site non modifié.")
    avis = avis_de(brut, maintenant)
    if not avis:
        sys.exit("Aucun avis en cours trouvé : site non modifié.")

    exemples = exemples_de(maintenant)
    nb = {k: sum(k in a["metiers"] for a in avis) for k in METIERS}
    # les 12 métiers sont toujours dans la page (une demande publiée peut porter sur n'importe lequel) ; app.js cache ceux à 0
    boutons = "".join(
        f'<button type="button" class="filtre" data-metier="{k}" data-nom="{nom}" aria-pressed="false" style="--c:{coul}"{"" if nb[k] else " hidden"}>'
        f'<span class="pastille" aria-hidden="true"></span>{nom} <span class="nb">{nb[k]}</span></button>'
        for k, (nom, coul) in METIERS.items())
    remplacements = {
        "<!--METIERS-->": boutons,
        "<!--AVIS-->": "\n".join(carte(a) for a in avis + exemples),
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
    print(f"{len(brut)} avis lus, {len(avis)} en cours (+ {len(exemples)} exemples) -> {SORTIE / 'index.html'}")
    for k, (nom, _) in METIERS.items():
        print(f"  {nb[k]:3d}  {nom}")

    # Marchés attribués depuis 12 mois (page à part) : en cas de panne, la page précédente reste
    try:
        resultats = resultats_de(lire_resultats(maintenant - timedelta(days=365)))
    except Exception as err:
        print(f"Résultats de marché injoignables ({err}) : resultats.html non modifié.")
        return
    if not resultats:
        print("Aucun résultat de marché trouvé : resultats.html non modifié.")
        return
    nb_r = {k: sum(k in a["metiers"] for a in resultats) for k in METIERS}
    page = (ICI / "modele-resultats.html").read_text(encoding="utf-8")
    for cle, val in {
        "<!--OPTIONS-->": "".join(f'<option value="{k}">{nom} ({nb_r[k]})</option>' for k, (nom, _) in METIERS.items() if nb_r[k]),
        "<!--RESULTATS-->": "\n".join(carte_resultat(a) for a in resultats),
        "<!--NB-->": str(len(resultats)),
        "<!--MAJ-->": remplacements["<!--MAJ-->"],
    }.items():
        page = page.replace(cle, val)
    (SORTIE / "resultats.html").write_text(page, encoding="utf-8")
    print(f"{len(resultats)} marchés attribués -> {SORTIE / 'resultats.html'}")


if __name__ == "__main__":
    main()
