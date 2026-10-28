"""THE PRINT FILES, READ BY AN OUTSIDE PDF READER (PyMuPDF / MuPDF).

Called by the app's print-file check (mobile/test/printFiles.check.ts) for
one album, after the website's files (printWeb.mjs) and the app's are made:

    python -I printCompare.py <web album dir> <app album dir> <out dir> <dpi>

For each file both sides made (interior, cover, sheets, cover-sheet), and its
"bare" copy (the check's copy with every see-through picture blanked: the
words and labels left out), it writes:
  * every page at <dpi> as PNG, full and bare, for the pixel comparison;
  * what is on each page, read back as numbers: page box, every picture
    (where it lands, its own size, see-through or not), every line and
    filled shape (ends, width, colour, dashes), every clip, and the fonts.
It prints one JSON object: the numbers for both sides, the differences, and
where each page's words sit (the see-through pictures, in raster pixels: the
zones the pixel comparison leaves to the ink bars).
"""
import json
import os
import sys

import fitz  # PyMuPDF

KINDS = ['interior', 'cover', 'sheets', 'cover-sheet']


def r2(v):
    return round(float(v), 2)


def rect(r):
    return [r2(r.x0), r2(r.y0), r2(r.x1), r2(r.y1)]


def page_numbers(page):
    images = []
    for info in page.get_image_info(xrefs=True):
        images.append({
            'bbox': [r2(v) for v in info['bbox']],
            'transform': [round(v, 3) for v in info['transform']],
            'px': [info['width'], info['height']],
            'mask': bool(info.get('has-mask')),
        })
    images.sort(key=lambda i: (i['mask'], i['bbox'][1], i['bbox'][0]))
    lines = []
    clips = []
    for d in page.get_drawings(extended=True):
        kind = d.get('type')
        if kind == 'clip':
            clips.append({'scissor': rect(d['scissor'])})
            continue
        if kind == 'group':
            continue
        items = []
        for it in d.get('items', []):
            op = it[0]
            if op == 'l':
                items.append(['l', r2(it[1].x), r2(it[1].y), r2(it[2].x), r2(it[2].y)])
            elif op == 're':
                items.append(['re'] + rect(it[1]))
            elif op == 'qu':
                q = it[1]
                items.append(['qu', r2(q.ul.x), r2(q.ul.y), r2(q.lr.x), r2(q.lr.y)])
            else:
                items.append([op])
        lines.append({
            'type': kind,
            'items': items,
            'width': r2(d.get('width') or 0),
            'color': [round(c, 3) for c in (d.get('color') or [])],
            'fill': [round(c, 3) for c in (d.get('fill') or [])],
            'dashes': d.get('dashes'),
        })
    lines.sort(key=lambda l: json.dumps(l['items']))
    clips.sort(key=lambda c: c['scissor'])
    return {
        'box': rect(page.mediabox),
        'images': images,
        'lines': lines,
        'clips': clips,
        'fonts': len(page.get_fonts(full=True)),
    }


def max_diff(a, b):
    """The largest difference between two lists of numbers of the same shape, or None if the shapes differ."""
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b)
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return None
        worst = 0.0
        for x, y in zip(a, b):
            d = max_diff(x, y)
            if d is None:
                return None
            worst = max(worst, d)
        return worst
    return 0.0 if a == b else None


def doc_numbers(path):
    doc = fitz.open(path)
    pages = [page_numbers(p) for p in doc]
    meta = doc.metadata or {}
    doc.close()
    return {'pages': pages, 'keywords': meta.get('keywords', ''), 'bytes': os.path.getsize(path)}


def compare_docs(web, app):
    out = {'pages': [len(web['pages']), len(app['pages'])], 'keywords': [web['keywords'], app['keywords']], 'bytes': [web['bytes'], app['bytes']]}
    if len(web['pages']) != len(app['pages']):
        out['problem'] = 'page counts differ'
        return out
    worst = {'box': 0.0, 'images': 0.0, 'lines': 0.0, 'clips': 0.0}
    problems = []
    fonts = [0, 0]
    for n, (w, a) in enumerate(zip(web['pages'], app['pages'])):
        fonts[0] += w['fonts']
        fonts[1] += a['fonts']
        d = max_diff(w['box'], a['box'])
        worst['box'] = max(worst['box'], d if d is not None else 1e9)
        # Pictures: the page pictures (no mask) must land in the same place,
        # at the same size; the see-through ones (words and labels) are made
        # by each side's own text drawing, so only their count and spots are listed.
        wp = [i for i in w['images'] if not i['mask']]
        ap = [i for i in a['images'] if not i['mask']]
        d = max_diff([i['bbox'] for i in wp], [i['bbox'] for i in ap])
        if d is None:
            problems.append(f'page {n + 1}: {len(wp)} page pictures on the website, {len(ap)} in the app')
        else:
            worst['images'] = max(worst['images'], d)
            if [i['px'] for i in wp] != [i['px'] for i in ap]:
                problems.append(f'page {n + 1}: page pictures of other pixel sizes {[i["px"] for i in wp]} vs {[i["px"] for i in ap]}')
        wm = [i for i in w['images'] if i['mask']]
        am = [i for i in a['images'] if i['mask']]
        if len(wm) != len(am):
            problems.append(f'page {n + 1}: {len(wm)} see-through pictures (words, labels) on the website, {len(am)} in the app')
        d = max_diff([[l['type'], l['items'], l['width'], l['color'], l['fill']] for l in w['lines']],
                     [[l['type'], l['items'], l['width'], l['color'], l['fill']] for l in a['lines']]) \
            if [l['type'] for l in w['lines']] == [l['type'] for l in a['lines']] else None
        if d is None:
            problems.append(f'page {n + 1}: lines differ ({len(w["lines"])} on the website, {len(a["lines"])} in the app)')
        else:
            worst['lines'] = max(worst['lines'], d)
        if [l['dashes'] for l in w['lines']] != [l['dashes'] for l in a['lines']]:
            problems.append(f'page {n + 1}: dashes differ')
        d = max_diff([c['scissor'] for c in w['clips']], [c['scissor'] for c in a['clips']])
        if d is None:
            problems.append(f'page {n + 1}: clips differ ({len(w["clips"])} vs {len(a["clips"])})')
        else:
            worst['clips'] = max(worst['clips'], d)
    out['worstPt'] = worst
    # Fonts listed on the pages, website / app (jsPDF lists its 14 standard
    # fonts on every page of the checkout's files; the console drops them).
    out['fonts'] = fonts
    out['linesPerPage'] = [len(p['lines']) for p in web['pages']]
    out['seeThroughPerPage'] = [[len([i for i in w['images'] if i['mask']]), len([i for i in a['images'] if i['mask']])] for w, a in zip(web['pages'], app['pages'])]
    if problems:
        out['problems'] = problems
    return out


def merge(boxes):
    """Overlapping boxes as one (a label merged with a word counts as a word)."""
    boxes = [list(b) for b in boxes]
    changed = True
    while changed:
        changed = False
        out = []
        for b in boxes:
            for o in out:
                if b[0] <= o[2] and o[0] <= b[2] and b[1] <= o[3] and o[1] <= b[3]:
                    o[0], o[1], o[2], o[3] = min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3])
                    o[4] = 'label' if o[4] == 'label' and b[4] == 'label' else 'word'
                    changed = True
                    break
            else:
                out.append(b)
        boxes = out
    return boxes


def rasters(path, bare_path, out_dir, prefix, dpi):
    doc = fitz.open(path)
    bare = fitz.open(bare_path)
    files = []
    zones = []
    s = dpi / 72.0
    for n in range(len(doc)):
        full_png = os.path.join(out_dir, f'{prefix}-p{n + 1}.png')
        bare_png = os.path.join(out_dir, f'{prefix}-p{n + 1}.bare.png')
        doc[n].get_pixmap(dpi=dpi, alpha=False).save(full_png)
        bare[n].get_pixmap(dpi=dpi, alpha=False).save(bare_png)
        files.append([full_png, bare_png])
        page_zones = []
        for i in doc[n].get_image_info():
            if not i.get('has-mask'):
                continue
            b = i['bbox']
            # A sheet label is drawn at 600 DPI (textPainter), a page's words at
            # 300 DPI: pixels per point tell them apart, turned or not.
            long_px, long_pt = max(i['width'], i['height']), max(b[2] - b[0], b[3] - b[1])
            kind = 'label' if long_pt > 0 and long_px / long_pt > 6 else 'word'
            page_zones.append([b[0] * s, b[1] * s, b[2] * s, b[3] * s, kind])
        zones.append(page_zones)
    doc.close()
    bare.close()
    return files, zones


def main():
    web_dir, app_dir, out_dir, dpi = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    os.makedirs(out_dir, exist_ok=True)
    result = {}
    for kind in KINDS:
        wp, ap = os.path.join(web_dir, f'{kind}.pdf'), os.path.join(app_dir, f'{kind}.pdf')
        have = [os.path.exists(wp), os.path.exists(ap)]
        if not any(have):
            continue
        if not all(have):
            result[kind] = {'problem': f'made only by the {"website" if have[0] else "app"}'}
            continue
        web, app = doc_numbers(wp), doc_numbers(ap)
        r = compare_docs(web, app)
        if 'problem' not in r:
            wf, wz = rasters(wp, os.path.join(web_dir, f'{kind}.bare.pdf'), out_dir, f'{kind}-web', dpi)
            af, az = rasters(ap, os.path.join(app_dir, f'{kind}.bare.pdf'), out_dir, f'{kind}-app', dpi)
            r['rasters'] = [{'web': w, 'app': a, 'zones': merge(zw + za)} for w, a, zw, za in zip(wf, af, wz, az)]
        result[kind] = r
    print(json.dumps(result))


if __name__ == '__main__':
    main()
