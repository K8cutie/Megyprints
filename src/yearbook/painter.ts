/* ── One painter for screen and print ────────────────────────────────────────
   Draws a laid-out page onto a canvas at any resolution: small for the
   on-screen preview, 300 dpi for the print file. Because both come from the
   same function and the same inch-based page, what the adviser sees is what
   the press prints. QR codes are drawn module by module (sharp squares, never
   a scaled image), snapped to whole pixels with a 4-module quiet zone. */
import QRCode from 'qrcode';
import { BLEED, TRIM } from './geometry';
import type { El, FontRole, Measure, YbPage } from './layout';

export const FONTS: Record<FontRole, string> = {
  display: '"Playfair Display", Georgia, serif',
  body: '"DM Sans", "Segoe UI", Arial, sans-serif',
};

export type PhotoSource = (photoId: string) => CanvasImageSource | null;

export interface PaintOpts {
  /** Pixels per inch. */
  ppi: number;
  /** Include the 0.125 in bleed around the trim (print files). */
  bleed: boolean;
  photo: PhotoSource;
  /** Faint guides: spine keep-out band (screen only). */
  guides?: boolean;
  /** Highlight elements of one person (screen only). */
  highlightPersonId?: string;
}

const qrCache = new Map<string, { size: number; data: Uint8Array }>();

/** QR modules for a string. Uppercase links use the compact alphanumeric mode. */
export function qrModules(text: string, ec: 'L' | 'M' | 'Q' | 'H' = 'M'): { size: number; get: (r: number, c: number) => boolean } {
  const key = `${ec}|${text}`;
  let m = qrCache.get(key);
  if (!m) {
    const q = QRCode.create(text, { errorCorrectionLevel: ec });
    m = { size: q.modules.size, data: q.modules.data as unknown as Uint8Array };
    qrCache.set(key, m);
  }
  const { size, data } = m;
  return { size, get: (r, c) => !!data[r * size + c] };
}

export function canvasMeasure(): Measure {
  const c = document.createElement('canvas').getContext('2d')!;
  return (text, pt, font, weight) => {
    c.font = `${weight} ${pt * 10}px ${FONTS[font]}`; // measure at 10× for precision
    return c.measureText(text).width / 10 / 72;
  };
}

function drawQr(ctx: CanvasRenderingContext2D, el: Extract<El, { kind: 'qr' }>, ppi: number, ox: number, oy: number) {
  const q = qrModules(el.data, el.ec ?? 'M');
  const quiet = 4;
  const total = q.size + quiet * 2;
  // Whole pixels per module, the badge snapped around it.
  const side = Math.round(el.size * ppi);
  const mod = Math.max(1, Math.floor(side / total));
  const used = mod * total;
  const x0 = Math.round(ox + el.x * ppi + (side - used) / 2), y0 = Math.round(oy + el.y * ppi + (side - used) / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(Math.round(ox + el.x * ppi), Math.round(oy + el.y * ppi), side, side);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < q.size; r++) {
    for (let c = 0; c < q.size; c++) {
      if (q.get(r, c)) ctx.fillRect(x0 + (c + quiet) * mod, y0 + (r + quiet) * mod, mod, mod);
    }
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: Extract<El, { kind: 'text' }>, ppi: number, ox: number, oy: number) {
  const px = (el.pt / 72) * ppi;
  ctx.font = `${el.italic ? 'italic ' : ''}${el.weight} ${px}px ${FONTS[el.font]}`;
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = el.align;
  const lh = (el.lineGap ?? (el.pt / 72) * 1.25) * ppi;
  const x = ox + (el.align === 'left' ? el.x : el.align === 'right' ? el.x + el.w : el.x + el.w / 2) * ppi;
  el.lines.forEach((line, i) => ctx.fillText(line, x, oy + el.y * ppi + i * lh, el.w * ppi + 1));
}

export function paintPage(canvas: HTMLCanvasElement, page: YbPage, opts: PaintOpts): void {
  const { ppi } = opts;
  const pad = opts.bleed ? BLEED : 0;
  const wIn = TRIM.w + pad * 2, hIn = TRIM.h + pad * 2;
  canvas.width = Math.round(wIn * ppi);
  canvas.height = Math.round(hIn * ppi);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = pad * ppi, oy = pad * ppi;

  if (opts.guides) {
    const recto = page.number % 2 === 1;
    ctx.fillStyle = 'rgba(47,127,193,0.07)';
    ctx.fillRect(recto ? ox : ox + (TRIM.w - 0.5) * ppi, oy, 0.5 * ppi, TRIM.h * ppi);
  }

  for (const el of page.elements) {
    if (el.kind === 'rect') {
      ctx.fillStyle = el.fill;
      ctx.fillRect(ox + el.x * ppi, oy + el.y * ppi, el.w * ppi, el.h * ppi);
    } else if (el.kind === 'photo') {
      const img = opts.photo(el.photoId);
      const dx = ox + el.x * ppi, dy = oy + el.y * ppi, dw = el.w * ppi, dh = el.h * ppi;
      if (img) ctx.drawImage(img, el.crop.x, el.crop.y, el.crop.w, el.crop.h, dx, dy, dw, dh);
      else { ctx.fillStyle = '#e6e9ee'; ctx.fillRect(dx, dy, dw, dh); }
      if (opts.highlightPersonId && el.personId === opts.highlightPersonId) {
        ctx.strokeStyle = '#B85C38';
        ctx.lineWidth = Math.max(2, ppi * 0.03);
        ctx.strokeRect(dx - ctx.lineWidth / 2, dy - ctx.lineWidth / 2, dw + ctx.lineWidth, dh + ctx.lineWidth);
      }
    } else if (el.kind === 'text') {
      drawText(ctx, el, ppi, ox, oy);
    } else if (el.kind === 'qr') {
      drawQr(ctx, el, ppi, ox, oy);
    }
  }
}

/** Make sure the page fonts are ready before measuring or painting. */
export async function loadPageFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`600 20px ${FONTS.display}`),
    document.fonts.load(`400 20px ${FONTS.body}`),
    document.fonts.load(`600 20px ${FONTS.body}`),
    document.fonts.load(`italic 400 20px ${FONTS.body}`),
  ]).catch(() => undefined);
}
