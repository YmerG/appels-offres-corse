#!/usr/bin/env python3
"""python3 outils/test_emails.py : contrôle de envoyer_emails.py sur les données fictives, sans réseau ni envoi."""
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import envoyer_emails as E  # noqa: E402

source = E.Fichier(ICI / "emails-essai.json")
demandes, abonnes = source.demandes(), source.abonnes()
maintenant = datetime(2026, 10, 29, tzinfo=timezone.utc)

# qui reçoit quoi : seulement les demandes publiées ; alertes aux abonnés Entreprise du bon métier et département,
# pas sur leur propre demande, pas sur une demande close, pas aux particuliers
cles = {c for c, _, _ in E.a_envoyer(demandes, abonnes, set(), maintenant)}
assert cles == {"validee:d1", "reponses:d1:2", "alerte:d1:e1", "alerte:d1:e3",
                "validee:d2", "reponses:d2:1", "alerte:d2:e3", "validee:d4", "validee:d5", "alerte:d5:e3"}, cles

# déjà envoyé : rien deux fois ; tournée d'alertes finie : plus d'alerte, même à un nouvel abonné
assert not E.a_envoyer(demandes, abonnes, cles | {"alertes:d1", "alertes:d2", "alertes:d5"}, maintenant)
# nouvelles réponses transmises : un nouvel e-mail
d1 = dict(next(d for d in demandes if d["id"] == "d1"), reponses=3)
assert [c for c, _, _ in E.a_envoyer([d1], [], {"validee:d1", "reponses:d1:2"}, maintenant)] == ["reponses:d1:3"]
# demande pourvue ou complète (5 entreprises) : pas d'alerte, mais toujours l'e-mail au demandeur
for fermee in ({"pourvue": True}, {"nbInterets": 5}):
    d5 = dict(next(d for d in demandes if d["id"] == "d5"), **fermee)
    assert [c for c, _, _ in E.a_envoyer([d5], abonnes, set(), maintenant)] == ["validee:d5"], fermee

# contenu : HTML échappé, accord singulier / pluriel, lien de désinscription dans les alertes seulement
_, texte, page = E.message("validee:d1", d1, None, "Jeanne", "https://site.invalid/")
assert "&lt;électrique&gt;" in page and "<électrique>" not in page
d2 = next(d for d in demandes if d["id"] == "d2")
assert "ses coordonnées" in E.message("reponses:d2:1", d2, None, "Paul", "https://s/")[1]
assert "leurs coordonnées" in E.message("reponses:d1:3", d1, None, "Jeanne", "https://s/")[1]
assert "Son message est" in E.message("reponses:d2:1", d2, None, "Paul", "https://s/")[1]
assert "Leurs messages sont" in E.message("reponses:d1:3", d1, None, "Jeanne", "https://s/")[1]
assert "alertes=non" in E.message("alerte:d1:e1", d1, abonnes[0], "Élec", "https://s/")[1]
assert "alertes=non" not in texte
assert 'href="https://s/compte.html?alertes=non#alertes"' in E.message("alerte:d1:e1", d1, abonnes[0], "Élec", "https://s/")[2]
# publiée après sa date limite : pas de date passée annoncée comme à venir
d4 = next(d for d in demandes if d["id"] == "d4")
assert "est passée" in E.message("validee:d4", d4, None, "Paul", "https://s/")[1]
assert "peuvent y répondre" in texte
assert "Mes discussions" in texte
# avis d'acheteur public (lot 19) : e-mail « avis publié », alerte avec le lien officiel (échappé), pas de « Mes discussions »
pub = dict(d2, id="p9", type="public", reponses=0, acheteur="Commune <de> Corte", lien="https://exemple.invalid/avis?a=1&b=2", budget=250000)
assert [c for c, _, _ in E.a_envoyer([pub], abonnes, set(), maintenant)] == ["validee:p9", "alerte:p9:e3"]
sujet, texte_pub, _ = E.message("validee:p9", pub, None, "Service des marchés", "https://s/")
assert sujet.startswith("Votre avis est publié") and "onglet Public" in texte_pub and "Mes discussions" not in texte_pub
sujet, texte_pub, page_pub = E.message("alerte:p9:e3", pub, abonnes[0], "Élec", "https://s/")
assert sujet.startswith("Nouvel appel d'offres public") and "250 000 € HT" in texte_pub and "alertes=non" in texte_pub
assert 'href="https://exemple.invalid/avis?a=1&amp;b=2"' in page_pub and "Commune &lt;de&gt; Corte" in page_pub
# adresse du demandeur : celle du compte vérifié, pas l'e-mail tapé dans la demande
assert source.contact(d1) == ("jeanne.compte@exemple.invalid", "Jeanne Exemple")

# devis (lot 20) : e-mail au destinataire, n° comme sur le site (date à Paris), PDF refait par Node, titre échappé
v = source.devis()[0]
assert E.numero(v) == "D20261029-D1E1"
sujet, texte_devis, page_devis = E.message("devis:d1_e1", v, None, "", "https://s/")
assert sujet == "Devis de Élec Exemple : Changer le tableau <électrique>"
assert "D20261029-D1E1" in texte_devis and "bon pour accord" in texte_devis and "compte.html#devis" in texte_devis
assert "&lt;électrique&gt;" in page_devis and "<électrique>" not in page_devis
assert E.pdf_devis(v)[:5] == b"%PDF-"

# programme complet en essai, deux fois : 7 e-mails puis plus rien ; aucune adresse dans le journal
with tempfile.TemporaryDirectory() as t:
    cmd = [sys.executable, str(ICI / "envoyer_emails.py"), "--essai", str(ICI / "emails-essai.json"),
           "--etat", f"{t}/etat.json", "--apercus", f"{t}/apercus"]
    sortie1 = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    sortie2 = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    assert "envoyés 8, sans adresse 3, échecs 0" in sortie1, sortie1
    assert "envoyés 0, sans adresse 0" in sortie2, sortie2
    assert "@" not in sortie1 + sortie2
    assert len(list(Path(t, "apercus").glob("*.html"))) == 8
    assert Path(t, "apercus", "devis-D20261029-D1E1.pdf").read_bytes()[:5] == b"%PDF-"
    # tout premier passage : ce qui existe déjà est noté, rien n'est envoyé, puis rien au passage suivant
    cmd = cmd[:4] + ["--etat", f"{t}/etat2.json"]
    sortie3 = subprocess.run(cmd + ["--premier-passage"], capture_output=True, text=True, check=True).stdout
    sortie4 = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    assert "Premier passage : 11 e-mails" in sortie3 and "envoyés 0, sans adresse 0" in sortie3, sortie3
    assert "envoyés 0, sans adresse 0" in sortie4, sortie4

# sans secrets : ne fait rien
vide = subprocess.run([sys.executable, str(ICI / "envoyer_emails.py")], capture_output=True, text=True, check=True,
                      env={"PATH": "/usr/bin:/bin"}).stdout
assert "rien à faire" in vide, vide
print("e-mails : ok")
