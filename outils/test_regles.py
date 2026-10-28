"""Vérifie les règles Firestore (firestore.rules) sur l'émulateur local, sans dépendance.
Usage : npx -y firebase-tools@latest emulators:exec --only firestore,auth "python3 outils/test_regles.py"
Avec --demo : laisse en plus un compte admin (admin@test.local / admin-test-1234) et 2 demandes, pour essayer les pages.
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

PROJET = "demo-appels-offres-corse"
FS = f"http://127.0.0.1:8080/v1/projects/{PROJET}/databases/(default)/documents"
AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
ADMIN = ("admin@test.local", "admin-test-1234")


def appel(url, corps=None, jeton=None, methode=None):
    req = urllib.request.Request(url, data=json.dumps(corps).encode() if corps is not None else None, method=methode)
    req.add_header("Content-Type", "application/json")
    if jeton:
        req.add_header("Authorization", "Bearer " + jeton)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def valeur(v):
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, datetime):
        return {"timestampValue": v.isoformat().replace("+00:00", "Z")}
    if isinstance(v, list):
        return {"arrayValue": {"values": [valeur(x) for x in v]}}
    return {"stringValue": v}


def ecriture(chemin, champs, nouveau=True):
    """Création avec « cree » = heure du serveur (comme serverTimestamp() côté site)."""
    w = {"update": {"name": f"projects/{PROJET}/databases/(default)/documents/{chemin}",
                    "fields": {k: valeur(v) for k, v in champs.items() if k != "cree"}}}
    if "cree" in champs:
        w["updateTransforms"] = [{"fieldPath": "cree", "setToServerValue": "REQUEST_TIME"}]
    if nouveau:
        w["currentDocument"] = {"exists": False}
    return w


def commit(writes, jeton=None):
    return appel(FS + ":commit", {"writes": writes}, jeton)[0]


def compte(email, mdp):
    code, r = appel(AUTH + "/accounts:signUp?key=demo", {"email": email, "password": mdp, "returnSecureToken": True})
    if code != 200:  # déjà créé (--demo relancé)
        code, r = appel(AUTH + "/accounts:signInWithPassword?key=demo", {"email": email, "password": mdp, "returnSecureToken": True})
    return r["idToken"], r["localId"]


dans = lambda jours: datetime.now(timezone.utc) + timedelta(days=jours)
DEMANDE = {"type": "particulier", "metier": "plomberie-cvc", "titre": "Rénovation salle de bains",
           "description": "Douche à l'italienne, 6 m², carrelage à refaire.", "commune": "Corte", "departement": "2B",
           "budget": 12000, "delai": dans(14), "statut": "en_attente", "cree": True}
CONTACT = {"nom": "Test Démo", "telephone": "06 00 00 00 00", "consentement": True, "cree": True}
INTERET = {"nom": "Plomberie Test", "email": "artisan@test.fr", "message": "Disponible en novembre, devis gratuit sur place.",
           "consentement": True, "cree": True}


def publier(i, demande=None, contact=None, avec_contact=True):
    w = [ecriture(f"demandes/{i}", {**DEMANDE, **(demande or {})})]
    if avec_contact:
        w.append(ecriture(f"demandes/{i}/prive/contact", {**CONTACT, **(contact or {})}))
    return commit(w)


def sans(d, cle):
    return {k: v for k, v in d.items() if k != cle}


def main():
    admin_jeton, admin_uid = compte(*ADMIN)
    intrus_jeton, _ = compte("intrus@test.local", "intrus-1234")
    # liste des admins : seule la console (ici « owner » de l'émulateur) peut l'écrire
    assert commit([ecriture("config/admins", {"uids": [admin_uid]}, nouveau=False)], "owner") == 200
    assert commit([ecriture("config/admins", {"uids": ["pirate"]}, nouveau=False)], intrus_jeton) == 403

    # création publique : demande + coordonnées ensemble, toujours en attente
    assert publier("ok1") == 200
    assert publier("ok2", {"type": "prive", "metier": "electricite"}, {"email": "a@b.fr"}) == 200
    refus = {
        "sans coordonnées": dict(avec_contact=False),
        "déjà validée": dict(demande={"statut": "validee"}),
        "métier inconnu": dict(demande={"metier": "astrologie"}),
        "champ en trop": dict(demande={"nom": "Jean"}),
        "description trop longue": dict(demande={"description": "x" * 1501}),
        "titre trop court": dict(demande={"titre": "abc"}),
        "département": dict(demande={"departement": "13"}),
        "budget négatif": dict(demande={"budget": -5}),
        "budget texte": dict(demande={"budget": "beaucoup"}),
        "délai passé": dict(demande={"delai": dans(-1)}),
        "délai trop loin": dict(demande={"delai": dans(200)}),
        "sans consentement": dict(contact={"consentement": False}),
        "nom trop long": dict(contact={"nom": "n" * 81}),
        "téléphone bizarre": dict(contact={"telephone": "<script>"}),
        "e-mail faux": dict(contact={"email": "pas-un-email"}),
        "champ en trop (contact)": dict(contact={"adresse": "rue"}),
    }
    for nom, k in refus.items():
        assert publier("refus", **k) == 403, nom
    tel_seul = sans(CONTACT, "telephone")
    assert commit([ecriture("demandes/x1", DEMANDE), ecriture("demandes/x1/prive/contact", {**tel_seul, "email": "a@b.fr"})]) == 200
    assert commit([ecriture("demandes/x2", DEMANDE), ecriture("demandes/x2/prive/contact", tel_seul)]) == 403, "ni téléphone ni e-mail"
    # « cree » doit être l'heure du serveur
    w = ecriture("demandes/x3", DEMANDE)
    del w["updateTransforms"]
    w["update"]["fields"]["cree"] = valeur(dans(-30))
    assert commit([w, ecriture("demandes/x3/prive/contact", CONTACT)]) == 403, "date de création imposée"
    # pas de coordonnées ajoutées à une demande existante, pas d'écrasement
    assert commit([ecriture("demandes/ok1/prive/contact", CONTACT, nouveau=False)]) == 403
    assert commit([ecriture("demandes/ok1", DEMANDE, nouveau=False)]) == 403

    # lecture publique : rien tant que ce n'est pas validé, jamais les coordonnées
    assert appel(FS + "/demandes/ok1")[0] == 403
    requete = {"structuredQuery": {"from": [{"collectionId": "demandes"}],
                                   "where": {"fieldFilter": {"field": {"fieldPath": "statut"}, "op": "EQUAL", "value": valeur("validee")}}}}
    assert appel(FS + ":runQuery", requete)[0] == 200
    assert appel(FS + ":runQuery", {"structuredQuery": {"from": [{"collectionId": "demandes"}]}})[0] == 403, "liste sans filtre"
    assert appel(FS + "/demandes/ok1/prive/contact", jeton=intrus_jeton)[0] == 403

    # un compte connecté qui n'est pas admin ne valide rien
    maj = lambda i, jeton, champs: appel(FS + f"/demandes/{i}?" + "&".join("updateMask.fieldPaths=" + k for k in champs),
                                         {"fields": {k: valeur(v) for k, v in champs.items()}}, jeton, "PATCH")[0]
    assert maj("ok1", intrus_jeton, {"statut": "validee"}) == 403
    assert maj("ok1", None, {"statut": "validee"}) == 403

    # l'admin lit les coordonnées, valide (statut seulement), supprime
    assert appel(FS + "/demandes/ok1/prive/contact", jeton=admin_jeton)[0] == 200
    assert appel(FS + ":runQuery", {"structuredQuery": {"from": [{"collectionId": "demandes"}]}}, admin_jeton)[0] == 200
    assert maj("ok1", admin_jeton, {"statut": "validee", "titre": "Titre changé"}) == 403
    assert maj("ok1", admin_jeton, {"statut": "publiee-partout"}) == 403
    assert maj("ok1", admin_jeton, {"statut": "validee"}) == 200

    # une fois validée : la demande est lisible par tous, les coordonnées toujours pas
    code, doc = appel(FS + "/demandes/ok1")
    assert code == 200 and "nom" not in doc["fields"] and "telephone" not in doc["fields"]
    assert appel(FS + "/demandes/ok1/prive/contact")[0] == 403
    code, res = appel(FS + ":runQuery", requete)
    assert code == 200 and [r["document"]["name"].rsplit("/", 1)[1] for r in res if "document" in r] == ["ok1"]
    assert appel(FS + "/demandes/ok1", jeton=intrus_jeton, methode="DELETE")[0] == 403
    assert appel(FS + "/demandes/ok2/prive/contact", jeton=admin_jeton, methode="DELETE")[0] == 200
    assert appel(FS + "/demandes/ok2", jeton=admin_jeton, methode="DELETE")[0] == 200

    # « Je suis intéressé » : création publique contrôlée, sur une demande validée et pas close ; aucune lecture publique
    interet = lambda i, champs, d="ok1": commit([ecriture(f"demandes/{d}/interets/{i}", champs)])
    assert interet("i1", INTERET) == 200
    assert interet("i2", {**sans(INTERET, "email"), "telephone": "06 11 22 33 44"}) == 200
    refus_interet = {
        "sans message": sans(INTERET, "message"),
        "message trop court": {**INTERET, "message": "dispo"},
        "message trop long": {**INTERET, "message": "m" * 1001},
        "ni téléphone ni e-mail": sans(INTERET, "email"),
        "e-mail faux": {**INTERET, "email": "jean@test"},
        "téléphone bizarre": {**INTERET, "telephone": "<b>"},
        "nom trop long": {**INTERET, "nom": "n" * 81},
        "sans consentement": {**INTERET, "consentement": False},
        "champ en trop": {**INTERET, "site": "http://spam"},
    }
    for nom, champs in refus_interet.items():
        assert interet("r", champs) == 403, nom
    assert interet("r", INTERET, "x1") == 403, "demande en attente"
    assert interet("r", INTERET, "inconnue") == 403, "demande inexistante"
    assert commit([ecriture("demandes/vieille", {**DEMANDE, "statut": "validee", "delai": dans(-1)})], "owner") == 200
    assert interet("r", INTERET, "vieille") == 403, "demande close"
    w = ecriture("demandes/ok1/interets/i3", INTERET)
    del w["updateTransforms"]
    w["update"]["fields"]["cree"] = valeur(dans(-30))
    assert commit([w]) == 403, "date imposée (intérêt)"
    assert commit([ecriture("demandes/ok1/interets/i1", INTERET, nouveau=False)]) == 403, "écrasement"
    for jeton in (None, intrus_jeton):
        assert appel(FS + "/demandes/ok1/interets/i1", jeton=jeton)[0] == 403
        assert appel(FS + "/demandes/ok1/interets", jeton=jeton)[0] == 403
        assert appel(FS + "/demandes/ok1/interets/i2", jeton=jeton, methode="DELETE")[0] == 403
    tous = {"structuredQuery": {"from": [{"collectionId": "interets", "allDescendants": True}]}}
    assert appel(FS + ":runQuery", tous)[0] == 403, "recherche sur tous les intérêts"
    code, res = appel(FS + "/demandes/ok1/interets", jeton=admin_jeton)
    assert code == 200 and len(res["documents"]) == 2
    assert appel(FS + "/demandes/ok1/interets/i2", jeton=admin_jeton, methode="DELETE")[0] == 200
    appel(FS + "/demandes/vieille", jeton="owner", methode="DELETE")
    print(f"OK : règles Firestore ({len(refus)} refus de création vérifiés, lecture, modération, suppression ; "
          f"intérêts : {len(refus_interet) + 5} refus, aucune lecture publique)")

    if "--demo" in sys.argv:  # ok1 validée avec 1 artisan intéressé, x1 en attente : de quoi essayer index, publier et admin
        print(f"Démo prête : admin {ADMIN[0]} / {ADMIN[1]}")
    else:
        appel(FS + "/demandes/ok1/interets/i1", jeton="owner", methode="DELETE")
        for i in ("ok1", "x1"):
            appel(FS + f"/demandes/{i}/prive/contact", jeton="owner", methode="DELETE")
            appel(FS + f"/demandes/{i}", jeton="owner", methode="DELETE")


if __name__ == "__main__":
    main()
