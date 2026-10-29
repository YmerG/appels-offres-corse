#!/usr/bin/env python3
"""python3 outils/test_moderer.py : contrôle de moderer.py sur des demandes fictives, sans réseau ni envoi."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moderer as M  # noqa: E402

PROPRE = {"titre": "Remplacement d'un chauffe-eau électrique",
          "description": "Chauffe-eau de 200 litres qui fuit dans le garage, à remplacer par un modèle équivalent. "
                         "Accès facile, maison de plain-pied. Budget indicatif 1 500 €, intervention avant fin novembre.",
          "commune": "L'Île-Rousse", "departement": "2B"}


def raisons(**changes):
    return M.verifier(dict(PROPRE, **changes))


def avec(texte):
    return raisons(description=PROPRE["description"] + " " + texte)


assert raisons() == [], raisons()
# communes écrites autrement (accents, tirets, Saint/St) : reconnues
for c, dep in (("ile rousse", "2B"), ("Ajaccio", "2A"), ("St-Florent", "2B"), ("Porto-Vecchio", "2A"), ("Bastia", "2B")):
    assert raisons(commune=c, departement=dep) == [], c

# coordonnées dans le texte, sous toutes leurs formes
for t in ("Appelez le 06 12 34 56 78", "tél. 0612345678", "au +33 6 12 34 56 78", "joignable au 04.95.21.00.00"):
    assert "numéro de téléphone" in avec(t), t
assert "numéro de téléphone" in raisons(titre="Fuite urgente 0612345678")
for t in ("écrire à jean.dupont@gmail.com", "jean.dupont (at) gmail.com", "jean arobase orange.fr"):
    assert "adresse e-mail" in avec(t), t
for t in ("photos sur https://exemple.org/x", "voir www.monsite.corsica", "voir monsite.fr"):
    assert "lien vers un site" in avec(t), t
for t in ("contactez-moi sur WhatsApp", "voir mon Insta", "écrivez sur Facebook"):
    assert "réseau social ou messagerie" in avec(t), t
# déguisements trouvés par le Testeur (rapport 45)
for t in ("au 06/12/34/56/78", "au 06,12,34,56,78", "zéro six douze trente-quatre cinquante-six soixante-dix-huit"):
    assert "numéro de téléphone" in avec(t), t
for t in ("jean.dupont at gmail point com", "mon gmail : jeandupont2B", "écrire à jean point dupont hotmail.fr"):
    assert "adresse e-mail" in avec(t), t
assert "lien vers un site" in avec("voir monsite . fr")
assert "réseau social ou messagerie" in avec("whatsapp0612")
assert "mot grossier" in avec("Les derniers étaient des connasses.")
assert {"numéro de téléphone", "caractères inattendus dans la commune"} <= set(raisons(commune="Corte 0612345678"))
# pas de fausse alerte : cambriolage, artisan escroc, « con » corse, hameau connu, référence produit
for t in ("Porte forcée par des voleurs, serrure à changer.", "Le précédent artisan était un escroc.",
          "Casa con giardinu, accès par la route.", "Référence du ballon : 1234567890."):
    assert avec(t) == [], (t, avec(t))
assert raisons(commune="Porticcio", departement="2A") == []
assert M.masquer("Fuite 06/12/34/56/78") == "Fuite [masqué]"
# 2e série (rapport 46) : tirets insécables, chiffres espacés, lien sans points, Viber ; « Ota (Porto) », « pas de compte Gmail »
for t, raison in (("au 06\u201112\u201134\u201156\u201178", "numéro de téléphone"), ("au 0 6 . 1 2 . 3 4 . 5 6 . 7 8", "numéro de téléphone"),
                  ("voir www monsite fr", "lien vers un site"), ("écrivez-moi sur Viber", "réseau social ou messagerie")):
    assert raison in avec(t), t
assert avec("Je n'ai pas de compte Gmail, merci de passer par le site.") == []
assert raisons(commune="Ota (Porto)", departement="2A") == []
assert M.masquer("Fuite 06\u202f12\u202f34\u202f56\u202f78") == "Fuite [masqué]"
# pas de faux numéro : montants, dates, surfaces
for t in ("Budget 10 000 €, 120 m², le 12/03/2026 ou le 15.11.2026.", "Devis attendu sous 3 semaines, 2 x 50 m."):
    assert avec(t) == [], (t, avec(t))

# insultes, publicité, répétitions, majuscules, texte tapé au hasard
assert "mot grossier" in avec("Le dernier artisan était un vrai connard.")
assert "mot grossier" in avec("Travail de merde à refaire")
assert "publicité ou spam" in avec("Gagnez des bitcoins avec notre casino")
assert "répétitions" in avec("urgent urgent urgent urgent")
assert "répétitions" in avec("Vite !!!!!")
assert "trop de majuscules" in raisons(titre="CHAUFFE-EAU A CHANGER VITE")
assert "texte incompréhensible" in raisons(titre="qsdfghjk lmpoiuy", description="qsdfg hjklm wxcvb nqsdf ghjkl mpwxc vbnqs")
# pas de faux positifs : un mot qui contient une insulte, une capitale normale, un sigle
assert avec("Prévoir le conduit, la console et le constat. Raccordement EDF et VMC.") == []

# commune hors Corse ou département incohérent
assert raisons(commune="Marseille") == ["commune inconnue en Corse"]
assert raisons(commune="Ajaccio", departement="2B") == ["commune en 2A, département 2B"]
# longueurs, photos (toujours regardées par un humain)
assert "titre trop court ou trop long" in raisons(titre="WC")
assert "description trop courte ou trop longue" in raisons(description="Fuite sous l'évier, merci.")
assert raisons(photos=2) == ["photos à regarder"]

# masquage du titre dans le message
assert M.masquer("Fuite, appelez 06 12 34 56 78 ou a@b.fr") == "Fuite, appelez [masqué] ou [masqué]"
# lecture d'une réponse Firestore REST
assert M.valeur({"stringValue": "Bastia"}) == "Bastia" and M.valeur({"integerValue": "2"}) == 2

# un passage complet : seules les nouvelles sont vérifiées, chaque problème signalé une seule fois, avec le lien admin
demandes = [dict(PROPRE, id="a"), dict(PROPRE, id="b", photos=1), dict(PROPRE, id="c", commune="Nice"),
            dict(PROPRE, id="d", titre="Fuite 0612345678"), dict(PROPRE, id="v", titre="Déjà vue 0612345678"),
            # avis d'acheteur public (lot 19) : validé à la main dans l'admin, sans description ; jamais signalé
            {"id": "p", "type": "public", "titre": "Voirie communale, tranche 2", "commune": "Corte", "departement": "2B"}]
messages = []
garder = M.moderer(demandes, {"v", "supprimee"}, False, lambda t: messages.append(t) or True)
assert garder == {"a", "b", "c", "d", "v", "p"}, garder
assert messages == [f"Demande à vérifier : Remplacement d'un chauffe-eau électrique — photos à regarder — {M.ADMIN}#d-b",
                    f"Demande à vérifier : Remplacement d'un chauffe-eau électrique — commune inconnue en Corse — {M.ADMIN}#d-c",
                    f"Demande à vérifier : Fuite [masqué] — numéro de téléphone — {M.ADMIN}#d-d"], messages
messages.clear()
assert M.moderer(demandes, garder, False, lambda t: messages.append(t) or True) == garder and not messages, "rien deux fois"
# message pas parti : la demande sera revue au passage suivant
assert M.moderer(demandes[1:2], set(), False, lambda t: False) == set()
# essai : rien noté, rien envoyé
assert M.moderer(demandes, set(), True, lambda t: messages.append(t) or True) == {"a", "p"} and not messages
# messages des discussions (lot 18.6) : pas les coordonnées (normales en privé), mais insultes, pub, répétitions, majuscules
assert M.verifier_message("Je peux passer mardi, appelez-moi au 06 12 34 56 78.") == []
assert M.verifier_message("Espèce de connard") == ["mot grossier"]
assert "publicité ou spam" in M.verifier_message("Gagnez des bitcoins")
assert M.verifier_message("RAPPELEZ MOI VITE SVP") == ["trop de majuscules"]
msgs = [{"demande": "d1", "texte": "Bonjour, dispo jeudi ?", "cree": "2026-10-29T10:00:00Z"},
        {"demande": "d2", "texte": "Bande de connards, appelez le 06 12 34 56 78", "cree": "2026-10-29T10:05:00.123456789Z"},
        {"demande": "d1", "texte": "Merci", "cree": "2026-10-29T10:10:00.5Z"}]
messages = []
assert M.moderer_messages(msgs, "2026-10-29T09:00:00Z", False, lambda t: messages.append(t) or True) == "2026-10-29T10:10:00.5Z"
assert messages == [f"Message à vérifier : « Bande de connards, appelez le [masqué] » — mot grossier — {M.ADMIN}#d-d2"], messages
# envoi raté : arrêt avant ce message, revu au passage suivant
assert M.moderer_messages(msgs, "2026-10-29T09:00:00Z", False, lambda t: False) == "2026-10-29T10:00:00Z"
print("OK : contrôle des demandes (propre, téléphone, e-mail, lien, réseaux, insultes, pub, commune, photos, passage complet)")
