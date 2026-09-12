import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { QR_INVITATION_LABEL, QR_INVITATION_IMAGE, qrInvitationLayout } from './qrInvitation';

/* The dealt-'qr' box invitation (owner, 2026-09-12): "Add a VIDEO to this QR"
   then a QR image, identical on the DOM and canvas renderers. */
describe('video-QR invitation', () => {
  it('says exactly what the owner asked for, with a PNG placeholder', () => {
    expect(QR_INVITATION_LABEL).toBe('Add a VIDEO to this QR');
    expect(QR_INVITATION_IMAGE.startsWith('data:image/png;base64,')).toBe(true);
    expect(QR_INVITATION_IMAGE.length).toBeLessThan(4000);
  });
  it('both renderers draw from the one module (no drifting literals)', () => {
    for (const f of ['src/pages/builder/BuilderPreview.tsx', 'src/pages/builder/useCanvasEngine.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('QR_INVITATION_LABEL');
      expect(src, f).toContain('QR_INVITATION_IMAGE');
      expect(src, f).not.toMatch(/Add a video (link|of this moment)/);
    }
  });
  it('layout: label on top, a QR of at least 24 px when the box has room, none when it has not', () => {
    const band = qrInvitationLayout(440, 470, 12, 28);   // the owner's screenshot: a big square box
    expect(band.qrSide).toBeGreaterThanOrEqual(120);
    expect(band.labelH + band.gap + band.qrSide).toBeLessThanOrEqual(470 - 24);
    const tall = qrInvitationLayout(110, 400, 12, 28);   // a tall narrow side band
    expect(tall.qrSide).toBeGreaterThanOrEqual(40);
    expect(tall.qrSide).toBeLessThanOrEqual(110 * 0.8);
    const wide = qrInvitationLayout(400, 90, 12, 28);    // a low strip: label only
    expect(wide.qrSide).toBe(0);
    const tiny = qrInvitationLayout(60, 60, 12, 28);
    expect(tiny.qrSide).toBe(0);
  });
});
