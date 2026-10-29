/* ══════════════════════════════════════════════════════════════════════════
   THE SAME ALBUM, MADE ON THE WEBSITE AND IN THE APP: the scenarios and the
   summary both sides are compared on.

   Each scenario is one customer making one album: a name, an occasion, a
   size, a roll of photos (made-up names, pixel sizes, file sizes and times
   taken: no real pictures), the photo they tap for the cover, and the seed
   for the layout's dice (Math.random, set the same on both sides just before
   "Make my album", as the website's own seeded specs do).

     • website: tools/parity/webAlbums.spec.ts (vitest, jsdom), the website's
       useBuilderState on the website's own device pieces (browserPlatform),
       only the parts jsdom can't run made up, as the website's builder specs
       make them up (IndexedDB, the EXIF reader, face-api, the account);
     • app: mobile/test/albumParity.test.ts, the same useBuilderState on the
       app's platform (src/builder/appPlatform), its photos coming from the
       Phase 2 draft through the app's own steps (src/builder/albumFlow).
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '../../src/pages/builder/types';
import { getTemplateById } from '../../src/pages/builder/pageTemplates';

export interface ScenarioPhoto {
  name: string;
  /** Bytes. */
  size: number;
  width: number;
  height: number;
  /** ms, or null (no time in the photo). */
  capturedAt: number | null;
  /** A photo with no time in it: when its file was last changed (ms), which
   *  the app's Photos step sorts it by (photoTime.orderTime). Only the app's
   *  draft reads it; the album (generateAlbum, both sides) puts every photo
   *  with no time in a group at the end. */
  fileTime?: number | null;
}

export interface Scenario {
  name: string;
  title: string;
  occasion: string;
  size: AlbumSizePreset;
  seed: number;
  photos: ScenarioPhoto[];
  /** The photo tapped for the cover (its name). */
  cover: string;
}

/** Deterministic made-up numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPES = [
  { w: 4000, h: 3000 }, { w: 3000, h: 4000 }, { w: 3024, h: 3024 }, { w: 4032, h: 2268 }, { w: 1440, h: 1875 }, { w: 1080, h: 1920 },
];

/** A roll of `n` photos over a few outings (gaps of hours between them, as
 *  generateAlbum's moments split), some without a time: the last `undated`,
 *  and the ones at `undatedAt` (in the middle of the roll: screenshots and
 *  saved chat photos, their file time where they fall in the roll). */
function roll(seed: number, n: number, undated = 0, undatedAt: readonly number[] = []): ScenarioPhoto[] {
  const r = rng(seed);
  let t = Date.UTC(2026, 8, 12, 1, 0);
  const out: ScenarioPhoto[] = [];
  for (let i = 0; i < n; i++) {
    t += r() < 0.08 ? Math.round(4 + r() * 20) * 3600_000 : Math.round(20 + r() * 900) * 1000;
    const shape = SHAPES[Math.floor(r() * SHAPES.length)];
    out.push({
      name: `IMG_2026${String(1000 + i)}.jpg`,
      size: 1_500_000 + Math.floor(r() * 3_000_000),
      width: shape.w, height: shape.h,
      capturedAt: i >= n - undated || undatedAt.includes(i) ? null : t,
      ...(undatedAt.includes(i) ? { fileTime: t } : {}),
    });
  }
  return out;
}

export const SCENARIOS: Scenario[] = [
  { name: '40 photos, 8x8, Wedding', title: "Maria's Wedding", occasion: 'Wedding', size: '8x8', seed: 1, photos: roll(11, 40), cover: 'IMG_20261003.jpg' },
  { name: '57 photos, 6x8, Vacation, 4 with no time', title: 'Our Boracay Trip', occasion: 'Vacation', size: '6x8', seed: 7, photos: roll(22, 57, 4), cover: 'IMG_20261010.jpg' },
  { name: '120 photos, 8x6, Family reunion', title: 'Dela Cruz Reunion 2026', occasion: "Lola's 80th", size: '8x6', seed: 42, photos: roll(33, 120), cover: 'IMG_20261050.jpg' },
  { name: '48 photos, 8x8, Birthday, 5 with no time in the middle of the roll', title: "Ana's 7th Birthday", occasion: 'Birthday', size: '8x8', seed: 3, photos: roll(44, 48, 0, [6, 14, 15, 29, 40]), cover: 'IMG_20261002.jpg' },
];

/** What the two sides are compared on: everything the album's pages and
 *  cover say, with photos named (each side numbers its photos itself). */
export interface AlbumSummary {
  title: string;
  occasion: string;
  size: string;
  photos: number;
  pages: Array<{
    templateId: string | undefined;
    slots: (string | null)[];
    boxPhotos: (string | null)[];
    captions: Array<{ boxIndex: number | undefined; text: string; fontSize: number | undefined; fontFamily: string | undefined; bold: boolean | undefined; italic: boolean | undefined; color: string | undefined }>;
    slotTexts: (string | null)[];
    qr: number;
    ornaments: number;
    frameStyle: string | undefined;
    background: unknown;
    scales: unknown;
    offsets: unknown;
  }>;
  cover: { templateId: string | undefined; photo: string | null; title: string | null; titleSize: number | undefined; titleFont: string | undefined; titleColor: string | undefined };
}

export function summarize(b: { albumTitle: string; albumSize: string; uploadedPhotos: UploadedPhoto[]; albumPages: AlbumPage[]; coverFront: AlbumPage }, occasion: string): AlbumSummary {
  const nameOf = (i: number | null | undefined) => (i == null ? null : b.uploadedPhotos[i]?.name ?? `#${i}?`);
  const bg = b.coverFront.background as { type?: string; photoId?: string } | undefined;
  const coverTitle = b.coverFront.textElements?.find((t) => t.boxIndex === 0);
  return {
    title: b.albumTitle,
    occasion,
    size: b.albumSize,
    photos: b.uploadedPhotos.length,
    pages: b.albumPages.map((p) => ({
      templateId: p.templateId,
      slots: (p.slotFills ?? []).map(nameOf),
      boxPhotos: (p.textSlotFills ?? []).map(nameOf),
      captions: (p.textElements ?? []).map((t) => ({ boxIndex: t.boxIndex, text: t.text, fontSize: t.fontSize, fontFamily: t.fontFamily, bold: t.bold, italic: t.italic, color: t.color })),
      slotTexts: (p.slotTexts ?? []).map((t) => t?.text ?? null),
      qr: [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])].filter(Boolean).length,
      ornaments: [...(p.ornamentFills ?? []), ...(p.textSlotOrnament ?? [])].filter(Boolean).length,
      frameStyle: p.frameStyle,
      background: p.background,
      scales: p.slotScales,
      offsets: [p.slotOffsetsX, p.slotOffsetsY],
    })),
    cover: {
      templateId: b.coverFront.templateId,
      photo: bg?.type === 'image' && bg.photoId ? b.uploadedPhotos.find((p) => p.id === bg.photoId)?.name ?? '?' : null,
      title: coverTitle?.text ?? null,
      titleSize: coverTitle?.fontSize,
      titleFont: coverTitle?.fontFamily,
      titleColor: coverTitle?.color,
    },
  };
}

/** After "Make my album", each side writes the same caption in the first
 *  caption box of the album (setBoxText, the preview's tap-to-edit save), so
 *  the captions compared are not all empty (the website deals empty quote
 *  boxes: generateAlbum DEAL_BANK_QUOTES is off). */
export const PARITY_CAPTION = 'The day we will never forget';
export function firstCaptionBox(pages: AlbumPage[]): number {
  return pages.findIndex((p) => (p.templateId ? getTemplateById(p.templateId)?.textSlots?.length ?? 0 : 0) > 0);
}

/** The same "random" numbers on both sides (mulberry32, as src/test/mulberry32.ts). */
export const seeded = rng;

/* ══════════════════════════════════════════════════════════════════════════
   THE SAME EDITS ON THE WEBSITE AND IN THE APP (2.0, Phase 4): one album
   (SCENARIOS[0]) made on each side, then the same edits, each through that
   side's own editor:
     • website: tools/parity/webEdits.spec.ts calls the website builder the
       way its editors call it (MobileReview, PropertiesPanel, LayoutPicker,
       MobileTextEditor, PageColorPicker, CoverEditor);
     • app: mobile/test/editorParity.test.ts goes through the app editor's
       own code (the parts' actions, the text editor's save, the cover
       editor's calls).
   Then every page and the cover must be the same, field for field
   (editedAlbum: photos by name, the platform's own ids and addresses left
   out).
   ══════════════════════════════════════════════════════════════════════════ */
export const EDIT_PLAN = {
  /** "Remove photo" on the first photo of this page, then "Add a photo" into
   *  that frame with the first photo on `fromPage` (the two swap). */
  remove: { page: 3, fromPage: 10 },
  /** The first photo on this page moved (design px) and zoomed. */
  frame: { page: 4, dx: 40, dy: -20, zoom: 1.6 },
  /** "Change layout": the first other layout that holds the page as it is. */
  layout: { page: 5 },
  /** The first caption box from this page on: the text editor's Done. */
  caption: { from: 6, text: 'Sunset at the pier', fontSize: 30, fontFamily: '"Playfair Display", Georgia, serif', color: '#1F3A5F', bold: true, alignment: 'left' as const },
  /** "Page colour" on this page. */
  colour: { page: 7, hex: '#1F75FE' },
  /** The cover: the title's font, colour, Bold off, Shadow off; the photo
   *  moved in its frame; the title moved up. */
  cover: { font: '"Playfair Display", Georgia, serif', color: '#C9A24B', focus: { x: 0.3, y: 0.6 }, titleUp: -0.1 },
  /** "Add a page" after this page. */
  addAfter: 20,
};

const DROP_KEYS = new Set(['id', 'madeAt', 'updatedAt', 'createdAt']);
const PHOTO_INDEX_KEYS = new Set(['slotFills', 'textSlotFills']);

/** Every page and the cover, field for field, with photos by name and the
 *  platform's own ids and photo addresses left out. */
export function editedAlbum(b: { uploadedPhotos: UploadedPhoto[]; albumPages: AlbumPage[]; coverFront: AlbumPage }): unknown {
  const names = b.uploadedPhotos.map((p) => p.name);
  const byId = new Map(b.uploadedPhotos.map((p) => [p.id, p.name]));
  const norm = (v: unknown) => JSON.parse(JSON.stringify(v, (key: string, value: unknown) => {
    if (DROP_KEYS.has(key)) return undefined;
    if (key === 'image' && typeof value === 'string') return undefined; // blob: on the website, content:// in the app
    if (key === 'photoId' && typeof value === 'string') return byId.get(value) ?? value;
    if (PHOTO_INDEX_KEYS.has(key) && Array.isArray(value)) return value.map((i) => (typeof i === 'number' ? names[i] ?? `#${i}?` : i));
    return value;
  })) as unknown;
  return { pages: b.albumPages.map(norm), cover: norm(b.coverFront) };
}
