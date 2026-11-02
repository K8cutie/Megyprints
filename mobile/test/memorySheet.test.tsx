/* ══════════════════════════════════════════════════════════════════════════
   "ADD A VIDEO MEMORY" IN THE EDITOR (src/editor/memories), rendered and
   tapped on an album made through the app's steps (test/editorHarness.ts),
   every change through the website's own album state:
     • the words are the website's (AddQrModal, VideoMemoryButton);
     • "Add a video memory" shows only on a single-photo page (the website's
       canAddMemoryQr); a tap on a page's QR opens "Change this memory";
     • pick a video → its line and preview → "Place QR": the page becomes the
       full photo with the QR in the corner chosen (or Auto), the QR's
       picture and code, the video kept on the phone;
     • the quality: offered with the album's first memory (HD at its price),
       then "set with your first memory";
     • a video too long: the website's words, nothing placed;
     • change the video (same code), move the corner, Remove;
     • the corner: only the page's two OUTER corners are offered, the
       binding's side marked, and Auto keeps to them (lib/memories/qrSide.ts).
   The phone's picker, player, file store and prices are stand-ins.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { bindingEdge } from '@web/pages/builder/binding';
import { QR_CORNERS, qrBadgeCornerOf } from '@web/pages/builder/pageTemplates';
import type { QrFill } from '@web/pages/builder/types';
import { editThePages } from '../src/editor/scope';
import '../src/editor/parts';
import { editorParts, type EditorContext, type SheetProps } from '../src/editor/registry';
import * as W from '../src/editor/memories/words';
import type { PickedVideo } from '../src/editor/memories/memoryFlow';
import type { AppPlatform } from '../src/builder/appPlatform';
import { outerCorners } from '../src/lib/memories/qrSide';
import { act, builder, ctxOn, madeAlbum, settle, useEditorBench } from './editorHarness';

const REPO = path.resolve(__dirname, '..', '..');
const MODAL = fs.readFileSync(path.join(REPO, 'src/pages/builder/AddQrModal.tsx'), 'utf8');
const BUTTON = fs.readFileSync(path.join(REPO, 'src/pages/builder/VideoMemoryButton.tsx'), 'utf8');

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
const mockPicks: (PickedVideo | null)[] = [];
jest.mock('../src/editor/memories/pickVideo', () => ({ pickVideoFromPhone: async () => mockPicks.shift() ?? null }));
jest.mock('../src/editor/memories/VideoPreview', () => ({ VideoPreview: ({ uri, testID }: { uri: string; testID?: string }) => jest.requireActual('react').createElement('VideoPreview', { uri, testID }) }));
jest.mock('../src/lib/memories/qrPicture', () => ({ qrPngDataUrlOnPhone: (url: string) => `data:image/png;base64,QR(${url})` }));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => i) }));
const mockKept: Record<string, { code: string; quality?: string; uploaded?: boolean; uri: string; replace?: boolean }> = {};
const mockQuality = { value: 'standard' };
jest.mock('../src/lib/memories/clipStore', () => ({
  clipStore: {
    getStagedClip: async (code: string) => mockKept[code] ?? null,
    stageClip: async (c: { code: string; from: string; quality?: string; replace?: boolean }) => { mockKept[c.code] = { code: c.code, quality: c.quality, uri: `file:///kept/${c.code}`, replace: c.replace }; return mockKept[c.code]; },
    removeStagedClip: async (code: string) => { delete mockKept[code]; },
    listStagedCodes: async () => Object.keys(mockKept),
    stagedClipQuality: async (codes: string[]) => (codes.some((c) => mockKept[c]?.quality === 'hd') ? 'hd' : codes.length ? 'standard' : null),
  },
  currentClipQuality: async () => mockQuality.value,
  setClipQuality: async (q: string) => { mockQuality.value = q; },
}));
const mockSchedule = { value: { hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 300 }], hd_memories_price: 150 } as Record<string, unknown> };
jest.mock('../src/lib/supabase', () => ({
  supabaseConfigured: true,
  supabaseUrl: 'https://example.supabase.co',
  supabase: { rpc: async (name: string) => (name === 'public_price_schedule' ? { data: mockSchedule.value, error: null } : { data: null, error: { message: 'no' } }) },
}));

useEditorBench();

let sheetRoot: Root | null = null;
beforeEach(() => {
  mockPicks.length = 0;
  for (const k of Object.keys(mockKept)) delete mockKept[k];
  mockQuality.value = 'standard';
  mockSchedule.value = { hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 300 }], hd_memories_price: 150 };
});
afterEach(async () => {
  await act(async () => { sheetRoot?.unmount(); });
  sheetRoot = null;
});

const video = (over: Partial<PickedVideo> = {}): PickedVideo => ({ uri: 'file:///cache/ImagePicker/VID_1.mp4', name: 'VID_1.mp4', size: 31_457_280, type: 'video/mp4', durationSec: 42, ...over });

const part = () => editorParts().find((p) => p.id === 'memories')!;
const Sheet = () => part().sheets!.sheet as (p: SheetProps<unknown>) => ReactElement | null;

/** A single-photo page the website lets take a memory (bound on the side asked). */
async function singlePhotoPage(bound?: 'left' | 'right'): Promise<number> {
  await act(async () => { editThePages(builder()); });
  for (let i = 0; i < builder().albumPages.length; i++) {
    if (bound && bindingEdge(i) !== bound) continue;
    await act(async () => { builder().goToPage(i); });
    if (builder().canAddMemoryQr) return i;
  }
  throw new Error('no single-photo page');
}

async function show(platform: AppPlatform, params: unknown) {
  const log = { closed: 0 };
  const ctx: EditorContext = ctxOn(platform);
  sheetRoot = createRoot();
  await act(async () => { sheetRoot!.render(createElement(Sheet(), { ctx, params, close: () => { log.closed++; } })); });
  await settle();
  return log;
}
const all = (pred: (i: TestInstance) => boolean) => sheetRoot!.container.queryAll(pred);
const has = (id: string) => all((i) => i.props.testID === id).length > 0;
function textOf(node: TestInstance = sheetRoot!.container): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
async function press(id: string) {
  const hit = all((i) => i.props.testID === id && typeof i.props.onClick === 'function')[0];
  if (!hit) throw new Error(`nothing to press: ${id}`);
  await act(async () => { hit.props.onClick({ nativeEvent: {}, currentTarget: 1, target: 1, stopPropagation() {} }); });
  await settle();
}

describe('the words are the website\'s', () => {
  it('AddQrModal and VideoMemoryButton, word for word', () => {
    expect(BUTTON).toContain(`<span>${W.ADD_BUTTON}</span>`);
    expect(MODAL).toContain(`{initial ? '${W.TITLE_CHANGE}' : '${W.TITLE_ADD}'}`);
    for (const w of [W.INVITE, W.PLAYS_THIS, W.QUALITY_LABEL, W.QUALITY_NOTE, W.CHECKING, W.CHOOSE_FIRST, W.SAVE_FAILED, W.CORNER_QUESTION, W.AUTO, W.SAVING]) expect(MODAL).toContain(w);
    expect(MODAL).toContain('It plays the instant anyone scans the QR printed on this page — no app, no account.');
    expect(MODAL).toContain('Up to {Math.round(MAX_CLIP_SECONDS / 60)} minutes — we shrink it for you, so any phone video works.');
    expect(W.INVITE_BODY).toBe('It plays the instant anyone scans the QR printed on this page — no app, no account. Up to 2 minutes — we shrink it for you, so any phone video works.');
    expect(MODAL).toContain("<>{FREE_QR_MEMORIES} memories included · ₱{EXTRA_QR_RATE} each after{includedYears ? ` · live for ${includedYears} years, longer at checkout` : ''}</>");
    expect(W.included(7, 20, 5)).toBe('7 memories included · ₱20 each after · live for 5 years, longer at checkout');
    expect(MODAL).toContain("{file ? 'Choose a different video' : initial ? 'Replace with a new video' : 'Choose a video'}");
    expect(MODAL).toContain("(initial ? 'Use this video' : 'Place QR')");
    expect(MODAL).toContain("{q === 'hd' ? `+PHP ${hdPrice} once` : 'Included'}");
    expect(MODAL).toContain("{corner == null ? 'Auto places it away from the face.' : `Placed in the ${CORNER_LABELS[corner].toLowerCase()} corner.`}");
    expect(MODAL).toContain("tl: 'Top-left', tr: 'Top-right',");
    expect(MODAL).toContain('This memory currently points to a link on');
    expect(MODAL).toContain('Replace it with a video and it will play right on the page — same QR, no reprint.');
    expect(MODAL).toContain('<Trash2 size={14} /> Remove');
    expect(MODAL).toContain("{file.name} · {mb} MB{meta?.durationSec != null ? ` · ${Math.round(meta.durationSec)} s` : ''}");
    expect(W.pickedLine('VID_1.mp4', 31_457_280, 41.6)).toBe('VID_1.mp4 · 30.0 MB · 42 s');
  });
});

describe('where it opens', () => {
  it('"Add a video memory" only on a single-photo page; a tap on a page\'s QR opens "Change this memory"', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const tool = part().tools!.find((t) => t.id === 'memoryVideo')!;
    expect(tool.label).toBe(W.ADD_BUTTON);
    expect(tool.wide).toBe(true);
    const i = await singlePhotoPage();
    expect(tool.shown!(ctxOn(platform))).toBe(true);
    const opened: { id: string; params: unknown }[] = [];
    tool.onPress(ctxOn(platform, opened));
    expect(opened).toEqual([{ id: 'memories:sheet', params: { mode: 'add' } }]);
    // A page with several photos: no button (the website's rule).
    for (let j = 0; j < builder().albumPages.length; j++) {
      if (j === i) continue;
      await act(async () => { builder().goToPage(j); });
      if (!builder().canAddMemoryQr) { expect(tool.shown!(ctxOn(platform))).toBe(false); break; }
    }
    const tap = part().taps![0];
    const sheets: { id: string; params: unknown }[] = [];
    expect(tap.kinds).toEqual(['slotQr', 'boxQr']);
    expect(tap.onTap({ kind: 'slotQr', index: 1 } as never, ctxOn(platform, sheets))).toBe(true);
    expect(tap.onTap({ kind: 'boxQr', index: 0 } as never, ctxOn(platform, sheets))).toBe(true);
    expect(sheets).toEqual([{ id: 'memories:sheet', params: { mode: 'slot', slot: 1 } }, { id: 'memories:sheet', params: { mode: 'box', box: 0 } }]);
  });
});

describe('a new memory', () => {
  it('pick a video, see it, "Place QR": the page becomes the photo with the QR in the corner chosen; the video is kept', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const i = await singlePhotoPage();
    const photo = builder().albumPages[i].slotFills!.find((f) => f != null);
    const log = await show(platform, { mode: 'add' });
    expect(textOf()).toContain(W.TITLE_ADD);
    expect(textOf()).toContain(W.INVITE);
    expect(textOf()).toContain('7 memories included · ₱20 each after · live for 5 years, longer at checkout');
    // Nothing picked yet: Place QR does nothing.
    await press('memory-save');
    expect(builder().albumPages[i].qrFills?.some(Boolean) ?? false).toBe(false);
    mockPicks.push(video());
    await press('memory-pick');
    expect(textOf()).toContain('VID_1.mp4 · 30.0 MB · 42 s');
    expect(has('memory-preview')).toBe(true);
    expect(textOf()).toContain(W.pickLabel(true, false));
    expect(textOf()).toContain('Auto places it away from the face.');
    const [top] = outerCorners(i);
    await press(`memory-corner-${top}`);
    expect(textOf()).toContain(`Placed in the ${W.CORNER_LABELS[top].toLowerCase()} corner.`);
    await press('memory-save');
    expect(log.closed).toBe(1);
    const page = builder().albumPages[i];
    expect(qrBadgeCornerOf(page.templateId)).toBe(top);
    const fill = page.qrFills!.find(Boolean) as QrFill;
    expect(fill).toEqual(expect.objectContaining({
      code: 'abcdefgh', kind: 'clip', clipExt: 'mp4', memoryUrl: 'https://megyprints.vercel.app/m/abcdefgh',
      qrPngDataUrl: 'data:image/png;base64,QR(https://megyprints.vercel.app/m/abcdefgh)',
      destination: 'https://example.supabase.co/storage/v1/object/public/memory-clips/abcdefgh.mp4',
    }));
    expect(page.slotFills![0]).toBe(photo);
    expect(mockKept.abcdefgh).toEqual(expect.objectContaining({ quality: 'standard' }));
  });

  it('the album\'s first memory offers the quality; HD is kept for the album; the next memory says it is set', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await singlePhotoPage();
    await show(platform, { mode: 'add' });
    expect(textOf()).toContain(W.QUALITY_LABEL);
    expect(textOf()).toContain('Standard 720p');
    expect(textOf()).toContain('HD 1080p');
    expect(textOf()).toContain('+PHP 150 once');
    await press('memory-tier-hd');
    mockPicks.push(video());
    await press('memory-pick');
    await press('memory-save');
    expect(mockKept.abcdefgh.quality).toBe('hd');
    expect(mockQuality.value).toBe('hd');
    // The album has a memory now: the choice is locked.
    await act(async () => { sheetRoot?.unmount(); });
    await show(platform, { mode: 'add' });
    expect(has('memory-tier-hd')).toBe(false);
    expect(textOf()).toContain('Quality: HD 1080p - set with your first memory.');
  });

  it('no HD price in the schedule: no quality choice (the website\'s rule)', async () => {
    mockSchedule.value = { hosting_tiers: [{ years: 5, price: 0 }] };
    const platform = await madeAlbum(SCENARIOS[0]);
    await singlePhotoPage();
    await show(platform, { mode: 'add' });
    expect(has('memory-tier-hd')).toBe(false);
  });

  it('a video too long: the website\'s words, nothing placed', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const i = await singlePhotoPage();
    await show(platform, { mode: 'add' });
    mockPicks.push(video({ durationSec: 200 }));
    await press('memory-pick');
    expect(textOf()).toContain('That video is 200 seconds — memories are up to 2 minutes. Trim it to the best moment.');
    await press('memory-save');
    expect(builder().albumPages[i].qrFills?.some(Boolean) ?? false).toBe(false);
    expect(Object.keys(mockKept)).toHaveLength(0);
  });
});

describe('the corner: the page\'s outer edge, never the binding', () => {
  for (const bound of ['left', 'right'] as const) {
    it(`a page bound on its ${bound}: only its two outer corners, the binding marked; Auto (no face found) takes the bottom one`, async () => {
      const platform = await madeAlbum(SCENARIOS[0]);
      const i = await singlePhotoPage(bound);
      const [top, bottom] = outerCorners(i);
      await show(platform, { mode: 'add' });
      expect(QR_CORNERS.filter((c) => has(`memory-corner-${c}`))).toEqual([top, bottom]);
      expect(has(`memory-spine-${bound}`)).toBe(true);
      expect(textOf()).toContain(W.OUTER_EDGE_NOTE);
      mockPicks.push(video());
      await press('memory-pick');
      await press('memory-save');
      expect(qrBadgeCornerOf(builder().albumPages[i].templateId)).toBe(bottom);
    });
  }
});

describe('a memory already on the page', () => {
  async function withMemory() {
    const platform = await madeAlbum(SCENARIOS[0]);
    const i = await singlePhotoPage();
    await show(platform, { mode: 'add' });
    mockPicks.push(video());
    await press('memory-pick');
    await press(`memory-corner-${outerCorners(i)[1]}`);
    await press('memory-save');
    await act(async () => { sheetRoot?.unmount(); });
    const slot = builder().albumPages[i].qrFills!.findIndex(Boolean);
    return { platform, i, slot };
  }

  it('"Change this memory": what plays now, a new video with the same code and QR', async () => {
    const { platform, i, slot } = await withMemory();
    const log = await show(platform, { mode: 'slot', slot });
    expect(textOf()).toContain(W.TITLE_CHANGE);
    expect(textOf()).toContain(W.PLAYS_THIS);
    expect(all((n) => n.props.testID === 'memory-current')[0].props.uri).toBe('file:///kept/abcdefgh');
    expect(textOf()).toContain('https://megyprints.vercel.app/m/abcdefgh');
    expect(textOf()).toContain(W.pickLabel(false, true));
    mockPicks.push(video({ name: 'IMG_2.MOV', type: 'video/quicktime', uri: 'file:///cache/ImagePicker/IMG_2.MOV' }));
    await press('memory-pick');
    expect(textOf()).toContain('Use this video');
    await press('memory-save');
    expect(log.closed).toBe(1);
    const fill = builder().albumPages[i].qrFills![slot] as QrFill;
    expect(fill).toEqual(expect.objectContaining({ code: 'abcdefgh', clipExt: 'mov', destination: 'https://example.supabase.co/storage/v1/object/public/memory-clips/abcdefgh.mov' }));
    // Never sent before: it simply takes the old one's place.
    expect(mockKept.abcdefgh.replace).toBe(false);
  });

  it('the corner moves at once; "Remove" takes the QR and its kept video off', async () => {
    const { platform, i, slot } = await withMemory();
    const [top, bottom] = outerCorners(i);
    expect(qrBadgeCornerOf(builder().albumPages[i].templateId)).toBe(bottom);
    await show(platform, { mode: 'slot', slot });
    expect(has('memory-corner-auto')).toBe(false);
    expect(QR_CORNERS.filter((c) => has(`memory-corner-${c}`))).toEqual([top, bottom]);
    await press(`memory-corner-${top}`);
    expect(qrBadgeCornerOf(builder().albumPages[i].templateId)).toBe(top);
    await act(async () => { sheetRoot?.unmount(); });
    const log = await show(platform, { mode: 'slot', slot: builder().albumPages[i].qrFills!.findIndex(Boolean) });
    await press('memory-remove');
    expect(log.closed).toBe(1);
    expect(builder().albumPages[i].qrFills?.some(Boolean) ?? false).toBe(false);
    expect(mockKept.abcdefgh).toBeUndefined();
  });
});
