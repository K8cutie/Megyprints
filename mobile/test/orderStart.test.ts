/* ══════════════════════════════════════════════════════════════════════════
   FROM THE ALBUM TO CHECKOUT (Phase 5, step 2: src/lib/checkout/orderStart.ts).

   The website's way (BuilderPreview handleOrder, Builder handleOrder,
   lib/orderAlbum), on the phone:
     • "Order this album" runs the website's checks first, in the website's
       order: fewer than 40 photos stops it; photos this phone doesn't have
       stop it (a paid print of empty frames can't be taken back); a blank
       cover, a cover title cut off, empty frames or boxes, placeholder words,
       blank pages, words too long for their box and photos put back from
       copies are said once, with "Order anyway";
     • signed in, the album is saved to the account first and checkout waits
       for it; a failed save says why, in the website's words;
     • checkout reads the album back from the account, by its id, as the
       website's selectOrderAlbum does (the WEBSITE's function runs beside
       the app's here, on a stand-in database), and orders that copy.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { AlbumPage } from '@web/pages/builder/types';
import { albumPhotoCount, tooFewToOrderMessage } from '@web/pages/builder/albumMinimum';
import { BLANK_COVER_MESSAGE, checkOrderReadiness, PLACEHOLDER_TEXT, readinessMessage } from '@web/pages/builder/orderReadiness';
import { missingPhotos } from '@web/lib/photoPresence';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { missingOnPhoneMessage } from '../src/builder/screenWords';
import { checkoutAlbumFrom, loadOrderAlbumRow, orderCheck, orderSaveError, ORDER_SAVE_CONFLICT, ORDER_SAVE_FAILED } from '../src/lib/checkout/orderStart';
import { builder, madeAlbum, useEditorBench } from './editorHarness';
import { fake, fakeClient, rec, resetFake } from './helpers/fakeSupabase';

jest.mock('@web/lib/supabase', () => jest.requireActual('./helpers/fakeSupabase').supabaseModule);

/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const webOrderAlbum = require('@web/lib/orderAlbum') as {
  selectOrderAlbum: <R>(client: unknown, o: { userId: string; albumId?: string; columns: string }) => Promise<R | null>;
};

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

useEditorBench();
beforeEach(resetFake);

const state = () => {
  const b = builder();
  return { pages: b.albumPages, photos: b.uploadedPhotos, coverFront: b.coverFront, albumSize: b.albumSize, measurer: null };
};

describe('"Order this album": the website\'s checks, in its order', () => {
  it('fewer than 40 photos on the pages: stopped, with the website\'s words', async () => {
    await madeAlbum(SCENARIOS[0]);
    const s = state();
    // Photos taken off pages until 39 are left.
    let have = albumPhotoCount(s.pages);
    const pages: AlbumPage[] = s.pages.map((p) => ({ ...p, slotFills: [...(p.slotFills ?? [])] }));
    for (const p of pages) {
      for (let i = 0; i < (p.slotFills ?? []).length && have > 39; i++) {
        if (typeof p.slotFills![i] === 'number') { p.slotFills![i] = null as unknown as number; have = albumPhotoCount(pages); }
      }
    }
    expect(albumPhotoCount(pages)).toBe(39);
    expect(orderCheck({ ...s, pages })).toEqual({ kind: 'tooFew', have: 39, message: tooFewToOrderMessage(39) });
    // "Order anyway" never gets past it.
    expect(orderCheck({ ...s, pages }, { anyway: true }).kind).toBe('tooFew');
  });

  it('a photo this phone no longer has: stopped, the pages named (no "Order anyway")', async () => {
    await madeAlbum(SCENARIOS[0]);
    const s = state();
    const used = s.pages.flatMap((p) => p.slotFills ?? []).find((f): f is number => typeof f === 'number')!;
    const photos = s.photos.map((p, i) => (i === used ? { ...p, previewUrl: '' } : p));
    const r = orderCheck({ ...s, photos });
    expect(r).toEqual({ kind: 'missing', message: missingOnPhoneMessage(missingPhotos(s.pages, photos, s.coverFront)) });
    expect(orderCheck({ ...s, photos }, { anyway: true }).kind).toBe('missing');
  });

  it('a blank cover and placeholder words: said once, in the website\'s order; "Order anyway" goes on', async () => {
    await madeAlbum(SCENARIOS[0]);
    const s = state();
    const blankCover: AlbumPage = {
      ...s.coverFront, slotFills: [], textSlotFills: [], textElements: [], photos: [], stickers: [], ornamentFills: [],
      background: { type: 'solid', solid: '#FFFFFF' },
    };
    const pages = s.pages.map((p, i) => (i === 2 ? {
      ...p,
      textElements: [...(p.textElements ?? []), {
        id: 'ph', text: PLACEHOLDER_TEXT, x: 0.5, y: 0.5, rotation: 0, opacity: 100, fontSize: 24, fontFamily: 'Georgia, serif',
        color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center' as const,
      }],
    } : p));
    const r = orderCheck({ ...s, pages, coverFront: blankCover });
    const expected = [BLANK_COVER_MESSAGE, readinessMessage(checkOrderReadiness(pages))].filter(Boolean).join(' ');
    expect(r.kind).toBe('warn');
    if (r.kind !== 'warn') return;
    expect(r.message).toBe(expected);
    // "Show me" opens the cover first (the website's order).
    expect(r.coverFirst).toBe(true);
    expect(orderCheck({ ...s, pages, coverFront: blankCover }, { anyway: true })).toEqual({ kind: 'go' });
  });

  it('nothing to say: straight on', async () => {
    await madeAlbum(SCENARIOS[0]);
    const s = state();
    const r = orderCheck(s);
    // An album made by the app may hold an empty caption box: then it is said, else it goes.
    const ready = readinessMessage(checkOrderReadiness(s.pages));
    expect(r).toEqual(ready ? expect.objectContaining({ kind: 'warn', message: ready }) : { kind: 'go' });
  });

  it('the same checks, in the same order, as the website\'s Order button (BuilderPreview.tsx)', () => {
    const web = read('src/pages/builder/BuilderPreview.tsx');
    expect(web).toContain('if (photosShortBy(have) > 0) { setTooFew(have); return; }');
    expect(web).toContain('const gone = missingPhotos(pages, photos, coverFront);');
    expect(web).toContain("const warning = [coverIsBlank(coverFront) ? BLANK_COVER_MESSAGE : '', titleCut ? COVER_TITLE_TOO_LONG_MESSAGE : '', readinessMessage(ready), longTextsMessage(long.length), copies ? `${copies}.` : ''].filter(Boolean).join(' ');");
    expect(read('src/pages/builder/PreviewTurnBar.tsx')).toContain('Order this album');
  });
});

describe('saving the album on the way (Builder.tsx handleOrder)', () => {
  it('the website\'s words when the save fails', () => {
    const web = read('src/pages/Builder.tsx');
    // The app's note is under the book, the website's at the top of the page.
    expect(ORDER_SAVE_CONFLICT).toContain('(the note below)');
    expect(web).toContain(ORDER_SAVE_CONFLICT.replace('(the note below)', '(the note at the top)'));
    expect(web).toContain(ORDER_SAVE_FAILED);
    expect(orderSaveError(true)).toBe(ORDER_SAVE_CONFLICT);
    expect(orderSaveError(false)).toBe(ORDER_SAVE_FAILED);
  });
});

describe('checkout reads the album back from the account (lib/orderAlbum selectOrderAlbum)', () => {
  const row = { id: 'album-7', user_id: 'user-1', title: 'Our Boracay Trip', album_type: 'standard', album_size: '6x8', selected_template: 'classic', photos_per_page: null, pages: [], photos: [], cover_photo: null, cover_front: null };

  it('the same row, read the same way, as the website', async () => {
    fake.albumRow = row;
    const app = await loadOrderAlbumRow(fakeClient as never, 'user-1', 'album-7');
    const appReads = rec.reads.splice(0);
    const web = await webOrderAlbum.selectOrderAlbum(fakeClient, { userId: 'user-1', albumId: 'album-7', columns: '*' });
    expect(app).toEqual(web);
    expect(appReads).toEqual(rec.reads);
    expect(appReads[0]).toEqual({ table: 'albums', columns: '*', filters: { user_id: 'user-1', id: 'album-7' } });
  });

  it('not in the account: the website\'s message, never another album', async () => {
    fake.albumRow = null;
    let webMessage = '';
    await webOrderAlbum.selectOrderAlbum(fakeClient, { userId: 'user-1', albumId: 'album-7', columns: '*' }).catch((e: Error) => { webMessage = e.message; });
    expect(webMessage).toMatch(/isn't saved to your account/);
    await expect(loadOrderAlbumRow(fakeClient as never, 'user-1', 'album-7')).rejects.toThrow(webMessage);
  });

  it('the album checkout orders: the pages on screen, the account\'s row', async () => {
    await madeAlbum(SCENARIOS[1]);
    const b = builder();
    const album = checkoutAlbumFrom(b, { ...row, id: b.getAlbumId()! });
    expect(album.albumId).toBe(b.getAlbumId());
    expect(album.title).toBe(b.albumTitle);
    expect(album.albumSize).toBe(b.albumSize);
    expect(album.pages).toBe(b.albumPages);
    expect(album.coverFront).toBe(b.coverFront);
    expect(album.photoUris).toEqual(b.uploadedPhotos.map((p) => p.previewUrl));
    const coverIndex = (b.coverFront.slotFills ?? []).find((f): f is number => typeof f === 'number');
    expect(album.coverPhotoUri).toBe(coverIndex != null ? b.uploadedPhotos[coverIndex].previewUrl : null);
    expect(album.row.id).toBe(b.getAlbumId());
    expect(album.fixture).toBeFalsy();
  });
});
