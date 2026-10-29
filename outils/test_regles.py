"""Vérifie les règles Firestore (firestore.rules) sur l'émulateur local, sans dépendance.
Usage : npx -y firebase-tools@latest emulators:exec --project demo-appels-offres-corse --only firestore,auth "python3 outils/test_regles.py"
Avec --demo : laisse en plus des comptes et 2 demandes, pour essayer les pages (identifiants affichés à la fin).
"""
import base64
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

PROJET = "demo-appels-offres-corse"
FS = f"http://127.0.0.1:8080/v1/projects/{PROJET}/databases/(default)/documents"
AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1"
ADMIN = ("admin@test.local", "admin-test-1234")
PART = ("particulier@test.local", "particulier-1234")
ENT = ("entreprise@test.local", "entreprise-1234")


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
    if isinstance(v, bytes):
        return {"bytesValue": base64.b64encode(v).decode()}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, datetime):
        return {"timestampValue": v.isoformat().replace("+00:00", "Z")}
    if isinstance(v, list):
        return {"arrayValue": {"values": [valeur(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: valeur(x) for k, x in v.items()}}}
    return {"stringValue": v}


def ecriture(chemin, champs, nouveau=True):
    """Création avec « cree » = heure du serveur (comme serverTimestamp() côté site)."""
    heure = [k for k in ("cree", "maj") if champs.get(k) is True]  # True : heure du serveur
    w = {"update": {"name": f"projects/{PROJET}/databases/(default)/documents/{chemin}",
                    "fields": {k: valeur(v) for k, v in champs.items() if k not in heure}}}
    if heure:
        w["updateTransforms"] = [{"fieldPath": k, "setToServerValue": "REQUEST_TIME"} for k in heure]
    if nouveau:
        w["currentDocument"] = {"exists": False}
    return w


def modif(chemin, champs, heure=()):
    """Écriture partielle pour un lot (updateMask), avec des champs à l'heure du serveur (comme serverTimestamp())."""
    w = {"update": {"name": f"projects/{PROJET}/databases/(default)/documents/{chemin}", "fields": {k: valeur(v) for k, v in champs.items()}},
         "updateMask": {"fieldPaths": list(champs)}, "currentDocument": {"exists": True}}
    if heure:
        w["updateTransforms"] = [{"fieldPath": k, "setToServerValue": "REQUEST_TIME"} for k in heure]
    return w


def commit(writes, jeton=None):
    return appel(FS + ":commit", {"writes": writes}, jeton)[0]


def maj(chemin, jeton, champs):
    """Modification partielle (updateMask), comme updateDoc() côté site."""
    return appel(FS + f"/{chemin}?" + "&".join("updateMask.fieldPaths=" + k for k in champs),
                 {"fields": {k: valeur(v) for k, v in champs.items()}}, jeton, "PATCH")[0]


def compte(email, mdp, verifie=False):
    """Compte Auth de l'émulateur ; verifie=True : e-mail marqué vérifié (comme après le clic sur le lien), jeton renouvelé."""
    connexion = {"email": email, "password": mdp, "returnSecureToken": True}
    code, r = appel(AUTH + "/accounts:signUp?key=demo", connexion)
    if code != 200:  # déjà créé (--demo relancé)
        code, r = appel(AUTH + "/accounts:signInWithPassword?key=demo", connexion)
    if verifie:
        assert appel(f"{AUTH}/projects/{PROJET}/accounts:update", {"localId": r["localId"], "emailVerified": True}, "owner")[0] == 200
        code, r = appel(AUTH + "/accounts:signInWithPassword?key=demo", connexion)
    return r["idToken"], r["localId"]


def requete(champ, val, collection="demandes"):
    return {"structuredQuery": {"from": [{"collectionId": collection}],
                                "where": {"fieldFilter": {"field": {"fieldPath": champ}, "op": "EQUAL", "value": valeur(val)}}}}


def ids(res):
    return sorted(r["document"]["name"].rsplit("/", 1)[1] for r in res if "document" in r)


dans = lambda jours: datetime.now(timezone.utc) + timedelta(days=jours)
DEMANDE = {"type": "particulier", "metier": "plomberie-cvc", "titre": "Rénovation salle de bains",
           "description": "Douche à l'italienne, 6 m², carrelage à refaire.", "commune": "Corte", "departement": "2B",
           "budget": 12000, "delai": dans(14), "statut": "validee", "cree": True}
CONTACT = {"nom": "Test Démo", "telephone": "06 00 00 00 00", "consentement": True, "cree": True}
INTERET = {"nom": "Plomberie Test", "email": "artisan@test.fr", "message": "Disponible en novembre, devis gratuit sur place.",
           "consentement": True, "cree": True}
PROFIL_P = {"type": "particulier", "nom": "Marie Test", "commune": "Corte", "telephone": "06 12 34 56 78", "cree": True}
# SIRET fictif, clé de contrôle juste
PROFIL_E = {"type": "entreprise", "nom": "Plomberie Test SARL", "siret": "12345678000014",
            "metiers": ["plomberie-cvc", "second-oeuvre"], "zone": ["2B"], "telephone": "04 95 00 00 00", "cree": True}


def sans(d, cle):
    return {k: v for k, v in d.items() if k != cle}


def main():
    admin_jeton, admin_uid = compte(*ADMIN)
    intrus_jeton, intrus_uid = compte("intrus@test.local", "intrus-1234", verifie=True)  # vérifié, mais sans profil
    part_jeton, part_uid = compte(*PART, verifie=True)
    ent_jeton, ent_uid = compte(*ENT, verifie=True)
    part_nv_jeton, part_nv_uid = compte("particulier-nv@test.local", "particulier-1234")  # e-mail pas vérifié
    ent_nv_jeton, ent_nv_uid = compte("entreprise-nv@test.local", "entreprise-1234")
    # liste des admins : seule la console (ici « owner » de l'émulateur) peut l'écrire
    assert commit([ecriture("config/admins", {"uids": [admin_uid]}, nouveau=False)], "owner") == 200
    assert commit([ecriture("config/admins", {"uids": ["pirate"]}, nouveau=False)], intrus_jeton) == 403

    # comptes : chacun crée son profil (avec types/{uid}, comme compte.js), contrôlé ; jamais celui d'un autre
    profil = lambda uid, champs, jeton: commit([ecriture(f"types/{uid}", {"type": champs.get("type", "")}), ecriture(f"users/{uid}", champs)], jeton)
    assert profil(part_uid, PROFIL_P, part_jeton) == 200
    assert profil(ent_uid, PROFIL_E, ent_jeton) == 200
    assert profil(part_nv_uid, PROFIL_P, part_nv_jeton) == 200
    assert profil(ent_nv_uid, sans(PROFIL_E, "telephone"), ent_nv_jeton) == 200
    assert profil("quelquun", PROFIL_P, None) == 403, "profil sans connexion"
    assert profil("quelquun", PROFIL_P, intrus_jeton) == 403, "profil d'un autre"
    refus_profil = {
        "type inconnu": {**PROFIL_P, "type": "admin"},
        "particulier sans commune": sans(PROFIL_P, "commune"),
        "particulier avec SIRET": {**PROFIL_P, "siret": "12345678000014"},
        "nom trop long": {**PROFIL_P, "nom": "n" * 81},
        "téléphone bizarre": {**PROFIL_P, "telephone": "<b>"},
        "champ en trop": {**PROFIL_P, "role": "admin"},
        "SIRET 13 chiffres": {**PROFIL_E, "siret": "1234567800001"},
        "SIRET avec lettres": {**PROFIL_E, "siret": "1234567800001A"},
        "entreprise sans SIRET": sans(PROFIL_E, "siret"),
        "aucun métier": {**PROFIL_E, "metiers": []},
        "métier inconnu": {**PROFIL_E, "metiers": ["astrologie"]},
        "métier en double": {**PROFIL_E, "metiers": ["electricite", "electricite"]},
        "zone hors Corse": {**PROFIL_E, "zone": ["13"]},
        "zone vide": {**PROFIL_E, "zone": []},
        "entreprise avec commune": {**PROFIL_E, "commune": "Bastia"},
    }
    for nom, champs in refus_profil.items():
        assert profil(intrus_uid, champs, intrus_jeton) == 403, nom
    w = ecriture(f"users/{intrus_uid}", PROFIL_P)
    del w["updateTransforms"]
    w["update"]["fields"]["cree"] = valeur(dans(-30))
    assert commit([w], intrus_jeton) == 403, "date de création imposée (profil)"
    assert commit([ecriture(f"users/{intrus_uid}", PROFIL_P)], intrus_jeton) == 403, "profil sans types/{uid}"
    assert commit([ecriture(f"types/{intrus_uid}", {"type": "entreprise"}), ecriture(f"users/{intrus_uid}", PROFIL_P)], intrus_jeton) == 403, "type différent de types/{uid}"

    # profils : aucune lecture publique, chacun lit le sien, l'admin lit tout
    assert appel(FS + f"/users/{part_uid}", jeton=part_jeton)[0] == 200
    for jeton in (None, intrus_jeton, ent_jeton):
        assert appel(FS + f"/users/{part_uid}", jeton=jeton)[0] == 403
        assert appel(FS + "/users", jeton=jeton)[0] == 403
    assert appel(FS + f"/users/{ent_uid}", jeton=admin_jeton)[0] == 200
    code, res = appel(FS + "/users", jeton=admin_jeton)
    assert code == 200 and len(res["documents"]) == 4
    # modification : le sien seulement, contrôlée, type et date de création figés
    assert maj(f"users/{part_uid}", part_jeton, {"commune": "Bastia"}) == 200
    assert maj(f"users/{part_uid}", part_jeton, {"type": "entreprise"}) == 403, "type modifié"
    assert maj(f"users/{part_uid}", part_jeton, {"cree": dans(-30)}) == 403, "date de création modifiée"
    assert maj(f"users/{part_uid}", intrus_jeton, {"commune": "Calvi"}) == 403, "profil d'un autre modifié"
    assert maj(f"users/{ent_uid}", ent_jeton, {"siret": "123"}) == 403, "SIRET faux à la modification"
    assert maj(f"users/{ent_uid}", ent_jeton, {"zone": ["2A", "2B"]}) == 200
    # alertes par métier : un booléen, sur son profil Entreprise seulement
    assert maj(f"users/{ent_uid}", ent_jeton, {"alertes": True}) == 200
    assert maj(f"users/{ent_uid}", ent_jeton, {"alertes": False}) == 200
    assert maj(f"users/{ent_uid}", ent_jeton, {"alertes": "oui"}) == 403, "alertes pas booléen"
    assert maj(f"users/{ent_uid}", ent_jeton, {"alertes": 1}) == 403, "alertes nombre"
    assert maj(f"users/{ent_uid}", intrus_jeton, {"alertes": True}) == 403, "alertes d'un autre"
    assert maj(f"users/{ent_uid}", part_jeton, {"alertes": True}) == 403, "alertes d'un autre (particulier)"
    assert maj(f"users/{ent_uid}", None, {"alertes": True}) == 403, "alertes sans connexion"
    assert maj(f"users/{part_uid}", part_jeton, {"alertes": True}) == 403, "alertes sur un profil Particulier"
    assert profil(intrus_uid, {**PROFIL_E, "alertes": "oui"}, intrus_jeton) == 403, "alertes pas booléen (création)"
    # assurance décennale déclarée : assureur + date de fin (n° de contrat facultatif), sur un profil Entreprise seulement
    DEC = {"assureur": "Mutuelle Test", "contrat": "AB-123", "fin": "2027-06-30"}
    assert maj(f"users/{ent_uid}", ent_jeton, {"decennale": DEC}) == 200
    assert maj(f"users/{ent_uid}", ent_jeton, {"decennale": sans(DEC, "contrat")}) == 200
    refus_dec = {
        "sans assureur": sans(DEC, "assureur"),
        "sans date": sans(DEC, "fin"),
        "date mal écrite": {**DEC, "fin": "30/06/2027"},
        "mois 13": {**DEC, "fin": "2027-13-01"},
        "champ en trop": {**DEC, "attestation": "vérifiée"},
        "assureur trop long": {**DEC, "assureur": "a" * 81},
        "contrat trop long": {**DEC, "contrat": "c" * 41},
        "pas un objet": "Mutuelle Test",
    }
    for nom, d in refus_dec.items():
        assert maj(f"users/{ent_uid}", ent_jeton, {"decennale": d}) == 403, f"décennale : {nom}"
    assert maj(f"users/{ent_uid}", intrus_jeton, {"decennale": DEC}) == 403, "décennale d'un autre"
    assert maj(f"users/{part_uid}", part_jeton, {"decennale": DEC}) == 403, "décennale sur un profil Particulier"
    assert profil(intrus_uid, {**PROFIL_E, "decennale": {**DEC, "fin": "demain"}}, intrus_jeton) == 403, "décennale fausse (création)"

    # publication : par un compte Particulier vérifié, ou Entreprise vérifié (onglet Privé – sociétés seulement),
    # demande + coordonnées ensemble, publiée tout de suite
    DEMANDE["uid"] = part_uid

    def publier(i, demande=None, contact=None, avec_contact=True, jeton=part_jeton):
        w = [ecriture(f"demandes/{i}", {**DEMANDE, **(demande or {})})]
        if avec_contact:
            w.append(ecriture(f"demandes/{i}/prive/contact", {**CONTACT, **(contact or {})}))
        return commit(w, jeton)

    assert publier("ok1") == 200
    assert publier("ok2", {"type": "prive", "metier": "electricite"}, {"email": "a@b.fr"}) == 200
    assert publier("e1", {"type": "prive", "uid": ent_uid}, jeton=ent_jeton) == 200, "société (compte Entreprise)"
    refus_compte = {
        "sans connexion": dict(jeton=None),
        "compte sans profil": dict(jeton=intrus_jeton, demande={"uid": intrus_uid}),
        "e-mail pas vérifié": dict(jeton=part_nv_jeton, demande={"uid": part_nv_uid}),
        "compte entreprise, onglet Particuliers": dict(jeton=ent_jeton, demande={"uid": ent_uid}),
        "compte entreprise pas vérifié": dict(jeton=ent_nv_jeton, demande={"uid": ent_nv_uid, "type": "prive"}),
        "uid d'un autre": dict(demande={"uid": ent_uid}),
    }
    refus = {
        "sans coordonnées": dict(avec_contact=False),
        "créée en attente": dict(demande={"statut": "en_attente"}),
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
    for nom, k in {**refus_compte, **refus}.items():
        assert publier("refus", **k) == 403, nom
    assert commit([ecriture("demandes/refus", sans(DEMANDE, "uid")), ecriture("demandes/refus/prive/contact", CONTACT)], part_jeton) == 403, "sans uid"
    tel_seul = sans(CONTACT, "telephone")
    assert commit([ecriture("demandes/x1", DEMANDE), ecriture("demandes/x1/prive/contact", {**tel_seul, "email": "a@b.fr"})], part_jeton) == 200
    assert commit([ecriture("demandes/x2", DEMANDE), ecriture("demandes/x2/prive/contact", tel_seul)], part_jeton) == 403, "ni téléphone ni e-mail"
    # « cree » doit être l'heure du serveur
    w = ecriture("demandes/x3", DEMANDE)
    del w["updateTransforms"]
    w["update"]["fields"]["cree"] = valeur(dans(-30))
    assert commit([w, ecriture("demandes/x3/prive/contact", CONTACT)], part_jeton) == 403, "date de création imposée"
    # pas de coordonnées ajoutées à une demande existante, pas d'écrasement
    assert commit([ecriture("demandes/ok1/prive/contact", CONTACT, nouveau=False)], part_jeton) == 403
    assert commit([ecriture("demandes/ok1", DEMANDE, nouveau=False)], part_jeton) == 403

    # lecture : publique dès la création, jamais les coordonnées ; retirée par l'admin (« en_attente ») : seuls lui et l'auteur la voient
    assert appel(FS + "/demandes/ok1")[0] == 200, "publique dès la création"
    assert maj("demandes/x1", admin_jeton, {"statut": "en_attente"}) == 200, "retirée par l'admin"
    assert appel(FS + "/demandes/x1")[0] == 403
    assert appel(FS + "/demandes/x1", jeton=ent_jeton)[0] == 403
    assert appel(FS + "/demandes/x1", jeton=part_jeton)[0] == 200
    code, res = appel(FS + ":runQuery", requete("uid", part_uid), part_jeton)
    assert code == 200 and ids(res) == ["ok1", "ok2", "x1"], "Mes demandes"
    assert appel(FS + ":runQuery", requete("uid", part_uid), ent_jeton)[0] == 403, "demandes d'un autre compte"
    code, res = appel(FS + ":runQuery", requete("uid", ent_uid), ent_jeton)
    assert code == 200 and ids(res) == ["e1"], "Mes demandes (entreprise)"
    assert appel(FS + ":runQuery", requete("uid", part_uid))[0] == 403
    assert appel(FS + ":runQuery", requete("statut", "validee"))[0] == 200
    assert appel(FS + ":runQuery", {"structuredQuery": {"from": [{"collectionId": "demandes"}]}})[0] == 403, "liste sans filtre"
    for jeton in (intrus_jeton, part_jeton):
        assert appel(FS + "/demandes/ok1/prive/contact", jeton=jeton)[0] == 403

    # un compte connecté qui n'est pas admin ne republie ni ne retire rien, même l'auteur
    for jeton in (intrus_jeton, part_jeton, None):
        assert maj("demandes/x1", jeton, {"statut": "validee"}) == 403
        assert maj("demandes/ok1", jeton, {"statut": "en_attente"}) == 403

    # l'admin lit les coordonnées, valide (statut seulement), supprime
    assert appel(FS + "/demandes/ok1/prive/contact", jeton=admin_jeton)[0] == 200
    assert appel(FS + ":runQuery", {"structuredQuery": {"from": [{"collectionId": "demandes"}]}}, admin_jeton)[0] == 200
    assert maj("demandes/ok1", admin_jeton, {"statut": "validee", "titre": "Titre changé"}) == 403
    assert maj("demandes/ok1", admin_jeton, {"statut": "publiee-partout"}) == 403
    assert maj("demandes/ok1", admin_jeton, {"statut": "validee"}) == 200
    # réponses transmises : l'admin seulement, un entier de 0 à 1000
    for jeton in (intrus_jeton, part_jeton, ent_jeton, None):
        assert maj("demandes/ok1", jeton, {"reponses": 2}) == 403, "réponses notées par un non-admin"
    assert maj("demandes/ok1", admin_jeton, {"reponses": "2"}) == 403
    assert maj("demandes/ok1", admin_jeton, {"reponses": -1}) == 403
    assert maj("demandes/ok1", admin_jeton, {"reponses": 1001}) == 403
    assert maj("demandes/ok1", admin_jeton, {"reponses": 2}) == 200

    # une fois validée : la demande est lisible par tous, les coordonnées toujours pas
    code, doc = appel(FS + "/demandes/ok1")
    assert code == 200 and "nom" not in doc["fields"] and "telephone" not in doc["fields"]
    assert appel(FS + "/demandes/ok1/prive/contact")[0] == 403
    code, res = appel(FS + ":runQuery", requete("statut", "validee"))
    assert code == 200 and ids(res) == ["e1", "ok1", "ok2"], "liste publique (sans x1, retirée)"
    assert appel(FS + "/demandes/ok1", jeton=part_jeton, methode="DELETE")[0] == 403
    assert appel(FS + "/demandes/ok2/prive/contact", jeton=admin_jeton, methode="DELETE")[0] == 200
    assert appel(FS + "/demandes/ok2", jeton=admin_jeton, methode="DELETE")[0] == 200

    # « Je suis intéressé » : seulement par un compte Entreprise vérifié, sur une demande ouverte ; aucune lecture publique.
    # Un message par entreprise (identifiant = son uid), avec nbInterets + 1 dans la même écriture (comme interesse.js) ; 5 entreprises au plus.
    INTERET["uid"] = ent_uid
    autres = []  # 5 autres comptes Entreprise vérifiés, pour le plafond
    for n in range(2, 7):
        j, u = compte(f"entreprise{n}@test.local", "entreprise-1234", verifie=True)
        assert profil(u, PROFIL_E, j) == 200
        autres.append((j, u))
    (ent2_jeton, ent2_uid), (ent3_jeton, ent3_uid) = autres[:2]
    qui = {ent_jeton: ent_uid, intrus_jeton: intrus_uid, ent_nv_jeton: ent_nv_uid, part_jeton: part_uid, ent2_jeton: ent2_uid, ent3_jeton: ent3_uid}

    def plus(d, n=1):
        return {"update": {"name": f"projects/{PROJET}/databases/(default)/documents/demandes/{d}", "fields": {}},
                "updateMask": {"fieldPaths": []}, "currentDocument": {"exists": True},
                "updateTransforms": [{"fieldPath": "nbInterets", "increment": valeur(n)}]}

    def interet(champs, d="ok1", jeton=ent_jeton, i=None, n=1, nouveau=True):
        w = [ecriture(f"demandes/{d}/interets/{i or qui.get(jeton, 'anonyme')}", champs, nouveau)]
        return commit(w + [plus(d, n)] if n else w, jeton)

    assert interet(INTERET) == 200
    assert interet({**sans(INTERET, "email"), "telephone": "06 11 22 33 44", "uid": ent2_uid}, jeton=ent2_jeton) == 200
    code, doc = appel(FS + "/demandes/ok1")
    assert code == 200 and doc["fields"]["nbInterets"] == valeur(2), "compteur public à 2"
    I3 = {**INTERET, "uid": ent3_uid}
    refus_interet = {
        "sans connexion": (INTERET, None),
        "compte sans profil": ({**INTERET, "uid": intrus_uid}, intrus_jeton),
        "e-mail pas vérifié": ({**INTERET, "uid": ent_nv_uid}, ent_nv_jeton),
        "compte particulier": ({**INTERET, "uid": part_uid}, part_jeton),
        "uid d'un autre": ({**INTERET, "uid": part_uid}, ent3_jeton),
        "sans uid": (sans(I3, "uid"), ent3_jeton),
        "sans message": (sans(I3, "message"), ent3_jeton),
        "message trop court": ({**I3, "message": "dispo"}, ent3_jeton),
        "message trop long": ({**I3, "message": "m" * 1001}, ent3_jeton),
        "ni téléphone ni e-mail": (sans(I3, "email"), ent3_jeton),
        "e-mail faux": ({**I3, "email": "jean@test"}, ent3_jeton),
        "téléphone bizarre": ({**I3, "telephone": "<b>"}, ent3_jeton),
        "nom trop long": ({**I3, "nom": "n" * 81}, ent3_jeton),
        "sans consentement": ({**I3, "consentement": False}, ent3_jeton),
        "champ en trop": ({**I3, "site": "http://spam"}, ent3_jeton),
    }
    for nom, (champs, jeton) in refus_interet.items():
        assert interet(champs, jeton=jeton) == 403, nom
    refus_compteur = {
        "sans le compteur": dict(n=0),
        "compteur + 2": dict(n=2),
        "identifiant d'un autre": dict(i="i9"),
    }
    for nom, k in refus_compteur.items():
        assert interet(I3, jeton=ent3_jeton, **k) == 403, nom
    assert commit([plus("ok1")], ent3_jeton) == 403, "compteur seul, sans message"
    assert interet(INTERET, nouveau=False) == 403, "écrasement de son message"
    assert interet(INTERET) != 200, "deuxième message de la même entreprise"
    assert maj("demandes/ok1", ent3_jeton, {"nbInterets": 0}) == 403, "compteur remis à zéro par une entreprise"
    assert interet(I3, "x1", ent3_jeton) == 403, "demande en attente"
    assert interet(I3, "inconnue", ent3_jeton) == 403, "demande inexistante"
    assert commit([ecriture("demandes/vieille", {**DEMANDE, "statut": "validee", "delai": dans(-1)})], "owner") == 200
    assert interet(I3, "vieille", ent3_jeton) == 403, "demande close"
    w = ecriture(f"demandes/ok1/interets/{ent3_uid}", I3)
    del w["updateTransforms"]
    w["update"]["fields"]["cree"] = valeur(dans(-30))
    assert commit([w, plus("ok1")], ent3_jeton) == 403, "date imposée (intérêt)"
    # lecture : l'entreprise voit seulement que son message existe ; personne d'autre que l'admin ne lit, ne liste ni ne supprime
    assert appel(FS + f"/demandes/ok1/interets/{ent_uid}", jeton=ent_jeton)[0] == 200
    for jeton in (None, intrus_jeton, ent3_jeton, part_jeton):
        assert appel(FS + f"/demandes/ok1/interets/{ent_uid}", jeton=jeton)[0] == 403
        assert appel(FS + "/demandes/ok1/interets", jeton=jeton)[0] == 403
        assert appel(FS + f"/demandes/ok1/interets/{ent2_uid}", jeton=jeton, methode="DELETE")[0] == 403
    tous = {"structuredQuery": {"from": [{"collectionId": "interets", "allDescendants": True}]}}
    assert appel(FS + ":runQuery", tous)[0] == 403, "recherche sur tous les intérêts"
    code, res = appel(FS + "/demandes/ok1/interets", jeton=admin_jeton)
    assert code == 200 and len(res["documents"]) == 2
    # l'admin supprime un message (spam) et recalcule le compteur, entre 0 et 5
    assert commit([{"delete": f"projects/{PROJET}/databases/(default)/documents/demandes/ok1/interets/{ent2_uid}"}, plus("ok1", -1)], admin_jeton) == 200
    assert maj("demandes/ok1", admin_jeton, {"nbInterets": 6}) == 403
    assert maj("demandes/ok1", admin_jeton, {"nbInterets": "1"}) == 403
    assert maj("demandes/ok1", admin_jeton, {"nbInterets": 1}) == 200
    appel(FS + "/demandes/vieille", jeton="owner", methode="DELETE")
    assert maj("demandes/e1", admin_jeton, {"statut": "validee"}) == 200
    assert interet({**INTERET}, "e1") == 403, "sa propre demande"

    # discussions (lot 18.6) : ouvertes par l'entreprise avec son « Je suis intéressé » (premier message = le sien),
    # lues par les 2 participants et l'admin seulement ; messages seulement tant qu'elle est ouverte ; fermée par le demandeur
    assert publier("t1") == 200
    (ent4_jeton, ent4_uid) = autres[2]
    DISC = f"t1_{ent3_uid}"

    def ouvrir(jeton=ent3_jeton, uid=ent3_uid, disc=None, msg=None, avec_interet=True, avec_msg=True, did=None):
        did = did or f"t1_{uid}"
        w = [ecriture(f"demandes/t1/interets/{uid}", {**INTERET, "uid": uid}), plus("t1")] if avec_interet else []
        w.append(ecriture(f"discussions/{did}", {"demande": "t1", "particulier": part_uid, "entreprise": uid, "titre": DEMANDE["titre"],
                                                 "nomEntreprise": PROFIL_E["nom"], "ouverte": True, "cree": True, "maj": True,
                                                 "dernier": uid, "dernierMsg": "m1", **(disc or {})}))
        if avec_msg:
            w.append(ecriture(f"discussions/{did}/messages/m1", {"auteur": uid, "texte": INTERET["message"], "cree": True, **(msg or {})}))
        return commit(w, jeton)

    refus_ouverture = {
        "sans « Je suis intéressé »": dict(avec_interet=False),
        "sans premier message": dict(avec_msg=False),
        "demandeur d'un autre": dict(disc={"particulier": ent_uid}),
        "titre changé": dict(disc={"titre": "Autre titre"}),
        "nom d'entreprise inventé": dict(disc={"nomEntreprise": "Société inventée"}),
        "fermée dès l'ouverture": dict(disc={"ouverte": False}),
        "champ en trop": dict(disc={"telephone": "06 00 00 00 00"}),
        "identifiant d'une autre entreprise": dict(did=f"t1_{ent_uid}"),
        "premier message d'un autre": dict(msg={"auteur": part_uid}),
    }
    for nom, k in refus_ouverture.items():
        assert ouvrir(ent4_jeton, ent4_uid, **k) == 403, f"discussion : {nom}"
    assert ouvrir() == 200
    # lecture : les 2 participants et l'admin
    for jeton in (part_jeton, ent3_jeton, admin_jeton):
        assert appel(FS + f"/discussions/{DISC}", jeton=jeton)[0] == 200
        assert appel(FS + f"/discussions/{DISC}/messages", jeton=jeton)[0] == 200
    for jeton in (None, intrus_jeton, ent_jeton, ent4_jeton):
        assert appel(FS + f"/discussions/{DISC}", jeton=jeton)[0] == 403, "discussion lue par un autre"
        assert appel(FS + f"/discussions/{DISC}/messages", jeton=jeton)[0] == 403, "messages lus par un autre"
    code, res = appel(FS + ":runQuery", requete("particulier", part_uid, "discussions"), part_jeton)
    assert code == 200 and ids(res) == [DISC], "Mes discussions (demandeur)"
    code, res = appel(FS + ":runQuery", requete("entreprise", ent3_uid, "discussions"), ent3_jeton)
    assert code == 200 and ids(res) == [DISC], "Mes discussions (entreprise)"
    assert appel(FS + ":runQuery", requete("particulier", part_uid, "discussions"), ent_jeton)[0] == 403
    assert appel(FS + ":runQuery", {"structuredQuery": {"from": [{"collectionId": "discussions"}]}}, part_jeton)[0] == 403

    def ecrire(mid, jeton, uid, texte="Bonjour, vous pouvez passer mardi ?", auteur=None, avec_maj=True, dernier=None):
        w = [ecriture(f"discussions/{DISC}/messages/{mid}", {"auteur": auteur or uid, "texte": texte, "cree": True})]
        if avec_maj:
            w.append(modif(f"discussions/{DISC}", {"dernier": dernier or uid, "dernierMsg": mid}, ["maj"]))
        return commit(w, jeton)

    assert ecrire("m2", part_jeton, part_uid) == 200
    assert ecrire("m3", ent3_jeton, ent3_uid) == 200
    refus_message = {
        "autre entreprise": dict(jeton=ent_jeton, uid=ent_uid),
        "sans connexion": dict(jeton=None, uid=part_uid),
        "auteur d'un autre": dict(jeton=part_jeton, uid=part_uid, auteur=ent3_uid),
        "vide": dict(jeton=part_jeton, uid=part_uid, texte=""),
        "trop long": dict(jeton=part_jeton, uid=part_uid, texte="m" * 1001),
        "sans mettre la discussion à jour": dict(jeton=part_jeton, uid=part_uid, avec_maj=False),
        "dernier = l'autre": dict(jeton=part_jeton, uid=part_uid, dernier=ent3_uid),
    }
    for nom, k in refus_message.items():
        assert ecrire("m9", **k) == 403, f"message : {nom}"
    assert ecrire("m2", part_jeton, part_uid) == 403, "message réécrit"
    assert commit([modif(f"discussions/{DISC}", {"dernier": part_uid, "dernierMsg": "m8"}, ["maj"])], part_jeton) == 403, "mise à jour sans message"
    # lu : chacun le sien, à l'heure du serveur
    assert commit([modif(f"discussions/{DISC}", {}, ["luP"])], part_jeton) == 200
    assert commit([modif(f"discussions/{DISC}", {}, ["luE"])], ent3_jeton) == 200
    assert commit([modif(f"discussions/{DISC}", {}, ["luE"])], part_jeton) == 403, "lu de l'autre"
    assert commit([modif(f"discussions/{DISC}", {"luP": dans(1)})], part_jeton) == 403, "lu à une date choisie"
    # fermeture : par le demandeur (ou l'admin), définitive ; plus aucun message
    assert commit([modif(f"discussions/{DISC}", {"ouverte": False})], ent3_jeton) == 403, "fermée par l'entreprise"
    assert commit([modif(f"discussions/{DISC}", {"ouverte": False})], part_jeton) == 200
    assert ecrire("m4", ent3_jeton, ent3_uid) == 403, "message après fermeture (entreprise)"
    assert ecrire("m4", part_jeton, part_uid) == 403, "message après fermeture (demandeur)"
    assert commit([modif(f"discussions/{DISC}", {"ouverte": True})], part_jeton) == 403, "rouverte"
    assert appel(FS + f"/discussions/{DISC}", jeton=ent3_jeton)[0] == 200, "toujours lisible, fermée"
    # suppression : l'admin seulement
    for jeton in (part_jeton, ent3_jeton):
        assert appel(FS + f"/discussions/{DISC}/messages/m3", jeton=jeton, methode="DELETE")[0] == 403
    assert appel(FS + f"/discussions/{DISC}/messages/m3", jeton=admin_jeton, methode="DELETE")[0] == 200

    # jetons de notification : chacun les siens, 5 au plus, jamais lus par un autre
    assert commit([ecriture(f"jetons/{part_uid}", {"liste": ["jeton-a"], "maj": True}, nouveau=False)], part_jeton) == 200
    assert commit([ecriture(f"jetons/{part_uid}", {"liste": ["jeton-x"], "maj": True}, nouveau=False)], intrus_jeton) == 403, "jetons d'un autre"
    assert commit([ecriture(f"jetons/{part_uid}", {"liste": [str(i) for i in range(6)], "maj": True}, nouveau=False)], part_jeton) == 403, "6 jetons"
    assert commit([ecriture(f"jetons/{part_uid}", {"liste": ["jeton-a"], "maj": True, "uid": part_uid}, nouveau=False)], part_jeton) == 403, "champ en trop (jetons)"
    assert appel(FS + f"/jetons/{part_uid}", jeton=part_jeton)[0] == 200
    for jeton in (None, intrus_jeton, ent3_jeton, admin_jeton):
        assert appel(FS + f"/jetons/{part_uid}", jeton=jeton)[0] == 403, "jetons lus par un autre"

    # « Je cherche un partenaire » sur un avis BOAMP : identifiant <avis>_<uid>, entreprise vérifiée, lu par l'admin seulement
    AVIS = "26-93354"
    PARTENAIRE = {**INTERET, "avis": AVIS, "objet": "Construction d'un chalet thermal - Lot 5", "limite": dans(20)}

    def partenaire(champs, jeton=ent_jeton, pid=None, nouveau=True):
        return commit([ecriture(f"partenaires/{pid or champs.get('avis', AVIS) + '_' + qui.get(jeton, 'anonyme')}", champs, nouveau)], jeton)

    assert partenaire(PARTENAIRE) == 200
    assert partenaire({**PARTENAIRE, "uid": ent2_uid}, ent2_jeton) == 200
    P3 = {**PARTENAIRE, "uid": ent3_uid}
    refus_partenaire = {
        "sans connexion": (PARTENAIRE, None, None),
        "compte sans profil": ({**PARTENAIRE, "uid": intrus_uid}, intrus_jeton, None),
        "e-mail pas vérifié": ({**PARTENAIRE, "uid": ent_nv_uid}, ent_nv_jeton, None),
        "compte particulier": ({**PARTENAIRE, "uid": part_uid}, part_jeton, None),
        "uid d'un autre": ({**PARTENAIRE, "uid": part_uid}, ent3_jeton, None),
        "identifiant d'un autre": (P3, ent3_jeton, f"{AVIS}_{ent2_uid}"),
        "identifiant d'un autre avis": (P3, ent3_jeton, f"26-1_{ent3_uid}"),
        "n° d'avis faux": ({**P3, "avis": "abc"}, ent3_jeton, f"abc_{ent3_uid}"),
        "sans titre": (sans(P3, "objet"), ent3_jeton, None),
        "sans date limite": (sans(P3, "limite"), ent3_jeton, None),
        "date limite en texte": ({**P3, "limite": "2026-11-02"}, ent3_jeton, None),
        "titre trop long": ({**P3, "objet": "t" * 301}, ent3_jeton, None),
        "message trop court": ({**P3, "message": "dispo"}, ent3_jeton, None),
        "ni téléphone ni e-mail": (sans(P3, "email"), ent3_jeton, None),
        "sans consentement": ({**P3, "consentement": False}, ent3_jeton, None),
        "champ en trop": ({**P3, "lot": "5"}, ent3_jeton, None),
    }
    for nom, (champs, jeton, pid) in refus_partenaire.items():
        assert partenaire(champs, jeton, pid) == 403, nom
    assert partenaire(PARTENAIRE, nouveau=False) == 403, "écrasement de son message (partenaire)"
    w = ecriture(f"partenaires/{AVIS}_{ent3_uid}", P3)
    del w["updateTransforms"]
    w["update"]["fields"]["cree"] = valeur(dans(-30))
    assert commit([w], ent3_jeton) == 403, "date imposée (partenaire)"
    assert appel(FS + f"/partenaires/{AVIS}_{ent_uid}", jeton=ent_jeton)[0] == 200, "l'entreprise voit son message"
    for jeton in (None, intrus_jeton, ent3_jeton, part_jeton, ent2_jeton):
        assert appel(FS + f"/partenaires/{AVIS}_{ent_uid}", jeton=jeton)[0] == 403
        assert appel(FS + "/partenaires", jeton=jeton)[0] == 403
        assert appel(FS + f"/partenaires/{AVIS}_{ent_uid}", jeton=jeton, methode="DELETE")[0] == 403
    code, res = appel(FS + "/partenaires", jeton=admin_jeton)
    assert code == 200 and len(res["documents"]) == 2
    assert appel(FS + f"/partenaires/{AVIS}_{ent2_uid}", jeton=admin_jeton, methode="DELETE")[0] == 200

    # fiche publique d'entreprise : reprend le profil, présentation 20 à 600 caractères, en attente à chaque écriture,
    # lisible par tous seulement après validation par l'admin, jamais listée publiquement
    FICHE = {"nom": PROFIL_E["nom"], "siret": PROFIL_E["siret"], "metiers": PROFIL_E["metiers"], "zone": PROFIL_E["zone"],
             "presentation": "Plombier chauffagiste depuis 15 ans en Haute-Corse.", "statut": "en_attente"}

    def fiche(champs, jeton=ent2_jeton, uid=None, nouveau=True):
        w = ecriture(f"fiches/{uid or qui.get(jeton, 'anonyme')}", champs, nouveau)
        w["updateTransforms"] = [{"fieldPath": "maj", "setToServerValue": "REQUEST_TIME"}]
        return commit([w], jeton)

    refus_fiche = {
        "sans connexion": (FICHE, None, ent2_uid),
        "fiche d'un autre": (FICHE, ent3_jeton, ent2_uid),
        "compte particulier": (FICHE, part_jeton, None),
        "e-mail pas vérifié": ({**FICHE, "zone": ["2B"]}, ent_nv_jeton, None),
        "nom différent du profil": ({**FICHE, "nom": "Autre SARL"}, ent2_jeton, None),
        "SIRET différent du profil": ({**FICHE, "siret": "98765432100018"}, ent2_jeton, None),
        "métiers différents du profil": ({**FICHE, "metiers": ["electricite"]}, ent2_jeton, None),
        "zone différente du profil": ({**FICHE, "zone": ["2A", "2B"]}, ent2_jeton, None),
        "présentation trop courte": ({**FICHE, "presentation": "Plombier"}, ent2_jeton, None),
        "présentation trop longue": ({**FICHE, "presentation": "p" * 601}, ent2_jeton, None),
        "validée d'office": ({**FICHE, "statut": "validee"}, ent2_jeton, None),
        "champ en trop": ({**FICHE, "telephone": "06 00 00 00 00"}, ent2_jeton, None),
    }
    for nom, (champs, jeton, uid) in refus_fiche.items():
        assert fiche(champs, jeton, uid) == 403, f"fiche : {nom}"
    w = ecriture(f"fiches/{ent2_uid}", {**FICHE, "maj": dans(-30)})
    assert commit([w], ent2_jeton) == 403, "fiche : date imposée"
    assert fiche(FICHE) == 200
    assert appel(FS + f"/fiches/{ent2_uid}", jeton=ent2_jeton)[0] == 200, "l'entreprise voit sa fiche en attente"
    for jeton in (None, part_jeton, ent3_jeton):
        assert appel(FS + f"/fiches/{ent2_uid}", jeton=jeton)[0] == 403, "fiche publique avant validation"
        assert appel(FS + "/fiches", jeton=jeton)[0] == 403, "liste des fiches"
        assert maj(f"fiches/{ent2_uid}", jeton, {"statut": "validee"}) == 403, "fiche validée par un autre"
        assert appel(FS + f"/fiches/{ent2_uid}", jeton=jeton, methode="DELETE")[0] == 403, "fiche supprimée par un autre"
    assert maj(f"fiches/{ent2_uid}", ent2_jeton, {"statut": "validee"}) == 403, "fiche validée par l'entreprise"
    assert maj(f"fiches/{ent2_uid}", admin_jeton, {"presentation": "Texte changé par l'admin."}) == 403, "admin : texte modifié"
    assert maj(f"fiches/{ent2_uid}", admin_jeton, {"statut": "publiee"}) == 403, "admin : statut inconnu"
    code, res = appel(FS + "/fiches", jeton=admin_jeton)
    assert code == 200 and len(res["documents"]) == 1
    assert maj(f"fiches/{ent2_uid}", admin_jeton, {"statut": "validee"}) == 200
    for jeton in (None, part_jeton, ent3_jeton):
        assert appel(FS + f"/fiches/{ent2_uid}", jeton=jeton)[0] == 200, "fiche publique après validation"
        assert appel(FS + "/fiches", jeton=jeton)[0] == 403, "liste des fiches (après validation)"
    assert fiche({**FICHE, "presentation": FICHE["presentation"] + " Dépannage 7 j/7."}, nouveau=False) == 200, "fiche modifiée"
    assert appel(FS + f"/fiches/{ent2_uid}")[0] == 403, "fiche modifiée : de nouveau en attente"
    assert appel(FS + f"/fiches/{ent2_uid}", jeton=ent2_jeton, methode="DELETE")[0] == 200, "l'entreprise retire sa fiche"

    # « Ma demande est pourvue » : l'auteur seulement, un booléen, sur une demande publiée ; plus aucune réponse ensuite
    assert maj("demandes/ok1", ent_jeton, {"pourvue": True}) == 403, "pourvue par une entreprise"
    assert maj("demandes/ok1", None, {"pourvue": True}) == 403, "pourvue sans connexion"
    assert maj("demandes/ok1", part_jeton, {"pourvue": "oui"}) == 403, "pourvue pas booléen"
    assert maj("demandes/ok1", part_jeton, {"pourvue": True, "titre": "Autre titre"}) == 403, "pourvue + titre"
    assert maj("demandes/x1", part_jeton, {"pourvue": True}) == 403, "pourvue avant publication"
    assert maj("demandes/ok1", part_jeton, {"pourvue": True}) == 200
    assert interet(I3, jeton=ent3_jeton) == 403, "demande pourvue"
    assert maj("demandes/ok1", part_jeton, {"pourvue": False}) == 200, "rouverte"
    # plafond : 5 entreprises, la 6e est refusée
    assert commit([ecriture("demandes/cap", {**DEMANDE, "statut": "validee"})], "owner") == 200
    for j, u in autres[:4]:
        assert interet({**INTERET, "uid": u}, "cap", j, u) == 200, "entreprises 1 à 4"
    assert interet(INTERET, "cap") == 200, "5e entreprise"
    assert interet({**INTERET, "uid": autres[4][1]}, "cap", autres[4][0], autres[4][1]) == 403, "6e entreprise"

    # suppression du compte : son profil seulement
    assert appel(FS + f"/users/{part_nv_uid}", jeton=intrus_jeton, methode="DELETE")[0] == 403
    assert appel(FS + f"/users/{part_nv_uid}", jeton=part_nv_jeton, methode="DELETE")[0] == 200
    # le type reste figé : profil supprimé puis recréé en entreprise → refusé ; types/{uid} ni modifiable, ni supprimable, ni lisible par un autre
    ent_refait = {**PROFIL_E, "telephone": "06 00 00 00 01"}
    assert commit([ecriture(f"users/{part_nv_uid}", ent_refait)], part_nv_jeton) == 403, "recréé avec un autre type"
    assert commit([ecriture(f"types/{part_nv_uid}", {"type": "entreprise"}, nouveau=False), ecriture(f"users/{part_nv_uid}", ent_refait)], part_nv_jeton) == 403, "type réécrit"
    assert appel(FS + f"/types/{part_nv_uid}", jeton=part_nv_jeton, methode="DELETE")[0] == 403, "type supprimé"
    assert appel(FS + f"/types/{part_nv_uid}", jeton=intrus_jeton)[0] == 403
    assert commit([ecriture(f"users/{part_nv_uid}", PROFIL_P)], part_nv_jeton) == 200, "recréé avec le même type"
    # photos : avec la demande seulement, 1 à 3 annoncées, en octets, 300 Ko au plus ; lisibles comme la demande ; supprimées par l'admin
    JPEG = b"\xff\xd8\xff" + b"0" * 1000

    def avec_photos(i, n, photos, jeton=part_jeton, en_trop=None):
        w = [ecriture(f"demandes/{i}", {**DEMANDE, **({"photos": n} if n is not None else {})}), ecriture(f"demandes/{i}/prive/contact", CONTACT)]
        w += [ecriture(f"demandes/{i}/photos/{p}", {"data": d, "cree": True, **(en_trop or {})}) for p, d in photos]
        return commit(w, jeton)

    assert avec_photos("ph1", 2, [("1", JPEG), ("2", JPEG)]) == 200
    refus_photos = {
        "plus de photos qu'annoncé": (1, [("1", JPEG), ("2", JPEG)]),
        "sans le nombre": (None, [("1", JPEG)]),
        "4 photos": (4, [(str(k), JPEG) for k in range(1, 5)]),
        "nombre en texte": ("2", [("1", JPEG), ("2", JPEG)]),
        "identifiant inconnu": (1, [("x", JPEG)]),
        "photo trop lourde": (1, [("1", b"0" * 300001)]),
        "photo en texte": (1, [("1", "data:image/jpeg;base64,AAAA")]),
    }
    for nom, (n, ph) in refus_photos.items():
        assert avec_photos("ph2", n, ph) == 403, nom
    assert avec_photos("ph2", 1, [("1", JPEG)], en_trop={"legende": "x"}) == 403, "champ en trop (photo)"
    assert avec_photos("ph2", 1, [("1", JPEG)], jeton=ent_jeton) == 403, "demande d'un autre compte"
    assert commit([ecriture("demandes/ok1/photos/1", {"data": JPEG, "cree": True})], part_jeton) == 403, "photo ajoutée après coup"
    assert appel(FS + "/demandes/ph1/photos/1")[0] == 200, "photos publiques dès la création"
    assert maj("demandes/ph1", admin_jeton, {"statut": "en_attente"}) == 200
    assert appel(FS + "/demandes/ph1/photos/1")[0] == 403, "photo d'une demande retirée"
    assert appel(FS + "/demandes/ph1/photos", jeton=ent_jeton)[0] == 403
    assert appel(FS + "/demandes/ph1/photos/1", jeton=part_jeton)[0] == 200, "l'auteur voit ses photos"
    assert appel(FS + "/demandes/ph1/photos", jeton=admin_jeton)[0] == 200
    assert maj("demandes/ph1", admin_jeton, {"statut": "validee"}) == 200
    code, res = appel(FS + "/demandes/ph1/photos")
    assert code == 200 and len(res["documents"]) == 2, "photos publiques après republication"
    for jeton in (None, part_jeton, ent_jeton):
        assert appel(FS + "/demandes/ph1/photos/1", jeton=jeton, methode="DELETE")[0] == 403
    assert appel(FS + "/demandes/ph1/photos/2", jeton=admin_jeton, methode="DELETE")[0] == 200
    for chemin in ("ph1/photos/1", "ph1/prive/contact", "ph1"):
        appel(FS + f"/demandes/{chemin}", jeton="owner", methode="DELETE")

    # avis d'acheteur public (lot 19) : tout compte vérifié, créé en attente avec le contact du service marchés, lien https obligatoire ;
    # invisible jusqu'à la validation par l'admin, puis public ; jamais de « Je suis intéressé » (on répond sur sa plateforme)
    AVIS_PUBLIC = {"type": "public", "metier": "voirie-vrd", "titre": "Réfection de la voirie communale, tranche 2",
                   "acheteur": "Commune de Corte", "lien": "https://www.marches-publics.info/avis/123", "commune": "Corte",
                   "departement": "2B", "budget": 250000, "delai": dans(30), "statut": "en_attente", "cree": True, "uid": part_uid}
    MARCHES = {"nom": "Service des marchés", "email": "marches@mairie.test", "consentement": True, "cree": True}

    def avis_public(i, champs=None, jeton=part_jeton, avec_contact=True, enlever=None):
        a = {**AVIS_PUBLIC, **(champs or {})}
        w = [ecriture(f"demandes/{i}", sans(a, enlever) if enlever else a)]
        if avec_contact:
            w.append(ecriture(f"demandes/{i}/prive/contact", MARCHES))
        return commit(w, jeton)

    assert avis_public("pub1") == 200
    assert avis_public("pub2", {"uid": ent_uid}, jeton=ent_jeton) == 200, "avis public depuis un compte Entreprise"
    assert avis_public("pub3", enlever="budget") == 200, "montant facultatif"
    refus_public = {
        "sans connexion": dict(jeton=None),
        "compte sans profil": dict(jeton=intrus_jeton, champs={"uid": intrus_uid}),
        "e-mail pas vérifié": dict(jeton=ent_nv_jeton, champs={"uid": ent_nv_uid}),
        "uid d'un autre": dict(champs={"uid": ent_uid}),
        "sans contact": dict(avec_contact=False),
        "publié sans validation": dict(champs={"statut": "validee"}),
        "sans lien": dict(enlever="lien"),
        "lien http": dict(champs={"lien": "http://www.exemple.fr/avis"}),
        "lien javascript": dict(champs={"lien": "javascript:alert(1)//https://x.fr"}),
        "lien avec espace": dict(champs={"lien": "https://www.exemple.fr/a b"}),
        "lien trop long": dict(champs={"lien": "https://www.exemple.fr/" + "a" * 500}),
        "sans acheteur": dict(enlever="acheteur"),
        "acheteur trop long": dict(champs={"acheteur": "a" * 121}),
        "objet trop long": dict(champs={"titre": "t" * 201}),
        "description en trop": dict(champs={"description": "Texte libre qui n'a pas sa place ici."}),
        "photos": dict(champs={"photos": 1}),
        "métier inconnu": dict(champs={"metier": "astrologie"}),
        "département": dict(champs={"departement": "13"}),
        "montant texte": dict(champs={"budget": "beaucoup"}),
        "délai passé": dict(champs={"delai": dans(-1)}),
        "délai trop loin": dict(champs={"delai": dans(400)}),
    }
    for nom, k in refus_public.items():
        assert avis_public("refus-pub", **k) == 403, f"avis public : {nom}"
    # en attente : seuls l'auteur et l'admin le voient ; l'auteur ne le publie pas lui-même
    for jeton in (None, ent_jeton, intrus_jeton):
        assert appel(FS + "/demandes/pub1", jeton=jeton)[0] == 403, "avis public en attente visible"
    assert appel(FS + "/demandes/pub1", jeton=part_jeton)[0] == 200
    code, res = appel(FS + ":runQuery", requete("statut", "validee"))
    assert code == 200 and "pub1" not in ids(res)
    assert maj("demandes/pub1", part_jeton, {"statut": "validee"}) == 403, "avis publié par son auteur"
    # validé par l'admin : public, le contact du service marchés reste privé
    assert maj("demandes/pub1", admin_jeton, {"statut": "validee"}) == 200
    assert appel(FS + "/demandes/pub1")[0] == 200
    assert appel(FS + "/demandes/pub1/prive/contact")[0] == 403
    assert appel(FS + "/demandes/pub1/prive/contact", jeton=admin_jeton)[0] == 200
    assert interet({**INTERET, "uid": ent2_uid}, d="pub1", jeton=ent2_jeton) == 403, "« Je suis intéressé » sur un avis public"
    for i in ("pub1", "pub2", "pub3"):
        appel(FS + f"/demandes/{i}/prive/contact", jeton="owner", methode="DELETE")
        appel(FS + f"/demandes/{i}", jeton="owner", methode="DELETE")

    print(f"OK : règles Firestore (profils : {len(refus_profil) + 16} refus de création, lecture et modification, "
          f"décennale : {len(refus_dec) + 3} refus ; "
          f"demandes : {len(refus_compte) + len(refus) + 3} refus de création, lecture, Mes demandes, modération, suppression ; "
          f"intérêts : {len(refus_interet) + len(refus_compteur) + 11} refus, aucune lecture publique, plafond de 5 ; pourvue : 6 refus ; "
          f"partenaires : {len(refus_partenaire) + 17} refus, lus par l'admin seulement ; "
          f"fiches : {len(refus_fiche) + 20} refus, publiques après validation seulement, jamais listées ; "
          f"photos : {len(refus_photos) + 7} refus, cachées quand la demande est retirée ; "
          f"discussions : {len(refus_ouverture) + len(refus_message) + 21} refus, lues par les 2 participants et l'admin ; jetons : 7 refus ; "
          f"avis publics : {len(refus_public) + 5} refus, invisibles avant validation par l'admin)")

    for _, u in autres[:4]:
        appel(FS + f"/demandes/cap/interets/{u}", jeton="owner", methode="DELETE")
    appel(FS + f"/demandes/cap/interets/{ent_uid}", jeton="owner", methode="DELETE")
    appel(FS + "/demandes/cap", jeton="owner", methode="DELETE")
    if "--demo" in sys.argv:  # ok1 publiée avec 1 artisan intéressé, x1 retirée (compte particulier) ; e1 validée (compte entreprise)
        print(f"Démo prête : admin {ADMIN[0]} / {ADMIN[1]} ; particulier {PART[0]} / {PART[1]} ; entreprise {ENT[0]} / {ENT[1]}"
              " (e-mails vérifiés) ; entreprise2 à entreprise6@test.local, même mot de passe")
    else:
        appel(FS + f"/demandes/ok1/interets/{ent_uid}", jeton="owner", methode="DELETE")
        appel(FS + f"/partenaires/{AVIS}_{ent_uid}", jeton="owner", methode="DELETE")
        for chemin in (f"discussions/{DISC}/messages/m1", f"discussions/{DISC}/messages/m2", f"discussions/{DISC}",
                       f"demandes/t1/interets/{ent3_uid}", f"jetons/{part_uid}"):
            appel(FS + f"/{chemin}", jeton="owner", methode="DELETE")
        for i in ("ok1", "x1", "e1", "t1"):
            appel(FS + f"/demandes/{i}/prive/contact", jeton="owner", methode="DELETE")
            appel(FS + f"/demandes/{i}", jeton="owner", methode="DELETE")
        for uid in [part_uid, ent_uid, part_nv_uid, ent_nv_uid] + [u for _, u in autres]:
            appel(FS + f"/users/{uid}", jeton="owner", methode="DELETE")
            appel(FS + f"/types/{uid}", jeton="owner", methode="DELETE")


if __name__ == "__main__":
    main()
