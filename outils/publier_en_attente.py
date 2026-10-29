#!/usr/bin/env python3
"""À lancer une fois, après le déploiement des nouvelles règles : publie (statut « validee ») les demandes restées
« en_attente » d'avant la publication immédiate. Connexion avec le compte admin du site (comme admin.html) :
les règles le laissent changer le statut, et rien d'autre. Sans --oui : affiche seulement combien seraient publiées.

  python3 outils/publier_en_attente.py          # compte, ne change rien
  python3 outils/publier_en_attente.py --oui    # publie
E-mail et mot de passe admin : demandés au clavier, ou variables AOC_ADMIN_EMAIL et AOC_ADMIN_MDP (jamais écrits nulle part).
Essai sur l'émulateur (Testeur, après « python3 outils/test_regles.py --demo ») : --emulateur.
Attention : une demande retirée exprès par l'admin (« en_attente » aussi) serait republiée ; regarder la liste avant --oui.
"""
import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from moderer import CLE_API, PROJET  # noqa: E402  configuration du site (site/firebase-config.js)


def appel(url, corps=None, jeton=None, methode=None):
    req = urllib.request.Request(url, data=json.dumps(corps).encode() if corps is not None else None, method=methode,
                                 headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + jeton} if jeton else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--oui", action="store_true", help="publier vraiment (sinon : compter seulement)")
    p.add_argument("--emulateur", action="store_true", help="émulateur local, compte admin@test.local")
    a = p.parse_args()
    if a.emulateur:
        fs = "http://127.0.0.1:8080/v1/projects/demo-appels-offres-corse/databases/(default)/documents"
        auth, cle, email, mdp = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1", "demo", "admin@test.local", "admin-test-1234"
    else:
        fs = f"https://firestore.googleapis.com/v1/projects/{PROJET}/databases/(default)/documents"
        auth, cle = "https://identitytoolkit.googleapis.com/v1", CLE_API
        email = os.environ.get("AOC_ADMIN_EMAIL") or input("E-mail du compte admin : ")
        mdp = os.environ.get("AOC_ADMIN_MDP") or getpass.getpass("Mot de passe : ")

    code, r = appel(f"{auth}/accounts:signInWithPassword?key={cle}", {"email": email, "password": mdp, "returnSecureToken": True})
    if code != 200:
        sys.exit(f"Connexion refusée ({code}) : vérifiez l'e-mail et le mot de passe admin.")
    jeton = r["idToken"]
    q = {"structuredQuery": {"from": [{"collectionId": "demandes"}],
                             "where": {"fieldFilter": {"field": {"fieldPath": "statut"}, "op": "EQUAL", "value": {"stringValue": "en_attente"}}}}}
    code, res = appel(f"{fs}:runQuery", q, jeton)
    if code != 200:
        sys.exit(f"Lecture refusée ({code}) : ce compte est-il bien dans config/admins ?")
    # avis d'acheteur public (lot 19) : jamais publiés en bloc, chacun se valide à la main dans admin.html
    docs = [x["document"] for x in res if "document" in x
            and x["document"].get("fields", {}).get("type", {}).get("stringValue") != "public"]
    print(f"{len(docs)} demande(s) en attente.")
    for d in docs:
        i = d["name"].rsplit("/", 1)[1]
        if not a.oui:
            print(f"  {i} : serait publiée")
            continue
        # exists=true : jamais de création si elle vient d'être supprimée (currentDocument.updateTime est jugé comme une création par les règles)
        code, _ = appel(f"{fs}/demandes/{i}?updateMask.fieldPaths=statut&currentDocument.exists=true",
                        {"fields": {"statut": {"stringValue": "validee"}}}, jeton, "PATCH")
        print(f"  {i} : {'publiée' if code == 200 else f'pas publiée ({code})'}")
    if docs and not a.oui:
        print("Rien n'est changé. Pour publier : relancer avec --oui.")


if __name__ == "__main__":
    main()
