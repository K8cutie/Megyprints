/* ══════════════════════════════════════════════════════════════════════════
   HOW BIG THE PREVIEW'S BOOK IS (src/builder/previewLayout.ts).

   Owner (2026-11): turning the phone shows the open book (two facing pages)
   full screen, and the upright book gets bigger than it was.
     • On its side: the open book fills the screen inside the safe area (the
       notch, the status bar, the navigation bar), with the turn buttons
       where they cost the book the least: at the sides for a square or tall
       album (it is limited by the height anyway), under the book for a wide
       one. The closed cover is one page of the same book, in the middle.
     • Upright: the page is as wide as the screen (4 points at each side,
       was 16), and as tall as fits with the line under it ("Page 3 of 40")
       still on screen. Bigger than before on every phone and album size.
     • One picture size for both ways up, so turning the phone draws no page
       again.
   ══════════════════════════════════════════════════════════════════════════ */
import { ALBUM_SIZES } from '@web/pages/builder/types';
import {
  CONTROL_STRIP, fitPages, isSideways, pagePictureWidth, sidewaysBook, SIDEWAYS_EDGE, TURN_BUTTON,
  uprightBook, UPRIGHT_EDGE, UPRIGHT_ROOM, type Box, type Insets,
} from '../src/builder/previewLayout';

const aspectOf = (s: (typeof ALBUM_SIZES)[number]) => s.width / s.height;
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Upright phones (points): small, common and large Android screens. */
const PHONES = [
  { name: '360×640', w: 360, h: 640 },
  { name: '360×800', w: 360, h: 800 },
  { name: '384×854', w: 384, h: 854 },
  { name: '393×873', w: 393, h: 873 },
  { name: '412×915', w: 412, h: 915 },
  { name: '448×998', w: 448, h: 998 },
];

/** Turned on its side: what the safe area keeps clear (status bar on top,
 *  a camera notch on one side, three-button navigation on the other). */
const SIDEWAYS_INSETS: { name: string; insets: Insets }[] = [
  { name: 'no bars (status bar hidden, gesture navigation)', insets: NO_INSETS },
  { name: 'a camera notch on the left', insets: { top: 0, right: 0, bottom: 0, left: 32 } },
  { name: 'three-button navigation on the right', insets: { top: 0, right: 48, bottom: 0, left: 32 } },
  { name: 'status bar and gesture bar', insets: { top: 24, right: 0, bottom: 16, left: 0 } },
];

const inside = (b: Box, outer: Box) => b.x >= outer.x - 0.001 && b.y >= outer.y - 0.001
  && b.x + b.w <= outer.x + outer.w + 0.001 && b.y + b.h <= outer.y + outer.h + 0.001;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The upright book before this change (preview.tsx): 16 points at each side,
 *  300 points kept for everything else on the screen. */
function before(screenW: number, screenH: number, aspect: number, across: 1 | 2) {
  const availW = screenW - 16 * 2;
  const availH = screenH - 300;
  const pageW = Math.floor(Math.min(availW / across, availH * aspect));
  return { pageW, pageH: Math.round(pageW / aspect) };
}

/** The screen between the header and the turn bar, upright, at its smallest:
 *  a tall status bar (48), the header (64), the turn bar (52 + 2×16 + 1) and
 *  three-button navigation (48). */
const viewHeight = (screenH: number) => screenH - 48 - 64 - 85 - 48;

describe('a phone on its side', () => {
  it('is wider than tall', () => {
    expect(isSideways(915, 412)).toBe(true);
    expect(isSideways(412, 915)).toBe(false);
    expect(isSideways(500, 500)).toBe(false);
  });
});

describe('pages fitted into a space', () => {
  it('as big as fits, the album\'s own shape, whole points', () => {
    expect(fitPages(800, 400, 1, 2)).toEqual({ pageW: 400, pageH: 400 });
    expect(fitPages(800, 300, 1, 2)).toEqual({ pageW: 300, pageH: 300 });
    expect(fitPages(400, 900, 0.75, 1)).toEqual({ pageW: 400, pageH: 533 });
    const p = fitPages(777.5, 333.3, 1.4375, 2);
    expect(p.pageW * 2).toBeLessThanOrEqual(777.5);
    expect(p.pageH).toBeLessThanOrEqual(333.3);
    expect(Math.abs(p.pageW / p.pageH - 1.4375)).toBeLessThan(0.01);
  });
});

describe('on its side: the open book fills the screen', () => {
  for (const phone of PHONES) {
    const screenW = phone.h;
    const screenH = phone.w;
    for (const { name, insets } of SIDEWAYS_INSETS) {
      it(`${phone.name} turned, ${name}: every album size fits inside the safe area, nothing over the book`, () => {
        const safe: Box = {
          x: insets.left, y: insets.top,
          w: screenW - insets.left - insets.right, h: screenH - insets.top - insets.bottom,
        };
        for (const size of ALBUM_SIZES) {
          const aspect = aspectOf(size);
          const b = sidewaysBook({ screenW, screenH, insets, aspect });
          // Two facing pages, the album's own shape.
          expect(b.spread.w).toBe(2 * b.pageW);
          expect(b.spread.h).toBe(b.pageH);
          expect(Math.abs(b.pageW / b.pageH - aspect)).toBeLessThan(0.02);
          // Clear of the notch and the bars.
          for (const box of [b.spread, b.closed, b.back, b.forward, b.counter]) expect(inside(box, safe)).toBe(true);
          // The turn buttons and the count are never over the pages.
          for (const box of [b.back, b.forward, b.counter]) {
            expect(overlaps(box, b.spread)).toBe(false);
            expect(overlaps(box, b.closed)).toBe(false);
          }
          expect(overlaps(b.back, b.forward)).toBe(false);
          // Fills the screen: it reaches the room's edges one way or the other.
          const fillsWidth = b.room.w - b.spread.w < 2;
          const fillsHeight = b.room.h - b.spread.h < 2;
          expect(fillsWidth || fillsHeight).toBe(true);
          // The room is the safe area less only the strip the buttons take.
          const strips = b.controls === 'sides' ? { w: 2 * CONTROL_STRIP, h: 0 } : { w: 0, h: CONTROL_STRIP };
          expect(b.room.w).toBeCloseTo(safe.w - 2 * SIDEWAYS_EDGE - strips.w, 5);
          expect(b.room.h).toBeCloseTo(safe.h - 2 * SIDEWAYS_EDGE - strips.h, 5);
        }
      });
    }
  }

  it('turn buttons are a finger wide (the size of the app\'s buttons)', () => {
    const b = sidewaysBook({ screenW: 915, screenH: 412, insets: NO_INSETS, aspect: 1 });
    expect(TURN_BUTTON).toBeGreaterThanOrEqual(48);
    expect(b.back.w).toBe(TURN_BUTTON);
    expect(b.forward.h).toBe(TURN_BUTTON);
  });

  it('a square or tall album: the buttons at the sides; a tall one as tall as the screen', () => {
    for (const preset of ['6x6', '8x8', '6x8', '8.5x11']) {
      const size = ALBUM_SIZES.find((s) => s.preset === preset)!;
      const b = sidewaysBook({ screenW: 915, screenH: 412, insets: NO_INSETS, aspect: aspectOf(size) });
      expect(b.controls).toBe('sides');
      if (size.category === 'portrait') expect(b.room.h - b.spread.h).toBeLessThan(2);
      else expect(b.room.w - b.spread.w).toBeLessThan(2);
      // Back on the left edge, forward on the right, halfway up.
      expect(b.back.x).toBe(SIDEWAYS_EDGE);
      expect(b.forward.x + b.forward.w).toBe(915 - SIDEWAYS_EDGE);
      expect(b.back.y + b.back.h / 2).toBeCloseTo(412 / 2, 0);
    }
  });

  it('a wide album: the buttons under the book, the book as wide as the screen', () => {
    for (const preset of ['6x4', '8x6', '11.5x8']) {
      const size = ALBUM_SIZES.find((s) => s.preset === preset)!;
      const b = sidewaysBook({ screenW: 915, screenH: 412, insets: NO_INSETS, aspect: aspectOf(size) });
      expect(b.controls).toBe('below');
      expect(b.room.w - b.spread.w).toBeLessThan(2);
      expect(b.spread.w).toBeGreaterThanOrEqual(915 - 2 * SIDEWAYS_EDGE - 1);
      // The buttons in the bottom corners, under the book.
      expect(b.back.y).toBeGreaterThanOrEqual(b.spread.y + b.spread.h);
      expect(b.forward.y).toBe(b.back.y);
    }
  });

  it('the buttons go where the book is bigger', () => {
    for (const size of ALBUM_SIZES) {
      const aspect = aspectOf(size);
      const b = sidewaysBook({ screenW: 915, screenH: 412, insets: NO_INSETS, aspect });
      const safeW = 915 - 2 * SIDEWAYS_EDGE;
      const safeH = 412 - 2 * SIDEWAYS_EDGE;
      const sides = fitPages(safeW - 2 * CONTROL_STRIP, safeH, aspect, 2).pageW;
      const below = fitPages(safeW, safeH - CONTROL_STRIP, aspect, 2).pageW;
      expect(b.pageW).toBe(Math.max(sides, below));
    }
  });

  it('the closed cover is one page of the same book, in the middle of the room', () => {
    const b = sidewaysBook({ screenW: 915, screenH: 412, insets: { top: 0, right: 48, bottom: 0, left: 32 }, aspect: 0.75 });
    expect(b.closed.w).toBe(b.pageW);
    expect(b.closed.h).toBe(b.pageH);
    expect(b.closed.y).toBe(b.spread.y);
    expect(b.closed.x).toBe(b.spread.x + b.pageW / 2);
    expect(Math.abs(b.closed.x + b.closed.w / 2 - (b.room.x + b.room.w / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(b.spread.x + b.spread.w / 2 - (b.room.x + b.room.w / 2))).toBeLessThanOrEqual(1);
  });

  it('the notch and the navigation bar move the book, never under them', () => {
    const plain = sidewaysBook({ screenW: 915, screenH: 412, insets: NO_INSETS, aspect: 1 });
    const notched = sidewaysBook({ screenW: 915, screenH: 412, insets: { top: 0, right: 48, bottom: 0, left: 32 }, aspect: 1 });
    expect(notched.back.x).toBe(32 + SIDEWAYS_EDGE);
    expect(notched.forward.x + notched.forward.w).toBe(915 - 48 - SIDEWAYS_EDGE);
    expect(notched.pageW).toBeLessThanOrEqual(plain.pageW);
  });

  it('bigger than the open book upright', () => {
    for (const phone of PHONES) {
      for (const size of ALBUM_SIZES) {
        const aspect = aspectOf(size);
        const upright = uprightBook({ screenW: phone.w, viewH: viewHeight(phone.h), aspect, shows: 'spread' });
        const turned = sidewaysBook({ screenW: phone.h, screenH: phone.w, insets: { top: 0, right: 48, bottom: 0, left: 32 }, aspect });
        expect(turned.pageW).toBeGreaterThan(upright.pageW);
      }
    }
  });
});

describe('upright: the book is as big as the screen allows', () => {
  it('one page is as wide as the screen, 4 points at each side', () => {
    expect(UPRIGHT_EDGE).toBe(4);
    for (const phone of PHONES) {
      for (const size of ALBUM_SIZES) {
        const aspect = aspectOf(size);
        const b = uprightBook({ screenW: phone.w, viewH: viewHeight(phone.h), aspect, shows: 'page' });
        expect(b.pageW).toBeLessThanOrEqual(phone.w - 2 * UPRIGHT_EDGE);
        // As tall as fits with the line under it.
        expect(b.pageH + UPRIGHT_ROOM).toBeLessThanOrEqual(viewHeight(phone.h));
        // Either the width or the height is used up.
        const fullWidth = b.pageW === phone.w - 2 * UPRIGHT_EDGE;
        const fullHeight = viewHeight(phone.h) - UPRIGHT_ROOM - b.pageH < 2;
        expect(fullWidth || fullHeight).toBe(true);
      }
    }
  });

  it('bigger than before, on every phone and album size (the page, the cover and the open book)', () => {
    for (const phone of PHONES) {
      for (const size of ALBUM_SIZES) {
        const aspect = aspectOf(size);
        for (const shows of ['page', 'closed', 'spread'] as const) {
          const now = uprightBook({ screenW: phone.w, viewH: viewHeight(phone.h), aspect, shows });
          const was = before(phone.w, phone.h, aspect, shows === 'spread' ? 2 : 1);
          expect(now.pageW).toBeGreaterThan(was.pageW);
        }
      }
    }
  });

  it('on a common phone (412×915), an 8×8 page goes from 380 to 404 points wide', () => {
    const now = uprightBook({ screenW: 412, viewH: viewHeight(915), aspect: 1, shows: 'page' });
    expect(before(412, 915, 1, 1).pageW).toBe(380);
    expect(now).toEqual({ pageW: 404, pageH: 404 });
  });

  it('the open book upright: two pages across the whole width', () => {
    const b = uprightBook({ screenW: 412, viewH: viewHeight(915), aspect: 0.75, shows: 'spread' });
    expect(b.pageW).toBe(Math.floor((412 - 2 * UPRIGHT_EDGE) / 2));
  });

  it('a short screen and a tall album: as tall as fits, the line under it still on screen', () => {
    const viewH = 420;
    const b = uprightBook({ screenW: 412, viewH, aspect: 0.75, shows: 'page' });
    expect(b.pageH).toBe(viewH - UPRIGHT_ROOM);
    expect(b.pageW).toBe(Math.floor((viewH - UPRIGHT_ROOM) * 0.75));
  });
});

describe('one picture size for both ways up', () => {
  it('the same picture upright and turned: turning the phone draws no page again', () => {
    for (const phone of PHONES) {
      for (const size of ALBUM_SIZES) {
        const aspect = aspectOf(size);
        expect(pagePictureWidth({ screenW: phone.w, screenH: phone.h, aspect, pixelRatio: 2.625 }))
          .toBe(pagePictureWidth({ screenW: phone.h, screenH: phone.w, aspect, pixelRatio: 2.625 }));
      }
    }
  });

  it('sharp both ways: as wide as the biggest the page is shown, in the phone\'s pixels (at most 1400)', () => {
    for (const phone of PHONES) {
      for (const size of ALBUM_SIZES) {
        const aspect = aspectOf(size);
        const px = pagePictureWidth({ screenW: phone.w, screenH: phone.h, aspect, pixelRatio: 2 });
        const upright = uprightBook({ screenW: phone.w, viewH: phone.h, aspect, shows: 'page' }).pageW;
        const turned = sidewaysBook({ screenW: phone.h, screenH: phone.w, insets: NO_INSETS, aspect }).pageW;
        expect(px).toBe(Math.min(1400, Math.round(Math.max(upright, turned) * 2)));
      }
    }
    expect(pagePictureWidth({ screenW: 448, screenH: 998, aspect: 1.5, pixelRatio: 3.5 })).toBe(1400);
  });
});
