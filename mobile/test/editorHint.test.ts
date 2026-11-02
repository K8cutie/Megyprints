/* ══════════════════════════════════════════════════════════════════════════
   HINTS UNDER THE PAGE in "Edit pages" (src/editor/editorHint.ts; owner's
   phone test: the empty space between the page and the page numbers "is a
   usable space that we can show hints"):
     • nothing picked: what the page can do (an empty box, a QR, a photo,
       words, the first that fits) and how to turn the page, on real pages;
     • a photo picked: it moves and zooms with a finger;
     • the screen shows them in that space.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { HINTS, pageHint, pickedHint } from '../src/editor/editorHint';
import { pageTargets, type Target } from '../src/editor/hitTest';
import { act, builder, madeAlbum, useEditorBench } from './editorHarness';

useEditorBench();

const targetsOf = (i: number): Target[] => {
  const b = builder();
  return pageTargets({ page: b.albumPages[i], albumSize: b.albumSize, pageIndex: i, photoCount: b.uploadedPhotos.length }).targets;
};

describe('nothing picked: what the page can do, then how to turn it', () => {
  it('the first that fits: an empty frame, an empty caption box, a QR, a photo, words', () => {
    const t = (...kinds: Target['kind'][]) => kinds.map((kind) => ({ kind }));
    expect(pageHint(t('photo', 'emptySlot', 'emptyBox'))).toBe(`${HINTS.emptyFrame} ${HINTS.turn}`);
    expect(pageHint(t('photo', 'emptyBox'))).toBe(`${HINTS.emptyBox} ${HINTS.turn}`);
    expect(pageHint(t('photo', 'slotQr'))).toBe(`${HINTS.qr} ${HINTS.turn}`);
    expect(pageHint(t('photo', 'boxText'))).toBe(`${HINTS.photo} ${HINTS.turn}`);
    expect(pageHint(t('freeText'))).toBe(`${HINTS.words} ${HINTS.turn}`);
    expect(pageHint([])).toBe(HINTS.turn);
  });

  it('on a real album: every page gets a hint that fits what is on it', async () => {
    await madeAlbum(SCENARIOS[0]);
    const pages = builder().albumPages;
    let photoPages = 0;
    for (let i = 0; i < pages.length; i++) {
      const targets = targetsOf(i);
      const hint = pageHint(targets);
      expect(hint.endsWith(HINTS.turn)).toBe(true);
      if (targets.some((x) => x.kind === 'emptySlot')) expect(hint.startsWith(HINTS.emptyFrame)).toBe(true);
      else if (targets.some((x) => x.kind === 'emptyBox')) expect(hint.startsWith(HINTS.emptyBox)).toBe(true);
      else if (targets.some((x) => x.kind === 'photo')) { expect(hint.startsWith(HINTS.photo)).toBe(true); photoPages++; }
    }
    expect(photoPages).toBeGreaterThan(0);
  });

  it('a video memory\'s page says how to change its QR', async () => {
    await madeAlbum(SCENARIOS[0]);
    const pages = builder().albumPages;
    for (let i = 0; i < pages.length; i++) {
      await act(async () => { builder().goToPage(i); });
      if (!builder().canAddMemoryQr) continue;
      await act(async () => { await builder().applyMemoryQr({ code: 'abcd2345', destination: 'https://x/abcd2345.mp4', qrPngDataUrl: 'data:image/png;base64,QR', memoryUrl: 'https://megyprints.vercel.app/m/abcd2345', createdAt: 1, kind: 'clip' } as never, 'br'); });
      expect(pageHint(targetsOf(i))).toBe(`${HINTS.qr} ${HINTS.turn}`);
      return;
    }
    throw new Error('no single-photo page');
  });
});

describe('a photo picked', () => {
  it('it moves and zooms with a finger; nothing else picked says anything there', () => {
    expect(pickedHint({ kind: 'photo' })).toBe('Drag the photo to move it in its frame. Pinch to zoom.');
    for (const kind of ['emptySlot', 'boxText', 'slotQr'] as const) expect(pickedHint({ kind })).toBe('');
    expect(pickedHint(null)).toBe('');
  });
});

describe('the screen shows them in the empty space', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/editor/EditPagesScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  it('the hint in the picked thing\'s button row when nothing is picked; the photo hint under the page', () => {
    expect(src).toContain('{actions.length > 0 ? (');
    expect(src).toContain('<Text style={styles.hint} numberOfLines={2} testID="edit-hint">{pageHint(targets)}</Text>');
    expect(src).toContain('<Text style={styles.notDrawn} numberOfLines={2} testID="edit-picked-hint">{pickedHint(selected)}</Text>');
    // A page the app can't draw exactly still says so first.
    expect(src).toContain('<Text style={styles.notDrawn} numberOfLines={2} testID="edit-not-drawn">{NOT_DRAWN_LINE}</Text>');
  });
});
