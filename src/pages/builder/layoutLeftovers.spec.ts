// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   A LAYOUT CHANGE ASKS BEFORE IT TAKES PHOTOS OFF A PAGE (1-star testers
   round 3, the Indecisive One; confirmed by the checker): "Change layout →
   Full Page" on a 3-photo page left 2 photos out of the album without a word
   (50 uploaded, 48 placed, still 40 pages), and the old quote stayed: the
   editor drew it over the photo, the preview hid it, and the print drew it as
   loose text where it once sat. Now the picker asks: a new page after this
   one, or out of the album; and a caption with no box goes with its layout.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { relayPageOnTemplate, layoutChangeLeftovers } from './useBuilderState';
import { getTemplateById, getTemplatesForAlbum, photoSlotCount } from './pageTemplates';
import LayoutPicker from './LayoutPicker';
import type { AlbumPage } from './types';

const squares8 = getTemplatesForAlbum('8x8');
const threeWithBox = squares8.find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))!;
const fullPage = getTemplateById('t88-fb-solo')!;

/** The tester's page 37: three photos and the quote "Taking the scenic route". */
function threePhotoPage(): AlbumPage {
  return relayPageOnTemplate({
    id: 'p37', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [],
    textElements: [{ id: 'q', boxIndex: 0, text: 'Taking the scenic route', x: 0, y: 0, fontSize: 28, fontFamily: 'Georgia', color: '#2D2D2D', bold: false, italic: true, underline: false, alignment: 'center' }],
    templateId: threeWithBox.id, slotFills: [36, 37, 38],
  } as unknown as AlbumPage, threeWithBox);
}

describe('what a layout change takes off a page', () => {
  it('Full Page on the 3-photo page: the 2 photos that don\'t fit, and the quote', () => {
    expect(threeWithBox).toBeTruthy();
    const page = threePhotoPage();
    expect(layoutChangeLeftovers(page, fullPage)).toEqual({ photos: [37, 38], captions: 1 });
  });
  it('the caption goes with the layout that had its box (it printed as loose text over the photo)', () => {
    const relaid = relayPageOnTemplate(threePhotoPage(), fullPage);
    expect(relaid.textElements).toEqual([]);
  });
  it('a layout that holds everything takes nothing off', () => {
    expect(layoutChangeLeftovers(threePhotoPage(), threeWithBox)).toEqual({ photos: [], captions: 0 });
  });
});

/* ── the picker asks ── */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let actions: Record<string, unknown> & { applyPageLayout: ReturnType<typeof vi.fn>; setLayoutPickerOpen: ReturnType<typeof vi.fn> };
beforeEach(() => {
  const page = threePhotoPage();
  actions = {
    layoutPickerOpen: true, currentPageIndex: 36, albumSize: '8x8',
    albumPages: Object.assign([], { 36: page }) as AlbumPage[],
    uploadedPhotos: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, previewUrl: '', name: `${i}.jpg`, type: 'image/jpeg', size: 1, width: 1200, height: 1200 })),
    availableTemplatesForCurrentPage: () => [threeWithBox, fullPage],
    layoutChangeLoses: (id: string) => {
      const left = layoutChangeLeftovers(page, getTemplateById(id)!);
      return { photos: left.photos.length, captions: left.captions };
    },
    applyPageLayout: vi.fn(),
    setLayoutPickerOpen: vi.fn(),
  };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(createElement(LayoutPicker, { actions } as never)));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const layoutButton = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!;
const tap = (el: Element | null) => act(() => { (el as HTMLButtonElement).click(); });
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);

describe('the layout picker', () => {
  it('Full Page asks first: 2 photos don\'t fit, where should they go; the quote goes with the old layout', () => {
    tap(layoutButton(fullPage.name));
    expect(actions.applyPageLayout).not.toHaveBeenCalled();
    expect(q('layout-leftover-photos')!.textContent).toContain('2 photos on this page don’t fit it. Where should they go?');
    expect(q('layout-leftover-captions')!.textContent).toContain('no box for the caption');
  });
  it('"Put them on a new page after this one" applies it, keeping them in the album', () => {
    tap(layoutButton(fullPage.name));
    tap(q('layout-leftover-new-page'));
    expect(actions.applyPageLayout).toHaveBeenCalledWith(fullPage.id, 'new-page');
    expect(actions.setLayoutPickerOpen).toHaveBeenCalledWith(false);
  });
  it('"Take them out of the album" is a choice too', () => {
    tap(layoutButton(fullPage.name));
    tap(q('layout-leftover-leave-out'));
    expect(actions.applyPageLayout).toHaveBeenCalledWith(fullPage.id, 'leave-out');
  });
  it('"Choose another layout" goes back, nothing applied', () => {
    tap(layoutButton(fullPage.name));
    tap(q('layout-leftover-back'));
    expect(actions.applyPageLayout).not.toHaveBeenCalled();
    expect(q('layout-leftover')).toBeNull();
  });
});
