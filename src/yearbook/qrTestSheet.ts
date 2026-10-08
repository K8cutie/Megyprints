/* ── The QR test sheet (build plan Phase 0) ──────────────────────────────────
   One page to print on the owner's press and scan with a few phones (a
   budget Android, an older and a newer iPhone). It decides the smallest QR
   badge that always scans, which sets how many portraits a page can take.
   Rows: badge sizes. Columns: today's link vs a short domain, at the two
   error-correction levels. The links are examples; they only need to SCAN. */
import { TRIM, liveArea } from './geometry';
import type { El, YbPage } from './layout';
import { qrModuleMm } from './qr';

export const TEST_SIZES = [0.4, 0.44, 0.5, 0.55, 0.6, 0.8];
const LINKS = [
  { label: 'Today’s link', text: 'HTTPS://MEGYPRINTS.VERCEL.APP/Y/AB2CD3EF' },
  { label: 'Short domain', text: 'HTTPS://MGY.PH/Y/AB2CD3EF' },
];
const LEVELS = ['M', 'Q'] as const;

export function qrTestSheet(): YbPage {
  const L = liveArea(1);
  const els: El[] = [
    { kind: 'text', lines: ['MEGYearbooks · QR scan test'], x: L.x0, y: L.y0, w: L.x1 - L.x0, pt: 16, font: 'display', weight: 600, align: 'left', color: '#1d1f22' },
    { kind: 'text', lines: ['Print at 100% on the yearbook paper. Scan each code with 3–5 phones from about 20 cm.', 'Circle the smallest code that every phone reads on the first try. The links are examples and don’t open yet.'], x: L.x0, y: L.y0 + 0.35, w: L.x1 - L.x0, pt: 8.5, font: 'body', weight: 400, align: 'left', color: '#5b6168' },
  ];
  const cols = LINKS.length * LEVELS.length;
  const colW = (L.x1 - L.x0 - 0.9) / cols;
  const top = L.y0 + 0.95;
  LINKS.forEach((link, li) => LEVELS.forEach((ec, ei) => {
    const c = li * LEVELS.length + ei;
    els.push({ kind: 'text', lines: [link.label, `Level ${ec}`], x: L.x0 + 0.9 + c * colW, y: top, w: colW, pt: 8, font: 'body', weight: 600, align: 'center', color: '#1d1f22' });
  }));
  let y = top + 0.45;
  for (const size of TEST_SIZES) {
    els.push({ kind: 'text', lines: [`${size.toFixed(2)} in`], x: L.x0, y: y + size / 2 - 0.06, w: 0.8, pt: 9, font: 'body', weight: 600, align: 'left', color: '#1d1f22' });
    LINKS.forEach((link, li) => LEVELS.forEach((ec, ei) => {
      const c = li * LEVELS.length + ei;
      const cx = L.x0 + 0.9 + c * colW + colW / 2;
      els.push({ kind: 'qr', data: link.text, x: cx - size / 2, y, size, ec });
      const m = qrModuleMm(link.text, size, ec);
      els.push({ kind: 'text', lines: [`${m.mm.toFixed(2)} mm squares`], x: L.x0 + 0.9 + c * colW, y: y + size + 0.04, w: colW, pt: 6.5, font: 'body', weight: 400, align: 'center', color: '#5b6168' });
    }));
    y += size + 0.38;
  }
  els.push({ kind: 'text', lines: ['Smallest code that always scanned: ________ in    Phones used: ______________________'], x: L.x0, y: Math.min(y + 0.1, TRIM.h - 1.0), w: L.x1 - L.x0, pt: 9, font: 'body', weight: 500, align: 'left', color: '#1d1f22' });
  return { number: 1, sectionId: 'qr-test', kind: 'list', elements: els };
}
