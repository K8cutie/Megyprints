/* ══════════════════════════════════════════════════════════════════════════
   THE VIDEO-QR INVITATION — what a combo box Megy dealt as 'qr' shows while
   it is still empty. Owner (2026-09-12): "Add a VIDEO to this QR", then a QR
   image. ONE source for BOTH renderers (BuilderPreview's DOM box and
   useCanvasEngine's Fabric box) so the two can never drift again.
   Invitations are editor-only: an unused one prints as paper.
   ══════════════════════════════════════════════════════════════════════════ */

export const QR_INVITATION_LABEL = 'Add a VIDEO to this QR';

/** A small placeholder QR drawn in the invitation's ink colour on a transparent
 *  ground (it encodes the memory resolver's home; it is never printed). */
export const QR_INVITATION_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAAklEQVR4AewaftIAAARnSURBVO3BwY1sSwpAwUOq/MEb1pjGGm+wiNmiXmTrqup15R9lhIRp84c8S9gI0+YNniVshGkzeJawEabNH1pcR1lcR1lcR3nxg2cJHxSmzUaYNoNnCRth2gyeJQxh2gyeJWyEaTN4lrDhWcIHhWkzLK6jLK6jLK6jvPhFmDYPeJbwh8K0GTxLGMK0GTxL+KAwbR7wLGFjcR1lcR1lcR3lxZd5lrARps0bPEsYwrTZ8CzhixbXURbXURbXUV58WZg2G54lDGHaDJ4lbIRp8x+yuI6yuI6yuI7y4heeJXxRmDaDZwkPeJYwhGkzeJbwBs8SPmhxHWVxHWVxHeXFD2HafJFnCUOYNhth2gyeJQxh2gyeJQxh2gyeJWyEafMPLa6jLK6jLK6jCF8Wps2GZwlDmDaDZwn/RxbXURbXURbXUV5h2mx4ljCEaTN4lrARps2GZwkbYdo8EKbNGzxLGMK0ecCzhCFMmw3PEobFdZTFdZTFdRQJ02bwLOGBMG0GzxI2wrTZ8CzhgTBtHvAsYQjT5gHPEj4oTJthcR1lcR1lcR3lxQ9h2mx4lrARps0DniUMYdpseJYweJbwRWHaDJ4lbIRps7G4jrK4jrK4jiJh2gyeJQxh2jzgWcIDYdoMniW8IUybBzxLGMK0GTxL+EOL6yiL6yiL6ygSps2GZwlDmDaDZwlDmDYbniUMYdoMniU8EKbNhmcJQ5g2b/AsYSNMm8GzhCFMm43FdZTFdZTFdRThF2HabHiWMIRpM3iWMIRpM3iWsBGmzeBZwhCmzeBZwhvCtHnAs4QhTJsNzxKGMG2GxXWUxXWUxXUUCdNm8Czhg8K0GTxLGMK02fAsYQjTZsOzhCFMm8GzhCFMm8GzhCFMmwc8SxjCtBk8SxjCtBkW11EW11EW11GEH8K0GTxLGMK0GTxLGMK0GTxLGMK0GTxL2AjTZvAsYQjT5gHPEh4I02bwLGEI02bwLGEjTJvBs4RhcR1lcR1lcR1FwrR5wLOEB8K02fAsYQjT5g2eJTwQps0f8ixhY3EdZXEdZXEdRfiyMG3e4FnCEKbN4FnCRpg2g2cJD4Rps+FZwkaYNsPiOsriOsriOsorTJs/5FnCGzxLGMK02QjT5g1h2gyeJbwhTJuNxXWUxXWUxXUUCdNm8Czhg8K0GTxL2AjT5g2eJTwQps3gWcIDYdo84FnCEKbNsLiOsriOsriO8uIXYdo84FnCB3mWsBGmzRCmzYZnCRth2nyQZwkbniUMi+soi+soi+soL74sTJt/yLOEIUybwbOEB8K0eSBMm8GzhI3FdZTFdZTFdZQXX+ZZwhCmzRCmzeBZwuBZwkaYNoNnCRth2gyeJTzgWcIQps1GmDbD4jrK4jrK4jrKi194lvAPhWmz4VnCRpg2G54lbIRpM3iWMIRpM3iWsBGmzeBZwoZnCcPiOsriOsriOsqLH8K0+SLPEoYwbQbPEt4Qps1GmDYbYdoMniUMniVshGmzsbiOsriOsriO8j/kM/wt4rEE0wAAAABJRU5ErkJggg==';

/** The invitation's ink colour (matches the dashed box). */
export const QR_INVITATION_INK = '#A0562F';

/** Lay the invitation out inside a box of `w`×`h` px with `pad` px of
 *  breathing room: the label on top (wrapped, font capped so the longest
 *  word fits), the QR under it as large as the remaining height allows.
 *  `qrSide` is 0 when there is no room for a QR worth showing — the
 *  renderers then fall back to the label alone (or the "+" bubble). */
export function qrInvitationLayout(w: number, h: number, pad: number, maxFont: number): { fontSize: number; labelH: number; qrSide: number; gap: number } {
  const innerW = Math.max(0, w - pad * 2);
  const innerH = Math.max(0, h - pad * 2);
  const longestWord = QR_INVITATION_LABEL.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '');
  const fontSize = Math.max(0, Math.min(maxFont, innerW / (longestWord.length * 0.72)));
  // Lines the label needs at this font (bold ≈ 0.55em per glyph), capped at 3.
  const perLine = Math.max(1, Math.floor(innerW / (fontSize * 0.55)));
  const lines = Math.min(3, Math.max(1, Math.ceil(QR_INVITATION_LABEL.length / perLine)));
  const labelH = fontSize * 1.2 * lines;
  const gap = Math.round(Math.max(4, fontSize * 0.4));
  const qrSide = Math.floor(Math.min(innerW * 0.8, innerH - labelH - gap));
  return { fontSize, labelH, gap, qrSide: qrSide >= 24 ? qrSide : 0 };
}
