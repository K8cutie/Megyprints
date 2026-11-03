/* ══════════════════════════════════════════════════════════════════════════
   HINTS UNDER THE PAGE in "Edit pages" (src/editor/editorHint.ts; owner's
   phone test: the empty space between the page and the page numbers "is a
   usable space that we can show hints"):
     • nothing picked: the guide, "Select a photo to edit." (owner, with the
       new layout), or what a page with no photo can do, on real pages;
     • a photo picked: it moves and zooms with a finger;
     • the screen shows them in that space.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { HINTS, pageHint, pickedHint } from '../src/editor/editorHint';
import { pageTargets, type Target } from '../src/editor/hitTest';
import { builder, madeAlbum, useEditorBench } from './editorHarness';

useEditorBench();

const targetsOf = (i: number): Target[] => {
  const b = builder();
  return pageTargets({ page: b.albumPages[i], albumSize: b.albumSize, pageIndex: i, photoCount: b.uploadedPhotos.length }).targets;
};

describe('nothing picked: the guide', () => {
  it('"Select a photo to edit." on a page with a photo; else what the page can do', () => {
    const t = (...kinds: Target['kind'][]) => kinds.map((kind) => ({ kind }));
    expect(HINTS.selectPhoto).toBe('Select a photo to edit.');
    expect(pageHint(t('photo', 'emptySlot', 'emptyBox'))).toBe(HINTS.selectPhoto);
    expect(pageHint(t('photo', 'slotQr'))).toBe(HINTS.selectPhoto);
    expect(pageHint(t('emptySlot', 'emptyBox'))).toBe(HINTS.emptyFrame);
    expect(pageHint(t('emptyBox', 'boxText'))).toBe(HINTS.emptyBox);
    expect(pageHint(t('freeText'))).toBe(HINTS.words);
    expect(pageHint([])).toBe('');
  });

  it('on a real album: every page with a photo says "Select a photo to edit."', async () => {
    await madeAlbum(SCENARIOS[0]);
    const pages = builder().albumPages;
    let photoPages = 0;
    for (let i = 0; i < pages.length; i++) {
      const targets = targetsOf(i);
      if (targets.some((x) => x.kind === 'photo')) { expect(pageHint(targets)).toBe(HINTS.selectPhoto); photoPages++; }
    }
    expect(photoPages).toBeGreaterThan(0);
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
