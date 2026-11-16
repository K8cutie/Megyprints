/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTO CHECK'S CARD on the Photos step (2.1.2): the website's
   PhotoCheckCard, its words ("Suggest, one tap": owner, 2026-10-04). One tap
   leaves the blurry shots and repeats out, one keeps them all, a tap on one
   photo keeps that one; left-out photos can be brought back.

   Also here: what goes with a photo into the album builder (its check and
   "keep it"), and the cover's photos, best first without jumping.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { checkCopySize, checkFrom, type PhotoCheck } from '@web/lib/photoCheck';
import { keptToCarry, steadyCoverRow } from '../src/builder/albumFlow';
import { createPhotoIntake, toPickedPhoto } from '../src/builder/appPhotos';
import { PhotoCheckCard, SHOW_MAX } from '../src/components/PhotoCheckCard';
import type { DraftCheckView } from '../src/lib/draftPhotoCheck';
import { createPhoneChecks, type PhoneCheckDevice } from '../src/lib/phonePhotoCheck';
import * as W from '../src/lib/photoCheckWords';
import { photoKey, type DraftPhoto } from '../src/lib/photoDraft';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
const photo = (n: number, over: Partial<DraftPhoto> = {}): DraftPhoto => {
  const uri = `content://media/external/images/media/${n}`;
  return { key: photoKey('gallery', uri), source: 'gallery', uri, name: `IMG_${n}.jpg`, width: 4000, height: 3000, capturedAt: n * 600_000, modifiedAt: 0, addedAt: 1, ...over };
};
const key = (n: number) => `media:${n}`;
const CHECK: PhotoCheck = checkFrom(900, '0123456789abcdef');
const view = (over: Partial<DraftCheckView> = {}): DraftCheckView => ({
  available: true, ready: true, progress: { done: 3, total: 3 }, suggestion: { blurry: [], repeats: [], keeperOf: {} }, leftOut: 0, keptAny: false, ...over,
});
const photos = [photo(1), photo(2), photo(3)];
const noop = () => {};

describe('the card\'s words are the website\'s (PhotoCheckCard.tsx)', () => {
  const web = read('src/assistant/PhotoCheckCard.tsx');
  it('each line, word for word', () => {
    expect(web).toContain(W.CHECK_RUNNING);
    expect(web).toContain(`✓ ${W.CHECK_CLEAR}`);
    expect(web).toContain('Megy found {parts} shot{flagged.length === 1 ? \'\' : \'s\'}');
    expect(web).toContain("blurry.length ? `${blurry.length} blurry` : ''");
    expect(web).toContain("repeats.length ? `${repeats.length} repeat` : ''");
    expect(web).toContain(W.LEAVE_OUT_ASK);
    expect(web).toContain(`why: '${W.WHY_BLURRY}'`);
    expect(web).toContain(`why: '${W.WHY_REPEAT}'`);
    expect(web).toContain(`>${W.LEAVE_THEM_OUT}</button>`);
    expect(web).toContain(`>${W.KEEP_ALL}</button>`);
    expect(web).toContain("{leftOut} photo{leftOut === 1 ? '' : 's'} left out");
    expect(web).toContain(`>${W.BRING_BACK}</button>`);
  });

  it('"Megy found 2 blurry and 3 repeat shots"; one shot is "shot"', () => {
    expect(W.foundLine(2, 3)).toBe('Megy found 2 blurry and 3 repeat shots');
    expect(W.foundLine(1, 0)).toBe('Megy found 1 blurry shot');
    expect(W.foundLine(0, 4)).toBe('Megy found 4 repeat shots');
    expect(W.leftOutLine(1)).toBe('1 photo left out');
    expect(W.leftOutLine(3)).toBe('3 photos left out');
  });
});

describe('the card', () => {
  it('a phone that cannot check shows nothing', async () => {
    await render(<PhotoCheckCard photos={photos} check={view({ available: false })} onLeaveOut={noop} onKeep={noop} onBringBack={noop} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('while checking: what Megy is doing, with the count and a bar that moves with it', async () => {
    await render(<PhotoCheckCard photos={photos} check={view({ ready: false, progress: { done: 1, total: 4 } })} onLeaveOut={noop} onKeep={noop} onBringBack={noop} />);
    const running = screen.getByTestId('photo-check-running');
    expect(running).toHaveTextContent(`${W.CHECK_RUNNING} 1 of 4`);
    expect(JSON.stringify(screen.toJSON())).toContain('"width":"25%"');
  });

  it('nothing found: says so', async () => {
    await render(<PhotoCheckCard photos={photos} check={view()} onLeaveOut={noop} onKeep={noop} onBringBack={noop} />);
    expect(screen.getByTestId('photo-check-clear')).toHaveTextContent(`✓ ${W.CHECK_CLEAR}`);
  });

  it('blurry shots or repeats the customer kept: the card does not say "all sharp, no repeats" (it says nothing)', async () => {
    await render(<PhotoCheckCard photos={photos} check={view({ keptAny: true })} onLeaveOut={noop} onKeep={noop} onBringBack={noop} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('found some: each with why, "Leave them out" for all of them, "Keep all", a tap on one keeps that one', async () => {
    const onLeaveOut = jest.fn(), onKeep = jest.fn();
    const check = view({ suggestion: { blurry: [key(2)], repeats: [key(3)], keeperOf: { [key(3)]: key(1) } } });
    await render(<PhotoCheckCard photos={photos} check={check} onLeaveOut={onLeaveOut} onKeep={onKeep} onBringBack={noop} />);
    const card = screen.getByTestId('photo-check-suggest');
    expect(card).toHaveTextContent(new RegExp('Megy found 1 blurry and 1 repeat shots'));
    expect(card).toHaveTextContent(new RegExp(W.LEAVE_OUT_ASK.replace('?', '\\?')));
    const thumbs = screen.getAllByTestId('photo-check-thumb');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]).toHaveTextContent(W.WHY_BLURRY);
    expect(thumbs[1]).toHaveTextContent(W.WHY_REPEAT);

    await fireEvent.press(thumbs[1]);
    expect(onKeep).toHaveBeenLastCalledWith([key(3)]);
    await fireEvent.press(screen.getByTestId('photo-check-leave-out'));
    expect(onLeaveOut).toHaveBeenCalledWith([key(2), key(3)]);
    await fireEvent.press(screen.getByTestId('photo-check-keep-all'));
    expect(onKeep).toHaveBeenLastCalledWith([key(2), key(3)]);
  });

  it('its buttons are plain: the Photos step\'s one filled button is the way on', () => {
    const src = read('mobile/src/components/PhotoCheckCard.tsx');
    expect(src).not.toContain("from './Button'");
    expect(src).not.toMatch(/button: \{[^}]*colors\.accent/); // no terracotta-filled button here
    expect(src).toMatch(/button: \{[^}]*backgroundColor: colors\.card/);
  });

  it(`more than ${SHOW_MAX}: the first ${SHOW_MAX} and "+N"; "Leave them out" still leaves every one out`, async () => {
    const many = Array.from({ length: 15 }, (_, i) => photo(i + 1));
    const onLeaveOut = jest.fn();
    await render(<PhotoCheckCard photos={many} check={view({ suggestion: { blurry: many.map((p) => p.key), repeats: [], keeperOf: {} } })} onLeaveOut={onLeaveOut} onKeep={noop} onBringBack={noop} />);
    expect(screen.getAllByTestId('photo-check-thumb')).toHaveLength(SHOW_MAX);
    expect(screen.getByText('+3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('photo-check-leave-out'));
    expect(onLeaveOut.mock.calls[0][0]).toHaveLength(15);
  });

  it('photos left out: how many, and "Bring them back"', async () => {
    const onBringBack = jest.fn();
    await render(<PhotoCheckCard photos={photos} check={view({ leftOut: 2 })} onLeaveOut={noop} onKeep={noop} onBringBack={onBringBack} />);
    expect(screen.getByTestId('photo-check-clear')).toHaveTextContent(/2 photos left out/);
    // "All sharp, no repeats" is not said while some are left out.
    expect(screen.queryByText(new RegExp(W.CHECK_CLEAR))).toBeNull();
    await fireEvent.press(screen.getByTestId('photo-check-bring-back'));
    expect(onBringBack).toHaveBeenCalled();
  });
});

describe('the Photos step', () => {
  const src = read('mobile/src/app/photos.tsx');
  it('runs the check on the picked photos with the app\'s one checker, and shows the card above the photos', () => {
    expect(src).toContain('useDraftPhotoCheck(platform.photoCheck, { draft, peek, setChecks }, platform.rememberCheck, platform.wantPhotoCheck)');
    expect(src).toContain('<PhotoCheckCard photos={draft.photos} check={check} onLeaveOut={leaveOut} onKeep={keep} onBringBack={bringBack} />');
  });
  it('a left-out photo is not in the grid (it is not going into the album)', () => {
    expect(src).toContain('draft.photos.filter((p) => !p.leftOut)');
    expect(src).toContain('data={shown}');
  });
});

describe('what goes with a photo into the album builder', () => {
  it('its check and "keep it" (PhotoIntake.known), so the builder does not check or ask again', () => {
    const picked = toPickedPhoto(photo(1, { check: CHECK, kept: true }));
    expect(picked.check).toEqual(CHECK);
    expect(picked.kept).toBe(true);
    const intake = createPhotoIntake(async () => []);
    expect(intake.known?.(picked)).toEqual({ check: CHECK, kept: true });
    expect(intake.known?.(toPickedPhoto(photo(2)))).toBeUndefined();
    // The shared builder starts the album photo with them.
    const builder = read('src/pages/builder/useBuilderState.ts');
    expect(builder).toContain('...(knownAbout?.(file)?.check ? { check: knownAbout(file)!.check } : {}),');
    expect(builder).toContain('...(knownAbout?.(file)?.kept ? { kept: true } : {}),');
  });

  it('"keep it" said later is carried to the album\'s photo (by its address), once', () => {
    const album = (n: number, over: Partial<UploadedPhoto> = {}): UploadedPhoto => ({
      id: `p${n}`, name: `IMG_${n}.jpg`, previewUrl: photo(n).uri, type: 'image/jpeg', size: 1, width: 4000, height: 3000, ...over,
    });
    const draft = [photo(1, { kept: true }), photo(2), photo(3, { kept: true, leftOut: true }), photo(4, { kept: true })];
    expect(keptToCarry([album(1), album(2), album(3), album(4, { kept: true })], draft)).toEqual(['p1']);
    expect(keptToCarry([album(1, { kept: true })], draft)).toEqual([]);
    expect(keptToCarry([album(1)], [photo(1)])).toEqual([]);
  });

  it('a blur answer the phone already has is not worked out again (remember)', async () => {
    const calls: string[] = [];
    const device: PhoneCheckDevice = {
      canDecode: true, size: async () => ({ width: 4000, height: 3000 }), faces: null,
      pixels: async (uri, w, h) => { calls.push(uri); return new Uint8Array(w * h * 4); },
    };
    const checks = createPhoneChecks(device);
    checks.remember(photo(1).uri, 4000, 3000, { ...CHECK, faces: 2, eyesClosed: true, facesTried: true });
    const stored = { id: 'a', name: 'a.jpg', type: 'image/jpeg', size: 1, width: 4000, height: 3000, url: photo(1).uri };
    const res = await checks.photoCheck.check(stored, 4000, 3000, { faces: false });
    expect(calls).toEqual([]);
    // Only the blur answer is remembered: the faces are looked for by the pass that asks.
    expect(res).toEqual(checkFrom(CHECK.sharp, CHECK.hash));
    expect(checkCopySize(4000, 3000)).toEqual({ w: 800, h: 600 });
    // Another photo is still decoded.
    await checks.photoCheck.check({ ...stored, url: photo(2).uri }, 4000, 3000, { faces: false });
    expect(calls).toEqual([photo(2).uri]);
  });
});

describe('the cover\'s photos: best first, and they stay put', () => {
  const album = (n: number, sharp: number | null, over: Partial<UploadedPhoto> = {}): UploadedPhoto => ({
    id: `p${n}`, name: `IMG_${n}.jpg`, previewUrl: photo(n).uri, type: 'image/jpeg', size: 1, width: 4000, height: 3000,
    ...(sharp === null ? {} : { check: checkFrom(sharp, '0123456789abcdef') }), ...over,
  });

  it('every photo checked: best first, and the line may say so', () => {
    const row = steadyCoverRow(null, [album(1, 100), album(2, 900), album(3, 500)]);
    expect(row.best).toBe(true);
    expect(row.ids).toEqual(['p2', 'p3', 'p1']);
  });

  it('not all checked yet: the album\'s order, and the line does not promise a ranking', () => {
    const row = steadyCoverRow(null, [album(1, 100), album(2, null), album(3, 500)]);
    expect(row.best).toBe(false);
    expect(row.ids).toEqual(['p1', 'p2', 'p3']);
  });

  it('answers that come in while the cover is picked do not move the photos (nothing jumps under a finger)', () => {
    const first = steadyCoverRow(null, [album(1, 100), album(2, 900), album(3, 500)]);
    // The face pass finds shut eyes on the best photo: it would drop to last.
    const later = [album(1, 100), album(2, 900, { check: { ...checkFrom(900, '0123456789abcdef'), faces: 1, eyesClosed: true, facesTried: true } }), album(3, 500)];
    const row = steadyCoverRow(first, later);
    expect(row.ids).toEqual(first.ids);
    expect(row.photos[0]).toBe(later[1]); // today's photo object, in the order shown
    // A new visit (no order shown yet) takes the order again.
    expect(steadyCoverRow(null, later).ids).toEqual(['p3', 'p2', 'p1']);
  });

  it('the photos themselves change (one added, one left out): the order is taken again', () => {
    const first = steadyCoverRow(null, [album(1, 100), album(2, 900)]);
    expect(steadyCoverRow(first, [album(1, 100), album(2, 900), album(3, 1500)]).ids).toEqual(['p3', 'p2', 'p1']);
    expect(steadyCoverRow(first, [album(1, 100), album(2, 900, { leftOut: true })]).ids).toEqual(['p1']);
  });

  it('a photo missing on this phone (no picture) is not offered', () => {
    expect(steadyCoverRow(null, [album(1, 100), album(2, 900, { previewUrl: '' })]).ids).toEqual(['p1']);
  });
});
