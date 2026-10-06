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
   worn".
     Look  → Filter   (black & white, sepia, faded, warm — a colour filter)
     Worn  → Vintage  (one tap: brushed edge + the Faded filter)
     As shot → Original (the "no filter" choice, in the word phones use)
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const words = () => [...host.querySelectorAll('button')].map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
const text = () => (host.textContent ?? '').replace(/\s+/g, ' ');
const template = PAGE_TEMPLATES.find((t) => t.slots.length > 0)!;
const page: AlbumPage = { id: 'p1', layout: 'single', templateId: template.id, slotFills: [0] } as unknown as AlbumPage;
const photo: UploadedPhoto = { id: 'a', previewUrl: '', name: 'a.jpg', type: 'image/jpeg', size: 1, width: 3000, height: 2000 } as UploadedPhoto;

describe('the phone pill over a tapped photo', () => {
  it('reads Mask · Filter · Vintage — no "Look", no "Worn"', () => {
    act(() => root.render(createElement(StudioLayer, {
      page, pageIndex: 1, W: 360, H: 360, albumSize: '8x8',
      selectedSlot: 0, onSelectSlot: vi.fn(), selectedSticker: null, onSelectSticker: vi.fn(),
      onOpenSheet: vi.fn(), onVintage: vi.fn(), onStickerGeom: vi.fn(() => []), onStickerRemove: vi.fn(),
    })));
    expect(words()).toEqual(['Mask', 'Filter', 'Vintage']);
  });

  it('Filter opens the filter sheet; Vintage applies the preset', () => {
    const onOpenSheet = vi.fn(), onVintage = vi.fn();
    act(() => root.render(createElement(StudioLayer, {
      page, pageIndex: 1, W: 360, H: 360, albumSize: '8x8',
      selectedSlot: 0, onSelectSlot: vi.fn(), selectedSticker: null, onSelectSticker: vi.fn(),
      onOpenSheet, onVintage, onStickerGeom: vi.fn(() => []), onStickerRemove: vi.fn(),
    })));
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="pill-filter"]')!.click());
    expect(onOpenSheet).toHaveBeenCalledWith('look');
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="pill-vintage"]')!.click());
    expect(onVintage).toHaveBeenCalledTimes(1);
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
  it('says Filter / Original / Vintage, and Vintage = brushed edge + Faded', () => {
    const onMask = vi.fn(), onLook = vi.fn(), onGuard = vi.fn();
    act(() => root.render(createElement(StudioStrip, { page, selectedSlotIndex: 0, onMask, onLook, onGuard })));
    expect(text()).toContain('Filter');
    expect(text()).not.toMatch(/\bLook\b|As shot|Worn/);
    expect(words()).toContain('Original');
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="preset-vintage"]')!.click());
    expect(onMask).toHaveBeenCalledWith(0, 'brushed');
    expect(onLook).toHaveBeenCalledWith(0, 'faded');
    expect(onGuard.mock.calls[0][0]).toMatch(/^Vintage/);
  });

  it('with no photo picked, the hint says filter, not look', () => {
    act(() => root.render(createElement(StudioStrip, { page: { ...page, slotFills: [null] }, selectedSlotIndex: 0, onMask: vi.fn(), onLook: vi.fn(), onGuard: vi.fn() })));
    expect(text()).toContain('filter');
    expect(text()).not.toMatch(/\blook\b/i);
  });
});
