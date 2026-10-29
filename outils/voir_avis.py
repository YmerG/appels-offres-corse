# Affiche ce que collecte.py lit d'un avis BOAMP et les passages « attribué / sans suite » de ses données.
# Usage : python3 outils/voir_avis.py 26-22721 [autres idweb…]
import json, re, sys, urllib.request
from pathlib import Path
from urllib.parse import urlencode
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import collecte as c

if sys.argv[1:] == ["--ancien-format"]:
    # début du texte « attributionMarche » des avis d'attribution à l'ancien format (12 derniers mois)
    from datetime import datetime, timedelta
    for r in c.lire_resultats(datetime.now() - timedelta(days=365)):
        d = json.loads(r.get("donnees") or "{}")
        t = c.chercher(d, "attributionMarche")
        if t is not None:
            print(r["idweb"], "|", " ".join(str(t).split())[:110])
    sys.exit()

for idweb in sys.argv[1:]:
    url = c.API + "?" + urlencode({"where": f'idweb="{idweb}"', "select": c.CHAMPS})
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": c.UA}), timeout=60))["results"][0]
    d = json.loads(r["donnees"] or "{}")
    print(idweb, "resultat =", c.resultat(d), "| clés :", list(d.keys())[:5])
    print("   attributionMarche :", c.chercher(d, "attributionMarche"))
    s = json.dumps(d, ensure_ascii=False)
    for m in re.finditer(r"(?i)sans suite|infructu|non attribu|attribu", s):
        print("   …", s[max(0, m.start() - 200):m.end() + 80].replace("\n", " "))
    print("======")
