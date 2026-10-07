// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StudioLayer, StudioSheet } from './StudioPhone';
import StudioStrip from './StudioStrip';
import { PAGE_TEMPLATES } from './pageTemplates';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE PHOTO TOOLS SAY WHAT THEY DO (owner, 2026-10-07, looking at the pill
   over a tapped photo): "it shows masks look worn. I mean what are those.
   Masks i understand, could look be called "filters" instead and what is
   worn" — then, once Worn was explained as a one-tap brushed edge + Faded:
   "remove vintage".
     Look    → Filter   (black & white, sepia, faded, warm — a colour filter)
     Worn    → gone     (brushed edge is in Mask, Faded is in Filter)
     As shot → Original (the "no filter" choice, in the word phones use)
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const words = () => [...host.querySelectorAll('button')].map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
const text = () => (host.textContent ?? '').replace(/\s+/g, ' ');
const noPreset = () => expect(host.querySelector('[data-testid^="pill-worn"], [data-testid^="pill-vintage"], [data-testid^="preset-"]')).toBeNull();
const template = PAGE_TEMPLATES.find((t) => t.slots.length > 0)!;
const page = { id: 'p1', layout: 'single', templateId: template.id, slotFills: [0] } as unknown as AlbumPage;
const photo: UploadedPhoto = { id: 'a', previewUrl: '', name: 'a.jpg', type: 'image/jpeg', size: 1, width: 3000, height: 2000 } as UploadedPhoto;
const layer = (onOpenSheet = vi.fn()) => createElement(StudioLayer, {
  page, pageIndex: 1, W: 360, H: 360, albumSize: '8x8',
  selectedSlot: 0, onSelectSlot: vi.fn(), selectedSticker: null, onSelectSticker: vi.fn(),
  onOpenSheet, onStickerGeom: vi.fn(() => []), onStickerRemove: vi.fn(),
});

describe('the phone pill over a tapped photo', () => {
  it('reads Mask · Filter — no "Look", no "Worn", no "Vintage"', () => {
    act(() => root.render(layer()));
    expect(words()).toEqual(['Mask', 'Filter']);
    noPreset();
  });

  it('Mask and Filter open their sheets', () => {
    const onOpenSheet = vi.fn();
    act(() => root.render(layer(onOpenSheet)));
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="pill-mask"]')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="pill-filter"]')!.click());
    expect(onOpenSheet.mock.calls).toEqual([['mask'], ['look']]);
  });
});

describe('the phone filter sheet', () => {
  it('is titled Filter and starts with Original', () => {
    act(() => root.render(createElement(StudioSheet, {
      kind: 'look', photo, currentMask: 'none', currentLook: 'none',
      onPickMask: vi.fn(), onPickLook: vi.fn(), onClose: vi.fn(),
    })));
    expect(text()).toContain('Filter');
    expect(text()).not.toMatch(/\bLook\b|As shot/);
    expect(words()[0]).toBe('Original');
  });
});

describe('the desktop Studio strip', () => {
  it('says Mask and Filter (Original first) — no preset row', () => {
    act(() => root.render(createElement(StudioStrip, { page, selectedSlotIndex: 0, onMask: vi.fn(), onLook: vi.fn(), onGuard: vi.fn() })));
    expect(text()).toContain('Filter');
    expect(text()).not.toMatch(/\bLook\b|As shot|Worn|Vintage|Preset/);
    expect(words()).toContain('Original');
    expect(words()).toContain('Brushed edge'); // the edge Worn used is still one tap away in Mask
    expect(words()).toContain('Faded');        // and its colour in Filter
    noPreset();
  });

  it('with no photo picked, the hint says filter, not look', () => {
    act(() => root.render(createElement(StudioStrip, { page: { ...page, slotFills: [null] }, selectedSlotIndex: 0, onMask: vi.fn(), onLook: vi.fn(), onGuard: vi.fn() })));
    expect(text()).toContain('filter');
    expect(text()).not.toMatch(/\blook\b/i);
  });
});
