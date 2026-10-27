# Compare main vs branch walks: step states (JSON) and screenshots (pixel diff).
# Usage: python compare.py <outDir>
import json, sys, os
from PIL import Image, ImageChops

out = sys.argv[1]
KEYS = ["phase", "page", "pages", "photos", "withUrl", "blobUrls", "measured", "checked", "leftOut",
        "sampleNames", "syntheticNames", "title", "filledSlotsAll", "pageFills"]
SCREEN = ["blobImgsShown", "blobImgsLoaded", "blobImgsBroken", "notes", "sampleAlbumOffer", "samplePhotosOffer", "saysForTesting"]
for mode in ["sample", "normal"]:
    a = json.load(open(os.path.join(out, f"main-{mode}.json"), encoding="utf8"))
    b = json.load(open(os.path.join(out, f"branch-{mode}.json"), encoding="utf8"))
    print(f"== {mode}: main failed={a.get('failed')} branch failed={b.get('failed')}  errors main={len(a['errors'])} branch={len(b['errors'])}")
    diffs = 0
    for sa, sb in zip(a["steps"], b["steps"]):
        if sa["what"] != sb["what"]:
            print("  step order differs:", sa["what"], "|", sb["what"]); diffs += 1; continue
        row = []
        for k in KEYS:
            if k in sa or k in sb:
                if sa.get(k) != sb.get(k): row.append(f"{k}: {sa.get(k)} vs {sb.get(k)}")
        sca, scb = sa.get("screen", sa if "blobImgsShown" in sa else {}), sb.get("screen", sb if "blobImgsShown" in sb else {})
        for k in SCREEN:
            if k in sca or k in scb:
                if sca.get(k) != scb.get(k): row.append(f"screen.{k}: {sca.get(k)} vs {scb.get(k)}")
        for k in ["samePages", "samePhotoNames", "sameFills", "taps", "pageIndex", "onPage", "pagesWithPicked", "count", "withBlob"]:
            if k in sa or k in sb:
                if sa.get(k) != sb.get(k): row.append(f"{k}: {sa.get(k)} vs {sb.get(k)}")
        for k in ["idb"]:
            if k in sa or k in sb:
                if sa.get(k) != sb.get(k): row.append(f"{k}: {sa.get(k)} vs {sb.get(k)}")
        if row:
            diffs += 1
            print("  ", sa["what"], "->", "; ".join(row))
    print(f"  steps main={len(a['steps'])} branch={len(b['steps'])}, steps with a difference: {diffs}")
    print("  screenshots:")
    for fa, fb in zip(a["shots"], b["shots"]):
        ia = Image.open(os.path.join(out, fa)).convert("RGB")
        ib = Image.open(os.path.join(out, fb)).convert("RGB")
        if ia.size != ib.size:
            print(f"    {fa[5:]}: size {ia.size} vs {ib.size}"); continue
        d = ImageChops.difference(ia, ib).convert("L").point(lambda v: 255 if v > 24 else 0)
        n = sum(1 for v in d.getdata() if v)
        bbox = d.getbbox()
        print(f"    {fa[len('main-'):]}: {100 * n / (ia.size[0] * ia.size[1]):.2f}% pixels differ, box {bbox}")
