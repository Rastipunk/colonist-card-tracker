"""UI language per installation, read from the CCTR headers of ./dataset.
   python tools/langs.py [--all]   (default: excludes Juan's installs and test games)"""
import gzip, json, os, struct, sys, collections, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MINE = {"54f04dd397e45f0c", "595789dba9a84978", "3e2ef952ad32a437"}
show_all = "--all" in sys.argv
per_install = collections.defaultdict(collections.Counter)
tz = collections.defaultdict(collections.Counter)
n = 0
for f in glob.glob(os.path.join(ROOT, "dataset", "games", "**", "*.cctr.gz"), recursive=True):
    with gzip.open(f, "rb") as fh:
        head = fh.read(9)
        if head[:4] != b"CCTR":
            continue
        (mlen,) = struct.unpack(">I", head[5:9])
        meta = json.loads(fh.read(mlen).decode("utf-8"))
    inst = meta.get("install") or meta.get("installId") or "?"
    gid = str(meta.get("gameId", ""))
    if gid.startswith(("simgame", "deploytest")):
        continue
    if not show_all and inst in MINE:
        continue
    per_install[inst][meta.get("lang") or "?"] += 1
    if meta.get("tz"): tz[inst][meta["tz"]] += 1
    n += 1
print(f"grabaciones consideradas: {n}")
langs = collections.Counter()
for inst, c in sorted(per_install.items(), key=lambda kv: -sum(kv[1].values())):
    main = c.most_common(1)[0][0]
    langs[main] += 1
    extra = f"  tz={dict(tz[inst])}" if tz.get(inst) else ""
    print(f"{inst}  {dict(c)}{extra}")
print("\ninstalaciones por idioma principal:")
for l, k in langs.most_common():
    print(f"  {l:8s} {k}")
