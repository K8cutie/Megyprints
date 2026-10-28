// @vitest-environment jsdom
/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S HALF OF THE EDIT PARITY CHECK (see EDIT_PLAN in scenarios.ts).

     npx vitest run --config tools/parity/vitest.edits.config.ts   (from the repo root)

   SCENARIOS[0]'s album made exactly as webAlbums.spec.ts makes it (the same
   made-up device pieces), then EDIT_PLAN's edits, each the call the
   website's editor makes for it:
     • Remove photo: PageView onRemoveFromSlot → clearSlot(slot) (MobileReview);
     • "Add a photo": fillSlot(slot, photoIndex) (MobileReview replaceSlot);
     • move and zoom: setSlotOffset(slot, dx, dy), setSlotScale(slot, zoom)
       (PropertiesPanel);
     • Change layout: availableTemplatesForCurrentPage, layoutChangeLoses,
       applyPageLayout(id) (LayoutPicker);
     • the text editor's Done: setBoxText(box, content), content shaped as
       MobileTextEditor save() shapes it;
     • Page colour: setPageColor(hex) (PageColorPicker);
     • the cover (CoverEditor, cover scope on): setBoxText(0, { text, ...patch })
       for the font, colour, Bold, Shadow; setBackgroundCrop({ focusX, focusY });
       setBoxTextOffset(0, ox, oy);
     • "Add a page": addPage() (Megy's "add a page").
   Writes tools/parity/out/web-edits.json.
   ══════════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

const scenarioPhotos = vi.hoisted(() => new Map<string, { width: number; height: number; capturedAt: number | null }>());

vi.mock('../../src/lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  supabaseConfigured: false,
}));
vi.mock('../../src/lib/useAlbumSync', async (importOriginal) => {
  const sync = {
    save: async () => ({ success: true }), load: async () => null, loadAll: async () => [],
    deleteAlbum: async () => ({ success: true }), loading: false, error: null, clearError: () => {},
  };
  return { ...(await importOriginal<Record<string, unknown>>()), useAlbumSync: () => sync };
});
vi.mock('../../src/lib/useIndexedDBPhotos', () => {
  const kept = new Map<string, { id: string; name: string; type: string; size: number; width: number; height: number }>();
  const measure = (name: string) => scenarioPhotos.get(name) ?? { width: 0, height: 0 };
  const idb = {
    store: async (file: File, id?: string) => {
      const key = id ?? `local-${kept.size}`;
      const { width, height } = measure(file.name);
      const rec = { id: key, name: file.name, type: file.type, size: file.size, width, height };
      kept.set(key, rec);
      return { ...rec, storedAt: '' };
    },
    get: async (id: string) => { const r = kept.get(id); return r ? { ...r, url: `blob:kept/${id}`, storedAt: '', blob: new Blob() } : null; },
    getMany: async () => new Map(),
    deletePhoto: async (id: string) => { kept.delete(id); },
    deleteMany: async (ids: string[]) => { ids.forEach((id) => kept.delete(id)); },
    list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async (file: File) => { const m = measure(file.name); return { width: m.width, height: m.height }; } };
});
vi.mock('../../src/pages/builder/exif', () => ({
  readCaptureTime: async (file: File) => scenarioPhotos.get(file.name)?.capturedAt ?? null,
}));
vi.mock('../../src/pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, type BuilderActions } from '../../src/pages/builder/useBuilderState';
import { writeAlbumTheme } from '../../src/lib/albumTheme';
import { getTemplateById } from '../../src/pages/builder/pageTemplates';
import { contrastOutline, WORDART_OUTLINE_WIDTH } from '../../src/pages/builder/wordArtRules';
import { EDIT_PLAN, editedAlbum, SCENARIOS, seeded } from './scenarios';

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const step = async (fn: () => void) => { await act(async () => { fn(); }); await settle(); };
const firstFilled = (i: number) => (builder.albumPages[i].slotFills ?? []).findIndex((f) => f != null);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let n = 0;
  Object.defineProperty(URL, 'createObjectURL', { value: () => `blob:session/${++n}`, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
  localStorage.clear();
  sessionStorage.clear();
});

describe("the website's editors edit SCENARIOS[0]'s album", () => {
  it('writes the edited album for the app to be compared with', async () => {
    const sc = SCENARIOS[0];
    scenarioPhotos.clear();
    for (const p of sc.photos) scenarioPhotos.set(p.name, p);
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(Probe)); });
    await settle();
    await act(async () => { builder.setAlbumTitle(sc.title); writeAlbumTheme(sc.occasion); });
    await act(async () => { builder.setAlbumSize(sc.size); });
    const files = sc.photos.map((p) => new File([new Uint8Array(8)], p.name, { type: 'image/jpeg' }));
    for (const [i, f] of files.entries()) Object.defineProperty(f, 'size', { value: sc.photos[i].size });
    await act(async () => { builder.addPhotos(files); });
    for (let i = 0; i < 50 && builder.uploadedPhotos.some((p) => !(p.width > 0)); i++) await settle();
    const cover = builder.uploadedPhotos.find((p) => p.name === sc.cover)!;
    await act(async () => { builder.setCoverToPhoto(cover.id); });
    const spy = vi.spyOn(Math, 'random').mockImplementation(seeded(sc.seed));
    try { await act(async () => { await builder.generateAlbum(); }); } finally { spy.mockRestore(); }
    await settle();
    const before = editedAlbum(builder);
    const steps: string[] = [];

    // Remove photo, then "Add a photo" into that frame with another page's first photo.
    const R = EDIT_PLAN.remove;
    await step(() => builder.goToPage(R.page));
    const slot = firstFilled(R.page);
    await step(() => builder.clearSlot(slot));
    const from = builder.albumPages[R.fromPage].slotFills![firstFilled(R.fromPage)]!;
    await step(() => builder.fillSlot(slot, from));
    steps.push(`page ${R.page + 1}: frame ${slot} emptied, then filled with photo ${from} from page ${R.fromPage + 1}`);

    // Move and zoom.
    const F = EDIT_PLAN.frame;
    await step(() => builder.goToPage(F.page));
    const fslot = firstFilled(F.page);
    await step(() => builder.setSlotOffset(fslot, F.dx, F.dy));
    await step(() => builder.setSlotScale(fslot, F.zoom));
    steps.push(`page ${F.page + 1}: frame ${fslot} moved ${F.dx},${F.dy} and zoomed ${F.zoom}`);

    // Change layout: the first other layout that takes nothing off the page.
    await step(() => builder.goToPage(EDIT_PLAN.layout.page));
    const now = builder.albumPages[EDIT_PLAN.layout.page].templateId;
    const t = builder.availableTemplatesForCurrentPage().find((x) => {
      if (x.id === now) return false;
      const l = builder.layoutChangeLoses(x.id);
      return l.photos === 0 && l.captions === 0;
    })!;
    await step(() => builder.applyPageLayout(t.id));
    steps.push(`page ${EDIT_PLAN.layout.page + 1}: layout ${now} -> ${t.id}`);

    // The text editor's Done on the first caption box from EDIT_PLAN.caption.from on.
    const C = EDIT_PLAN.caption;
    const at = builder.albumPages.findIndex((p, i) => i >= C.from && (p.templateId ? getTemplateById(p.templateId)?.textSlots?.length ?? 0 : 0) > 0);
    await step(() => builder.goToPage(at));
    const outline = false;
    const shadow = false;
    await step(() => builder.setBoxText(0, {
      text: C.text, fontSize: C.fontSize, fontFamily: C.fontFamily, color: C.color, bold: C.bold, italic: false, underline: false, alignment: C.alignment,
      outlineColor: outline ? contrastOutline(C.color) : undefined,
      outlineWidth: outline ? WORDART_OUTLINE_WIDTH : undefined,
      shadow: shadow || undefined,
    }));
    steps.push(`page ${at + 1}: caption box 0 written`);

    // Page colour.
    await step(() => builder.goToPage(EDIT_PLAN.colour.page));
    await step(() => builder.setPageColor(EDIT_PLAN.colour.hex));
    steps.push(`page ${EDIT_PLAN.colour.page + 1}: colour ${EDIT_PLAN.colour.hex}`);

    // The cover (CoverEditor: the cover scope on while it is open; updateTitle
    // sends the title's words with each patch).
    const V = EDIT_PLAN.cover;
    await step(() => builder.setEditScope('coverFront'));
    const titleEl = () => builder.coverFront.textElements.find((x) => x.boxIndex === 0);
    const titleText = () => titleEl()?.text ?? '';
    await step(() => builder.setBoxText(0, { text: titleText(), fontFamily: V.font }));
    await step(() => builder.setBoxText(0, { text: titleText(), color: V.color }));
    await step(() => builder.setBoxText(0, { text: titleText(), bold: !(titleEl()?.bold ?? true) }));
    await step(() => builder.setBoxText(0, { text: titleText(), shadow: titleEl()?.shadow !== false ? false : undefined }));
    await step(() => builder.setBackgroundCrop({ focusX: V.focus.x, focusY: V.focus.y }));
    await step(() => builder.setBoxTextOffset(0, 0, V.titleUp));
    await step(() => builder.setEditScope('interior'));
    steps.push('cover: title font, colour, Bold off, Shadow off, moved up; photo moved in its frame');

    // "Add a page".
    await step(() => builder.goToPage(EDIT_PLAN.addAfter));
    await step(() => builder.addPage());
    steps.push(`a page added after page ${EDIT_PLAN.addAfter + 1}`);

    const out = { note: 'Made by tools/parity/webEdits.spec.ts. Do not edit.', madeAt: new Date().toISOString(), steps, before, after: editedAlbum(builder) };
    const dir = path.join(__dirname, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'web-edits.json'), JSON.stringify(out, null, 1));
    expect(steps).toHaveLength(7);
    await act(async () => { root.unmount(); });
  }, 120_000);
});
