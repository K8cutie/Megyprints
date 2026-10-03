import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderTemplateSlots, nextRenderId } from './useCanvasEngine';
import { getTemplateById } from './pageTemplates';
import type { FabricCanvas } from './fabric-types';
import type { FrameStyle, UploadedPhoto } from './types';
import type { MaskId } from './masks';
import type { LookId } from './looks';

/* A photo with a look, a soft edge or a textured edge is BAKED into one image
   in the desktop editor (Fabric clips carry no alpha and its filters are not
   the CSS ones). Only the IMAGE may differ from a plain photo: the frame
   Studio moves and resizes, what follows it mid-drag, the border and the
   decorative frame are the same. Until 2026-10-01 the bake returned before any
   of them — a styled photo could be re-styled on desktop but never moved.
   The renderer runs for real here, against a stand-in for Fabric. */

// Textured edges load a PNG; the spec decides when it lands.
const texture = vi.hoisted(() => ({ pending: [] as ((tex: unknown) => void)[] }));
vi.mock('./masks', async (importOriginal) => {
  const real = await importOriginal<typeof import('./masks')>();
  return { ...real, loadMaskTexture: () => new Promise((resolve) => { texture.pending.push(resolve); }) };
});

type Props = Record<string, unknown>;
type PixelSource = { width: number; height: number };

class Fake {
  [key: string]: unknown;
  type = 'object';
  left = 0;
  top = 0;
  width = 0;
  height = 0;
  scaleX = 1;
  scaleY = 1;
  strokeWidth = 0;
  slotId?: string;
  clipPath?: Fake;
  canvas?: FakeCanvas;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(props: Props = {}) { Object.assign(this, props); }
  set(key: string | Props, value?: unknown) {
    if (typeof key === 'string') this[key] = value; else Object.assign(this, key);
    return this;
  }
  on(event: string, fn: () => void) { (this.listeners[event] ??= []).push(fn); }
  fire(event: string) { for (const fn of this.listeners[event] ?? []) fn(); }
  listens(event: string) { return (this.listeners[event] ?? []).length > 0; }
  bringToFront() { this.canvas?.bringToFront(this); }
  sendToBack() { this.canvas?.sendToBack(this); }
  setControlsVisibility() {}
  // Fabric's scaled size includes the outline
  getScaledWidth() { return (this.width + this.strokeWidth) * this.scaleX; }
  getScaledHeight() { return (this.height + this.strokeWidth) * this.scaleY; }
}
class FakeRect extends Fake { type = 'rect'; }
class FakeCircle extends Fake {
  type = 'circle';
  constructor(props: Props) { super(props); this.width = this.height = 2 * Number(props.radius); }
}
class FakeEllipse extends Fake {
  type = 'ellipse';
  constructor(props: Props) { super(props); this.width = 2 * Number(props.rx); this.height = 2 * Number(props.ry); }
}
class FakePath extends Fake {
  type = 'path';
  constructor(_d: string, props: Props = {}) { super(props); }
}
class FakePolygon extends Fake {
  type = 'polygon';
  constructor(_points: unknown, props: Props = {}) { super(props); }
}
class FakeShadow { constructor(props: Props) { Object.assign(this, props); } }
class FakeImage extends Fake {
  type = 'image';
  element: PixelSource;
  constructor(element: PixelSource, props: Props = {}) {
    super(props);
    this.element = element;
    this.width = element.width;
    this.height = element.height;
  }
  getElement() { return this.element; }
  /** Photos "load" when the spec runs these. */
  static loads: (() => unknown)[] = [];
  static fromURL(_url: string, done: (img: FakeImage, failed: boolean) => unknown) {
    FakeImage.loads.push(() => done(new FakeImage({ width: 800, height: 600 }), false));
  }
}
class FakeCanvas {
  objects: Fake[] = [];
  getObjects() { return this.objects; }
  add(...objs: Fake[]) { for (const o of objs) { o.canvas = this; this.objects.push(o); } }
  remove(...objs: Fake[]) { this.objects = this.objects.filter((o) => !objs.includes(o)); }
  bringToFront(o: Fake) { this.remove(o); this.objects.push(o); }
  sendToBack(o: Fake) { this.remove(o); this.objects.unshift(o); }
  requestRenderAll() {}
  renderAll() {}
}
const fab = { Rect: FakeRect, Circle: FakeCircle, Ellipse: FakeEllipse, Path: FakePath, Polygon: FakePolygon, Image: FakeImage, Shadow: FakeShadow };

// The bake's offscreen canvas: pixels are all transparent, which the look skips.
const context2d = () => ({
  globalCompositeOperation: 'source-over', fillStyle: '' as unknown,
  save() {}, restore() {}, fillRect() {}, drawImage() {}, putImageData() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
});
beforeAll(() => { vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: context2d }) }); });
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => { texture.pending.length = 0; });

const TEMPLATE = getTemplateById('t88-solo-square');
const PHOTOS: UploadedPhoto[] = [{ id: 'p0', previewUrl: 'blob:photo-0', name: 'p0.jpg', type: 'image/jpeg', size: 1, width: 800, height: 600 }];

/** Page 3 of an 8x8 album, one photo, Studio on, a 6px border. */
function renderSlot({ mask = null, look = null, frameStyle = 'none' }: { mask?: MaskId | null; look?: LookId | null; frameStyle?: FrameStyle }) {
  const canvas = new FakeCanvas();
  const onContainerModified = vi.fn();
  FakeImage.loads = [];
  renderTemplateSlots(
    fab, canvas as unknown as FabricCanvas, TEMPLATE, [0], [], [], [], undefined, PHOTOS, 750, 750, () => {},
    nextRenderId(), true, '8x8', 2, onContainerModified, '#B85C38', 6, 'solid', frameStyle,
    undefined, undefined, undefined, undefined, undefined, undefined, false, [mask], [look],
  );
  const loaded = Promise.all(FakeImage.loads.map((load) => load()));
  return { canvas, onContainerModified, loaded };
}
const part = (canvas: FakeCanvas, name: string) => canvas.objects.find((o) => o.slotId === `template-slot-${name}-0`);
const pieces = (canvas: FakeCanvas) => canvas.objects.map((o) => o.slotId);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a baked photo keeps its frame (desktop Studio)', () => {
  it('the template the spec draws on is the solo square', () => {
    expect(TEMPLATE?.id).toBe('t88-solo-square');
    expect(TEMPLATE?.fullBleed).toBeFalsy();
  });

  it('a look draws every piece a plain photo gets, in the same order — only the image is the bake', async () => {
    for (const frameStyle of ['none', 'polaroid', 'double', 'thin'] as const) {
      const plain = renderSlot({ frameStyle });
      await plain.loaded;
      const bw = renderSlot({ look: 'bw', frameStyle });
      await bw.loaded;
      expect(pieces(bw.canvas), frameStyle).toEqual(pieces(plain.canvas));
      const frame = part(bw.canvas, 'border')!;
      expect(frame.selectable).toBe(true);
      expect(frame.studioSlotIndex).toBe(0);
      expect(frame.listens('moving') && frame.listens('modified')).toBe(true);
      expect(frame.strokeWidth).toBe(6);
      const baked = part(bw.canvas, 'photo') as FakeImage;
      const raw = part(plain.canvas, 'photo') as FakeImage;
      expect(baked.getElement()).not.toBe(raw.getElement()); // drawn from the offscreen bake
      expect(baked.slotIndex).toBe(0);
      // the same centre and the same shape clip as the raw image it replaces
      expect([baked.left, baked.top]).toEqual([raw.left, raw.top]);
      expect([baked.clipPath?.type, baked.clipPath?.left, baked.clipPath?.top]).toEqual([raw.clipPath?.type, raw.clipPath?.left, raw.clipPath?.top]);
    }
  });

  it('dragging its frame moves the bake, its clip, its shadow and its mat — and the drop saves the same box a plain photo saves', async () => {
    const styled = renderSlot({ look: 'sepia', frameStyle: 'polaroid' });
    await styled.loaded;
    const frame = part(styled.canvas, 'border')!;
    const photo = part(styled.canvas, 'photo')!;
    const followers = [frame, photo, photo.clipPath!, part(styled.canvas, 'shadow')!, part(styled.canvas, 'frame')!];
    const start = followers.map((o) => [o.left, o.top]);
    frame.set({ left: frame.left + 40, top: frame.top + 25 });
    frame.fire('moving');
    followers.forEach((o, k) => {
      expect(o.left).toBeCloseTo(start[k][0] + 40, 6);
      expect(o.top).toBeCloseTo(start[k][1] + 25, 6);
    });
    frame.fire('modified');

    const plain = renderSlot({ frameStyle: 'polaroid' });
    await plain.loaded;
    const plainFrame = part(plain.canvas, 'border')!;
    plainFrame.fire('modified'); // dropped where it was
    plainFrame.set({ left: plainFrame.left + 40, top: plainFrame.top + 25 });
    plainFrame.fire('modified');
    const [still, moved] = plain.onContainerModified.mock.calls.map((c) => c[1]);
    expect(styled.onContainerModified).toHaveBeenCalledTimes(1);
    expect(styled.onContainerModified.mock.calls[0]).toEqual([0, moved]);
    // a move, not a resize
    expect(moved.width).toBeCloseTo(still.width, 9);
    expect(moved.height).toBeCloseTo(still.height, 9);
    expect(moved.x).toBeGreaterThan(still.x);
    expect(moved.y).toBeGreaterThan(still.y);
  });

  it('a look on a circle is still a circle: the bake keeps the shape clip (print clips its bake too)', async () => {
    const r = renderSlot({ mask: 'circle', look: 'bw' });
    await r.loaded;
    expect(part(r.canvas, 'photo')!.clipPath?.type).toBe('circle');
    expect(part(r.canvas, 'border')!.type).toBe('circle');
  });

  it('a masked photo draws no outline, no decorative frame and no grey box behind it — styled or not — and still moves', async () => {
    for (const [mask, look] of [['circle', null], ['circle', 'warm'], ['soft', null], ['fade-bottom', 'bw'], ['heart', 'sepia']] as const) {
      const r = renderSlot({ mask, look, frameStyle: 'polaroid' });
      await r.loaded;
      expect(pieces(r.canvas), `${mask}/${look}`).toEqual(['template-slot-photo-0', 'template-slot-border-0']);
      expect(part(r.canvas, 'border')!.strokeWidth).toBe(0);
      expect(part(r.canvas, 'border')!.listens('moving')).toBe(true);
    }
  });

  it('a textured edge draws nothing until its texture lands, then the photo and its frame together', async () => {
    const r = renderSlot({ mask: 'deckle', look: 'faded' });
    await tick();
    expect(r.canvas.objects).toEqual([]);
    texture.pending.shift()!({ width: 1800, height: 1800 });
    await r.loaded;
    expect(pieces(r.canvas)).toEqual(['template-slot-photo-0', 'template-slot-border-0']);
    expect(part(r.canvas, 'border')!.listens('moving')).toBe(true);
  });

  it('a page turn while the texture loads: the old render never draws', async () => {
    const r = renderSlot({ mask: 'frost' });
    await tick();
    nextRenderId(); // the customer turned the page
    texture.pending.shift()!({ width: 1800, height: 1800 });
    await r.loaded;
    expect(r.canvas.objects).toEqual([]);
  });
});
