import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { splitBold } from './boldText';
import { WizardEngine, type WizardStep } from './wizard';
import { ALBUM_THEME_KEY } from '../lib/albumTheme';
import type { BuilderActions } from '../pages/builder/useBuilderState';

/* ══════════════════════════════════════════════════════════════════════════
   BOLD TEXT — Megy's wizard text marks key words with **bold**, and the panel
   printed the asterisks: customers saw "I'm **Megy**" on the very first
   screen (2026-10-02, phone and desktop). The panel now renders splitBold's
   runs, the bold ones as <strong>.
   ══════════════════════════════════════════════════════════════════════════ */

const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });

describe('splitBold', () => {
  it('cuts the welcome message into plain and bold runs', () => {
    expect(splitBold("I'm **Megy**, your personal album designer.")).toEqual([
      plain("I'm "), bold('Megy'), plain(', your personal album designer.'),
    ]);
  });
  it('handles several bold runs, at the start and at the end', () => {
    expect(splitBold("**Maria's Debut** — an album about **Wedding**")).toEqual([
      bold("Maria's Debut"), plain(' — an album about '), bold('Wedding'),
    ]);
    expect(splitBold('**a** **b**')).toEqual([bold('a'), plain(' '), bold('b')]);
  });
  it('text with no markers is one plain run; empty text is no runs', () => {
    expect(splitBold('Upload your photos.')).toEqual([plain('Upload your photos.')]);
    expect(splitBold('')).toEqual([]);
  });
  it('an unpaired ** is shown as typed', () => {
    expect(splitBold('a **b')).toEqual([plain('a **b')]);
    expect(splitBold('**a** and **b')).toEqual([bold('a'), plain(' and **b')]);
    expect(splitBold('****')).toEqual([plain('****')]);
  });
  it('a single * stays, inside or outside bold', () => {
    expect(splitBold('5 * 3')).toEqual([plain('5 * 3')]);
    expect(splitBold('**Ana*Ben**')).toEqual([bold('Ana*Ben')]);
  });
  it('a pair never spans two lines', () => {
    expect(splitBold('**Quick magic:**\n• Shuffle **a\nb**')).toEqual([
      bold('Quick magic:'), plain('\n• Shuffle **a\nb**'),
    ]);
  });
  it('HTML in the text stays text — the runs are never parsed', () => {
    expect(splitBold('**<img src=x onerror=alert(1)>**')).toEqual([bold('<img src=x onerror=alert(1)>')]);
  });
});

/* Every body the wizard can show, run through the splitter the way the panel
   renders it: the bold words come out bold and no asterisk is left on screen. */
describe('every wizard message shows its bold words, never asterisks', () => {
  const g = globalThis as unknown as { localStorage?: unknown };
  let store: Record<string, string>;
  beforeEach(() => {
    store = { [ALBUM_THEME_KEY]: 'Wedding' };
    g.localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
    };
  });
  afterEach(() => { delete g.localStorage; });

  // Three filled pages and three photos, so every step has its numbers.
  const page = { slotFills: [0, null], photos: [], textElements: [] };
  const engine = (over: Record<string, unknown> = {}) => new WizardEngine({
    albumTitle: "Maria's Debut",
    phase: 'edit',
    albumPages: [page, page, page],
    uploadedPhotos: [{}, {}, {}],
    albumSize: '8x8',
    currentPageIndex: 0,
    currentPage: page,
    ...over,
  } as unknown as BuilderActions, false);

  const shown = (w: WizardEngine, step: WizardStep) => {
    w.state.step = step;
    const runs = splitBold(w.getMessage().body);
    return { bolds: runs.filter((r) => r.bold).map((r) => r.text), text: runs.map((r) => r.text).join('') };
  };

  it.each<[WizardStep, string[]]>([
    ['welcome', ['Megy']],
    ['pick_theme', ["Maria's Debut", 'Wedding']],
    ['pick_size', ['8x8']],
    ['design_cover', ['Continue to photos']],
    // 3 photos is short of the 40-photo minimum (albumMinimum): the body says how many more.
    ['upload_photos', ['3', '40', '37 more']],
    ['review_pages', ['page 1 of 3', 'Next page']],
    ['add_text', []],
    ['finalize', []],
  ])('%s', (step, bolds) => {
    const out = shown(engine(), step);
    expect(out.bolds).toEqual(bolds);
    expect(out.text).not.toContain('*');
  });

  it('the last-page nudge and the empty upload step too', () => {
    const last = shown(engine({ currentPageIndex: 2 }), 'review_pages');
    expect(last.bolds).toEqual(['3']);
    expect(last.text).toMatch(/^You've been through all 3 pages/);
    const empty = shown(engine({ uploadedPhotos: [] }), 'upload_photos');
    expect(empty.bolds).toEqual(['40 photos']);
    expect(empty.text).not.toContain('*');
  });
});
