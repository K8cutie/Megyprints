import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseIntent } from './intentParser';
import { ActionEngine } from './actionEngine';
import { autoFillPlan } from '../pages/builder/useBuilderState';
import type { BuilderActions } from '../pages/builder/useBuilderState';
import type { AlbumPage } from '../pages/builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S "AUTO FILL" FILLS — AND ONLY FILLS (1-star testers, 2026-10-04,
   the Perfectionist; reproduced by its checker):
     • "auto fill" — the very command Megy suggests — REGENERATED the whole
       album and wiped the layout edits (it was a generate keyword too, and
       the tie went to generate);
     • "fill the empty slots on this page…" CLEARED the page ("empty slots"
       is a clear keyword, one letter longer than "fill empty");
     • auto-fill filled frames with photos already on other pages (each would
       print twice) while new uploads sat unused.
   ══════════════════════════════════════════════════════════════════════════ */

describe('what Megy hears', () => {
  it.each([
    ['auto fill', 'auto_fill'],
    ['autofill', 'auto_fill'],
    ['Auto-fill', 'auto_fill'],
    ['fill the empty slots on this page with my unused photos', 'auto_fill'],
    ['fill empty slots', 'auto_fill'],
    ['fill the frames', 'auto_fill'],
    ['generate album', 'generate_album'],
    ['make album', 'generate_album'],
    ['clear slots', 'clear_slots'],
    ['empty slots', 'clear_slots'],
  ])('"%s" → %s', (text, intent) => {
    expect(parseIntent(text).intent.type).toBe(intent);
  });
});

const page = (slotFills: (number | null)[]): AlbumPage =>
  ({ id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#fff' }, photos: [], textElements: [], templateId: 'unknown', slotFills } as AlbumPage);

describe('autoFillPlan — empty frames get photos NOT already in the album', () => {
  it('skips photos used on other pages; takes the unused ones', () => {
    // Photos 0-3 are on pages 1-3 and this one; 4-7 are new uploads.
    expect(autoFillPlan(page([0, null, null, null]), 8, new Set([0, 1, 2, 3]))).toEqual([0, 4, 5, 6]);
  });
  it('a photo already in the frames stays; left-out photos are skipped too', () => {
    expect(autoFillPlan(page([null, 3, null]), 6, new Set([3, 4]))).toEqual([0, 3, 1]);
  });
  it('every photo already used → the frames stay empty (never a photo printed twice)', () => {
    expect(autoFillPlan(page([0, null, null]), 3, new Set([0, 1, 2]))).toEqual([0, null, null]);
  });
});

describe("Megy's answer says what happened", () => {
  const engineWith = (r: { filled: number; empty: number }) =>
    new ActionEngine({ autoFillSlots: () => r } as unknown as BuilderActions);
  it('filled', async () => {
    expect((await engineWith({ filled: 3, empty: 3 }).execute({ type: 'auto_fill', rawMessage: 'auto fill' })).message)
      .toBe("Filled 3 empty frames on this page with photos that aren't in your album yet.");
  });
  it('nothing empty', async () => {
    expect((await engineWith({ filled: 0, empty: 0 }).execute({ type: 'auto_fill', rawMessage: 'auto fill' })).message).toBe('This page has no empty photo frames.');
  });
  it('no unused photo left', async () => {
    expect((await engineWith({ filled: 0, empty: 2 }).execute({ type: 'auto_fill', rawMessage: 'auto fill' })).message).toMatch(/^Every photo is already in your album/);
  });
});

describe('a typed "generate" on a made album asks first (source guard)', () => {
  const src = readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8');
  it('asks, and only a yes (or asking again) rebuilds', () => {
    expect(src).toMatch(/if \(pending && yes\) intent = \{ type: 'generate_album', rawMessage: text \};/);
    expect(src).toMatch(/else if \(intent\.type === 'generate_album' && built && !pending\) \{\s*rebuildAskedRef\.current = true;/);
    expect(src).toMatch(/That rebuilds your whole album/);
  });
});
