"""Vérifie la lecture des avis sans Internet. Usage : python3 outils/test_collecte.py"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from collecte import (METIERS, analyser, avis_de, carte, date_limite, dossier, euros, exemples_de, lieu_texte, metier_cpv,  # noqa: E402
                      metiers_de, nom_lieu, propre, carte_resultat, resultat, resultats_de, taille)

# métiers par préfixe CPV, le plus long l'emporte
assert metier_cpv("45310000") == "electricite"
assert metier_cpv("45332000") == "plomberie-cvc"
assert metier_cpv("45233140") == "voirie-vrd"
assert metier_cpv("45262300") == "gros-oeuvre"
assert metier_cpv("30199770") == "services"  # titres-restaurant
assert metier_cpv("30200000") == "informatique"
assert metier_cpv("34100000") == "fournitures" and metier_cpv("66510000") == "services"

# avis national simplifié : CPV, montant estimé, lieu en texte libre
FNS = {"FNSimple": {"initial": {"natureMarche": {"codeCPV": {"objetPrincipal": {"classPrincipale": "45261000"}},
                                                 "valeurEstimee": {"valeur": "180000"}, "lieuExecution": "FRM02 - Haute-Corse"},
                                "lots": {"lot": [{"codeCPV": {"objetPrincipal": {"classPrincipale": "45310000"}},
                                                  "estimationValeur": {"valeur": "32000"}, "lieuExecutionLivraison": "Petrapola\n20243\nIsolaccio"}]}}}}
assert analyser(FNS) == (["45261000", "45310000"], (180000.0, "estimé"), "Isolaccio")

# eForms : seul le lieu d'exécution compte (pas l'adresse de l'acheteur), montants des lots additionnés
EF = {"EFORMS": {"ContractNotice": {
    "cac:Organizations": {"efac:Organization": {"efac:Company": {"cac:PostalAddress": {"cbc:CityName": "Marseille"}}}},
    "cac:ProcurementProjectLot": [
        {"cac:ProcurementProject": {"cac:MainCommodityClassification": {"cbc:ItemClassificationCode": {"@listName": "cpv", "#text": "90910000"}},
                                    "cac:RealizedLocation": {"cac:Address": {"cbc:CityName": "Bastia cedex"}},
                                    "cac:RequestedTenderTotal": {"cbc:EstimatedOverallContractAmount": {"#text": "1000000"}}}},
        {"cac:ProcurementProject": {"cac:RequestedTenderTotal": {"cbc:EstimatedOverallContractAmount": {"#text": "500000"}}}}]}}}
assert analyser(EF) == (["90910000"], (1500000.0, "estimé"), "Bastia"), analyser(EF)

# dossier de consultation : celui de l'avis d'abord, sinon la plateforme de l'acheteur ; adresses douteuses ignorées
assert dossier(EF) is None
assert dossier({"cac:CallForTendersDocumentReference": {"cac:Attachment": {"cac:ExternalReference": {"cbc:URI": "https://a.fr/dce?x=1&amp;y=2"}}},
                "cbc:BuyerProfileURI": "https://profil.fr"}) == ("https://a.fr/dce?x=1&y=2", "dce")
assert dossier({"communication": {"urlProfilAch": "www.achatspublicscorse.com", "urlDocConsul": "javascript:alert(1)"}}) == \
    ("https://www.achatspublicscorse.com", "profil")
html_dce = carte({"id": "26-1", "objet": "X", "acheteur": "A", "lieu": "Bastia", "departement": "2B", "metiers": ["services"], "montant": None,
                  "date_limite": "2026-11-20T12:00:00+01:00", "publie": "2026-10-28", "procedure": "MAPA", "rectifie": False,
                  "lien": "https://boamp.fr/1", "dossier": ("https://a.fr/?a=1&b=2", "dce")})
assert dossier({"communication": {"urlDocConsul": "https://www.marches-publics.gouv.fr/", "urlProfilAch": "https://p.fr/acheteur/12"}}) == \
    ("https://p.fr/acheteur/12", "profil"), "accueil de plateforme : pas un dossier"
assert dossier({"communication": {"urlDocConsul": "https://www.klekoon.com"}}) == ("https://www.klekoon.com", "profil")
# taille du marché (filtre de l'accueil), d'après les 4 familles de procédure vues dans le BOAMP
assert [taille(p) for p in ("Marchés <90 k€ (MAPA)", "Marchés entre 90 k€ et seuils européens", "Marchés européens",
                            "Délégation de service public")] == ["petit", "moyen", "europeen", ""]
assert 'data-taille="petit"' in html_dce
assert 'data-id="26-1"' in html_dce and 'href="https://a.fr/?a=1&amp;b=2"' in html_dce and "Dossier de consultation" in html_dce

assert lieu_texte("Lieu(x) d'exécution : voir lot") is None and lieu_texte("FRM01") is None
assert propre("MISE EN \x9cUVRE DES TRAVAUX") == "Mise en œuvre des travaux"
assert euros(1_500_000) == "1,5 M€" and euros(2_000_000) == "2 M€" and euros(32000) == "32 000 €"

# l'heure écrite dans l'avis est l'heure de Paris, quel que soit le fuseau annoncé (comme boamp.fr : 26-99420, 26-93441, 26-92291)
def limite(brut):
    d = date_limite({"gestion": json.dumps({"INDEXATION": {"DATE_LIMITE_REPONSE": brut}})})
    return d.hour, d.minute, d.utcoffset().seconds // 3600
assert limite("2026-10-29T11:00:00") == (11, 0, 1)
assert limite("2026-11-16T12:00:00Z") == (12, 0, 1)
assert limite("2026-10-30T12:00:00+02:00") == (12, 0, 1)
assert limite("2026-11-03T11:00:00.000+02:00") == (11, 0, 1)
assert limite("2026-07-01T12:00:00Z") == (12, 0, 2)  # heure d'été

# travaux : les métiers des descripteurs s'ajoutent aux CPV, sans « fournitures » de matériaux (26-99987, 26-93488, 26-99523)
tr = {"type_marche": ["TRAVAUX"], "descripteur_libelle": ["Electricité (travaux)", "Plomberie (travaux)", "Serrurerie"]}
assert metiers_de(tr, ["45210000", "44200000"]) == ["gros-oeuvre", "electricite", "plomberie-cvc", "second-oeuvre"]
assert metiers_de({"type_marche": ["SERVICES"], "descripteur_libelle": ["Etude"]}, ["90721000"]) == ["etudes"]
assert metier_cpv("79311000") == "etudes" and metier_cpv("03340000") == "fournitures"

# lieux
assert lieu_texte("CALVI (2B)") == "CALVI" and nom_lieu("CALVI") == "Calvi"
assert nom_lieu("Mairie de San martino di lota") == "San Martino di Lota" and nom_lieu("Porto-vecchio") == "Porto-Vecchio"
assert nom_lieu("Isolaccio-di-fiumorbo") == "Isolaccio-di-Fiumorbo" and nom_lieu("Corse du Sud") == "Corse-du-Sud"
assert nom_lieu("L ile rousse") == nom_lieu("Ile-Rousse") == "L'Île-Rousse" and nom_lieu("Porto Vecchio") == "Porto-Vecchio"
assert nom_lieu("Cantine Scolaire") is None and nom_lieu("Palasca Section F") is None
# rapport 29 : lieux sans valeur -> le département prendra la place
assert [nom_lieu(l) for l in ("Sans Objet", "Services Techniques Municipaux", "Hôtel Consulaire", "20620", "Ba",
        "Les lieux d'exécution des prestations sont les suivants : régions du Niolu et du Cortenais")] == [None] * 6
assert nom_lieu("Bastelicaccia Mail") == "Bastelicaccia" and nom_lieu("Bastia") == "Bastia" and nom_lieu("Castellare-di-Casinca") == "Castellare-di-Casinca"
assert nom_lieu("Commune San Martino di Lota") == "San Martino di Lota" and nom_lieu("Haute Corse") == "Haute-Corse"

# un rectificatif remplace l'avis initial ; un avis clos est écarté
base = {"objet": "TRAVAUX DE TOITURE", "nomacheteur": "Commune de Corte", "code_departement": ["20B"], "donnees": "{}",
        "type_marche": ["TRAVAUX"], "descripteur_libelle": ["Couverture"]}
def avis(i, limite, **k):
    return {**base, "idweb": i, "gestion": json.dumps({"INDEXATION": {"DATE_LIMITE_REPONSE": limite}}), **k}
lus = avis_de([avis("1", "2026-11-20T12:00:00", dateparution="2026-10-01"),
               avis("2", "2026-11-27T12:00:00", dateparution="2026-10-10", etat="RECTIFICATIF", annonce_lie=["1"]),
               avis("3", "2026-10-01T12:00:00", objet="Ancien", dateparution="2026-09-01")],
              datetime(2026, 10, 28, tzinfo=timezone.utc))
assert [(a["id"], a["rectifie"], a["departement"], a["metiers"], a["lieu"]) for a in lus] == \
    [("2", True, "2B", ["gros-oeuvre"], "Haute-Corse")], lus

# exemples fictifs (site/exemples.json) : 8 à 10 par onglet, dates à venir, métiers connus, aucune coordonnée, badge et pas de lien
maintenant = datetime(2026, 10, 28, 20, tzinfo=timezone.utc)
ex = exemples_de(maintenant)
for s in ("prive", "particulier"):
    assert 8 <= sum(a["source"] == s for a in ex) <= 10, s
brut = (Path(__file__).resolve().parent.parent / "site" / "exemples.json").read_text(encoding="utf-8")
assert not re.search(r"@|https?:|www\.|\b0\d(?:[ .]?\d\d){4}\b|\+33", brut), "coordonnée dans exemples.json"
for a in ex:
    assert a["date_limite"] > maintenant.isoformat() and a["publie"] <= "2026-10-28" and a["departement"] in ("2A", "2B")
    assert all(m in METIERS for m in a["metiers"]), a
    html = carte(a)
    assert ">Exemple</span>" in html and "href=" not in html and f'data-source="{a["source"]}"' in html and " hidden>" in html
assert datetime.fromisoformat(ex[0]["date_limite"]).hour == 12

# les 12 métiers sont les mêmes dans le formulaire, les règles Firestore et la page admin
racine = Path(__file__).resolve().parent.parent
assert re.findall(r'name="metier" value="([\w-]+)"', (racine / "site" / "publier.html").read_text(encoding="utf-8")) == list(METIERS)
regles = (racine / "firestore.rules").read_text(encoding="utf-8")
debut = regles.index("function metiersConnus()")
assert re.findall(r"'([\w-]+)'", regles[debut:regles.index("}", debut)]) == list(METIERS)
admin = (racine / "site" / "admin.js").read_text(encoding="utf-8")
assert re.findall(r"'?([\w-]+)'?: ['\"]", admin[admin.index("METIERS = {"):admin.index("};")]) == list(METIERS)

# résultats de marché eForms : total de l'acheteur d'abord, offres des lots gagnés seulement, ancien format sans détail
def lot(code, offres, *tenders):
    return {"cbc:TenderResultCode": {"#text": code},
            "ReceivedSubmissionsStatistics": [{"StatisticsCode": {"#text": "tenders"}, "StatisticsNumeric": offres}, {"StatisticsCode": {"#text": "t-sme"}, "StatisticsNumeric": 9}],
            "LotTender": [{"ID": {"#text": t}} for t in tenders]}
def avis_res(nr):
    return {"EFORMS": {"ContractAwardNotice": {"ext:UBLExtensions": {"ext:UBLExtension": [{"ext:ExtensionContent": {"efext:EformsExtension": {"efac:NoticeResult": nr}}}]}}}}
tenders = [{"cbc:ID": {"#text": "TEN-1"}, "cac:LegalMonetaryTotal": {"cbc:PayableAmount": {"#text": "1000"}}},
           {"cbc:ID": {"#text": "TEN-2"}, "cac:LegalMonetaryTotal": {"cbc:PayableAmount": {"#text": "500"}}}]
deux_lots = {"efac:LotTender": tenders, "efac:LotResult": [lot("selec-w", "3", "TEN-1"), lot("selec-w", "1", "TEN-2"), lot("clos-nw", "0")]}
assert resultat(avis_res(deux_lots)) == (1500, "attribué", [3, 1])
assert resultat(avis_res({**deux_lots, "cbc:TotalAmount": {"#text": "1400"}})) == (1400, "attribué", [3, 1])
assert resultat(avis_res({**deux_lots, "efbc:OverallMaximumFrameworkContractsAmount": {"#text": "9000"}}))[:2] == (9000, "max")
assert resultat(avis_res({"efac:LotResult": lot("clos-nw", "0")})) == ()  # infructueux : écarté
assert resultat(FNS) is None
ancien = lambda t: {"FNSimple": {"attribution": {"attributionMarche": t}}}
assert resultat(ancien("Cet avis a été déclaré Sans Suite.\nRenseignements complémentaires : …")) == ()
assert resultat(ancien("Procédure de passation déclarée infructueuse par décision du 20/04/2026.")) == ()
assert resultat(ancien("Lot N° 01 - Aéroport\nCe lot a été déclaré Infructueux.\nLot N° 02 - Port\nCe lot a été déclaré Infructueux")) == ()
assert resultat(ancien("Lot N° 1 - Lot n°1 - Vrd\nCe lot a été déclaré Infructueux.\nLot N° 2 - Peinture\nMontant Ht : 30 370,00 Euros")) is None
brut = [{"idweb": "26-7", "objet": "TRAVAUX DE VOIRIE", "nomacheteur": "Commune de Corte", "code_departement": ["20B"], "dateparution": "2026-10-16",
         "famille_libelle": "Marchés européens", "type_marche": ["TRAVAUX"], "donnees": json.dumps(avis_res(deux_lots)), "titulaire": ["Jean Dupont"]},
        {"idweb": "26-8", "objet": "Sans suite", "nomacheteur": "X", "code_departement": ["20A"], "dateparution": "2026-10-20",
         "donnees": json.dumps(avis_res({"efac:LotResult": lot("clos-nw", "0")}))}]
res = resultats_de(brut)
assert [a["id"] for a in res] == ["26-7"] and res[0]["departement"] == "2B" and "Jean" not in json.dumps(res)
# même marché publié deux fois : gardé une fois (le plus récent) ; sans montant, seulement s'il est du même jour
double = {**brut[0], "idweb": "26-9", "dateparution": "2026-10-20"}
assert [a["id"] for a in resultats_de([brut[0], double])] == ["26-9"]
sans = json.dumps(avis_res({"efac:LotResult": lot("selec-w", "2")}))
s1, s2 = {**brut[0], "donnees": sans}, {**double, "donnees": sans}
assert len(resultats_de([s1, s2])) == 2 and len(resultats_de([s1, {**s2, "dateparution": "2026-10-16"}])) == 1
html_res = carte_resultat(res[0])
assert euros(1500) + " HT" in html_res and "1 à 3 par lot" in html_res and "Travaux de voirie" in html_res and "ven. 16 oct. 2026" in html_res
assert "voir l'avis officiel" in carte_resultat({**res[0], "montant": None, "offres": []})
# repères : montant attribué et offres médianes du marché ; le maximum d'un accord-cadre n'est pas repris
assert 'data-montant="1500" data-offres="3"' in html_res
assert "data-montant" not in carte_resultat({**res[0], "montant_type": "max"})
print("OK : lecture des avis, résultats de marché, exemples et métiers")
