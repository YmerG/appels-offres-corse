#!/usr/bin/env python3
"""python3 outils/test_notifier.py : contrôle de notifier.py (qui prévenir, et de quoi), sans réseau ni envoi."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import notifier as N  # noqa: E402

t0 = datetime(2026, 10, 29, 10, tzinfo=timezone.utc)
D = {"id": "dem1_ent1", "particulier": "p1", "entreprise": "ent1", "titre": "Chauffe-eau à changer", "nomEntreprise": "Plomberie Test"}

# l'entreprise vient d'écrire : le demandeur est prévenu, avec le nom de l'entreprise, sans le texte du message
r = N.a_notifier([dict(D, dernier="ent1", maj=t0 + timedelta(minutes=3))], t0)
assert r == [("p1", {"titre": "Nouveau message de Plomberie Test", "corps": "« Chauffe-eau à changer »",
                     "url": "discussion.html?id=dem1_ent1", "tag": "dem1_ent1"})], r
# le demandeur a écrit : l'entreprise est prévenue
assert N.a_notifier([dict(D, dernier="p1", maj=t0 + timedelta(minutes=3))], t0)[0][0] == "ent1"
# rien d'ancien, rien de déjà lu
assert N.a_notifier([dict(D, dernier="ent1", maj=t0 - timedelta(minutes=1))], t0) == []
assert N.a_notifier([dict(D, dernier="ent1", maj=t0 + timedelta(minutes=3), luP=t0 + timedelta(minutes=4))], t0) == []
# lu avant le nouveau message : prévenu quand même
assert len(N.a_notifier([dict(D, dernier="ent1", maj=t0 + timedelta(minutes=3), luP=t0 + timedelta(minutes=1))], t0)) == 1
print("OK : notifications (destinataire, déjà lue, texte sans le message)")
