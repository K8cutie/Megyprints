/* ── What a printed yearbook QR says ─────────────────────────────────────────
   Every code opens `<site>/Y/<CODE>`. It is written in CAPITALS on purpose:
   QR codes store capital letters, digits and ":/." in a compact mode, so the
   same link needs fewer, bigger squares — which matters on a 0.5 in badge.
   The yearbook video page (/y/:code) arrives with the upload portal; it must
   accept the capitalised path. Until the owner buys a short domain the site
   part is MEMORY_BASE (see qrMemory.ts and the build plan, §2.5). */
import QRCode from 'qrcode';
import { MEMORY_BASE, mintCode } from '../lib/qrMemory';

export const yearbookQrData = (code: string, base = MEMORY_BASE): string => `${base.toUpperCase()}/Y/${code.toUpperCase()}`;

export const newMemoryCode = (): string => mintCode(8);

/** Size of one printed QR square in millimetres, for a badge of `badgeIn`
 *  inches that includes the 4-square quiet zone on every side. */
export function qrModuleMm(text: string, badgeIn: number, ec: 'L' | 'M' | 'Q' | 'H' = 'M'): { version: number; modules: number; mm: number } {
  const q = QRCode.create(text, { errorCorrectionLevel: ec });
  const total = q.modules.size + 8;
  return { version: q.version, modules: q.modules.size, mm: (badgeIn * 25.4) / total };
}
