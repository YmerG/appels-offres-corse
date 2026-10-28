"""Vérifie la lecture des avis sans Internet. Usage : python3 outils/test_collecte.py"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from collecte import analyser, avis_de, date_limite, euros, lieu_texte, metier_cpv, metiers_de, nom_lieu, propre  # noqa: E402

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
print("OK : lecture des avis")
