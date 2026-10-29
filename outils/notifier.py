#!/usr/bin/env python3
"""Notifications d'un nouveau message de discussion (lot 18.6), lancé toutes les 5 min par .github/workflows/notifications.yml.

Lit les discussions mises à jour depuis le passage précédent (champ maj, changé seulement avec un nouveau message) et
envoie une notification (Firebase Cloud Messaging, gratuit) aux appareils du participant qui n'a pas écrit le dernier
message, s'il ne l'a pas déjà lue : « Nouveau message de … », le titre de la demande, sans le texte du message
(il s'afficherait sur l'écran verrouillé). Pas d'e-mail. La pastille de l'icône est posée par sw.js à la réception.
Appareils : jetons/{uid} (enregistrés par le site, bouton « Être prévenu »). Firestore est seulement LU.
Aucun nom, titre ni identifiant dans les journaux (dépôt public) : seulement des nombres.

Clé : secret FIREBASE_SERVICE_ACCOUNT (le compte de service des e-mails), avec en plus le rôle
« Administrateur de l'API Firebase Cloud Messaging ». Sans clé : ne fait rien.
Premier passage (pas d'état) : note l'heure, n'envoie rien. Essai sur les vraies données, sans envoi : --essai.
Contrôle sans réseau : python3 outils/test_notifier.py
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def a_notifier(discussions, depuis):
    """[(uid destinataire, données de la notification)] pour les discussions mises à jour après « depuis ».
    discussions : {id, particulier, entreprise, titre, nomEntreprise, dernier, maj, luP?, luE?} (dates avec fuseau)."""
    out = []
    for d in discussions:
        if d["maj"] <= depuis:
            continue
        demandeur_a_ecrit = d["dernier"] == d["particulier"]
        dest, lu = (d["entreprise"], d.get("luE")) if demandeur_a_ecrit else (d["particulier"], d.get("luP"))
        if lu and lu >= d["maj"]:  # déjà ouverte depuis : rien à signaler
            continue
        de = "le demandeur" if demandeur_a_ecrit else d["nomEntreprise"]
        out.append((dest, {"titre": f"Nouveau message de {de}", "corps": f"« {d['titre']} »",
                           "url": f"discussion.html?id={d['id']}", "tag": d["id"]}))
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--essai", action="store_true", help="vraies données : rien n'est envoyé, état inchangé")
    p.add_argument("--etat", default="etat-notifications.json")
    a = p.parse_args()
    compte = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not compte:
        print("Notifications pas configurées (secret FIREBASE_SERVICE_ACCOUNT) : rien à faire.")
        return
    import firebase_admin
    from firebase_admin import credentials, firestore, messaging
    from google.cloud.firestore_v1.base_query import FieldFilter
    firebase_admin.initialize_app(credentials.Certificate(json.loads(compte)))
    db = firestore.client()

    chemin = Path(a.etat)
    if not chemin.exists():
        if not a.essai:
            chemin.write_text(json.dumps({"depuis": datetime.now(timezone.utc).isoformat()}))
        print("Premier passage : heure notée, aucune notification.")
        return
    depuis = datetime.fromisoformat(json.loads(chemin.read_text())["depuis"])
    q = db.collection("discussions").where(filter=FieldFilter("maj", ">", depuis))
    discussions = [dict(s.to_dict(), id=s.id) for s in q.stream()]
    bilan = {"discussions": len(discussions), "envoyées": 0, "sans appareil": 0, "appareils périmés": 0, "échecs": 0}
    for dest, donnees in a_notifier(discussions, depuis):
        jetons = (db.document(f"jetons/{dest}").get().to_dict() or {}).get("liste", [])
        if not jetons:
            bilan["sans appareil"] += 1
        for j in jetons:
            if a.essai:
                continue
            try:
                messaging.send(messaging.Message(token=j, data=donnees,
                                                 webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "86400"})))
                bilan["envoyées"] += 1
            # shortcut: un appareil périmé reste dans jetons/{uid} (Firestore en lecture seule ici) ; le site le remplace au
            # prochain « Être prévenu ». À nettoyer avec un compte qui peut écrire si les échecs s'accumulent.
            except messaging.UnregisteredError:
                bilan["appareils périmés"] += 1
            except Exception as e:  # noqa: BLE001  réseau, quota… : pas de détail (peut contenir le jeton)
                print(f"Échec d'envoi ({type(e).__name__})")
                bilan["échecs"] += 1
    if discussions and not a.essai:  # la plus récente vue, pas « maintenant » : rien de perdu entre la lecture et l'écriture
        chemin.write_text(json.dumps({"depuis": max(d["maj"] for d in discussions).isoformat()}))
    print("Bilan : " + ", ".join(f"{k} {v}" for k, v in bilan.items()) + (" (essai : rien n'est envoyé)" if a.essai else ""))


if __name__ == "__main__":
    main()
