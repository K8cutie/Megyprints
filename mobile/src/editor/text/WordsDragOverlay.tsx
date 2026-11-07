/* ══════════════════════════════════════════════════════════════════════════
   WORDS PLACED BY HAND, ON THE FINGER (owner, 2026-11-07: "adding text on a
   photo"): one finger moves them anywhere on the page, and a tap opens them
   in Edit text (the page's own tap: runTap).

   An overlay over the page (registry overlays), one handle per placed words,
   the size of their letters (hitTest's target for them), so a touch anywhere
   else still goes to the photo or the page. A handle keeps its finger once it
   has it, so a sideways drag on words moves them rather than turning the page.

   They never leave the safe print area (freeWords.wordsSafeArea: 0.25" from
   the trim, 1/2" from the spine): while they move, the area is drawn as a
   dotted line, the words stop at it, and the first times they do, a line
   says why (owner's risk: words too close to an edge are cut off when the
   album is trimmed).

   While the finger moves, the page is shown without these words (drawn ahead
   at the lowest priority, so it is usually there before the finger moves),
   and the words over it where the finger has them (LiveWords). One change
   goes to the album when the finger lets go (updateTextElement: one undo
   step); the live view stays until the page is drawn with it.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import type { AlbumPage, TextElement } from '@web/pages/builder/types';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { clampWords, isPlacedWords, wordsSafeArea } from '@web/pages/builder/freeWords';
import { onPagePictureShown } from '../../builder/pageShown';
import { PRIORITY, usePagePicture } from '../../builder/usePagePicture';
import { colors } from '../../lib/theme';
import type { Target } from '../hitTest';
import { editorPictureWidth } from '../pagePictureWidth';
import { targetStyle } from '../PageStage';
import { runTap, type EditorContext, type OverlayProps } from '../registry';
import { LiveWords } from './LiveWords';
import { SAFE_LINE } from './words';

/** A finger moving less than this (screen px) is a tap. */
export const WORDS_TAP_SLOP = 10;
/** After the page picture is on show, the time its image takes to appear. */
const SHOWN_DELAY_MS = 180;
/** The live view never stays longer than this after the finger is up. */
const SETTLE_MAX_MS = 2500;
/** The safe line is explained this many times a run. */
const SAFE_LINE_TELLS = 2;
let safeLineTold = 0;

/** The page without these words (what shows under them while they move). */
export function pageWithoutWords(page: AlbumPage, id: string): AlbumPage {
  return { ...page, textElements: (page.textElements ?? []).filter((t) => t.id !== id) };
}

/** Where the words go for a finger that moved (dx, dy) screen px from `from`,
 *  kept in the safe area; `stopped`: the area held them back. */
export function draggedTo(el: TextElement, from: { x: number; y: number }, dx: number, dy: number, k: number, ctx: Pick<EditorContext, 'platform' | 'builder' | 'pageIndex'>, coverMode = false): { x: number; y: number; stopped: boolean } {
  const want = { ...el, x: from.x + dx / k, y: from.y + dy / k };
  const kept = clampWords(want, ctx.platform.textMeasurer(), wordsSafeArea(ctx.builder.albumSize, ctx.pageIndex, coverMode));
  return { x: kept.x, y: kept.y, stopped: kept.x !== want.x || kept.y !== want.y };
}

type Drag = { id: string; from: { x: number; y: number }; x: number; y: number; moving: boolean; settling: boolean };

export function WordsDragOverlay({ ctx, scale, width }: OverlayProps) {
  const { page, pageIndex, builder, text } = ctx;
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { width: uiW } = getCanvasDimensions(builder.albumSize);
  const k = width / Math.max(1, uiW); // screen px per design px
  const placed = (page.textElements ?? []).filter(isPlacedWords);
  const handles = ctx.targets.filter((t) => t.kind === 'freeText' && placed.some((w) => w.id === t.textId));

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setBoth = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  // The page without the words a finger may take: the one moving, else the
  // last placed (made ahead, so it is there when the finger moves).
  const armed = drag?.id ?? placed[placed.length - 1]?.id ?? null;
  const bareFor = useMemo(() => (armed ? pageWithoutWords(page, armed) : null), [page, armed]);
  const bare = usePagePicture(text, bareFor ? {
    page: bareFor, pageIndex, albumSize: builder.albumSize, photos: builder.uploadedPhotos, width: editorPictureWidth(screenW, screenH),
  } : null, drag ? PRIORITY.editing : PRIORITY.ahead);

  // The live view steps aside once the page is drawn with the words where they were left.
  const settle = useRef<{ timers: ReturnType<typeof setTimeout>[]; off: () => void } | null>(null);
  const endSettle = () => {
    const s = settle.current;
    if (!s) return;
    s.timers.forEach(clearTimeout);
    s.off();
    settle.current = null;
  };
  const settleAt = (id: string, x: number, y: number) => {
    endSettle();
    const hide = () => { endSettle(); setBoth(null); };
    const timers = [setTimeout(hide, SETTLE_MAX_MS)];
    const off = onPagePictureShown((shown) => {
      if (shown.textElements?.some((t) => t.id === id && t.x === x && t.y === y)) timers.push(setTimeout(hide, SHOWN_DELAY_MS));
    });
    settle.current = { timers, off };
  };
  useEffect(() => () => endSettle(), []);
  // Another page: nothing moving.
  useEffect(() => { endSettle(); setBoth(null); }, [pageIndex]);

  const latest = useRef({ ctx, k, placed });
  latest.current = { ctx, k, placed };
  const told = useRef(false);

  const start = (t: Target) => {
    const el = latest.current.placed.find((w) => w.id === t.textId);
    if (!el) return;
    endSettle();
    told.current = false;
    setBoth({ id: el.id, from: { x: el.x, y: el.y }, x: el.x, y: el.y, moving: false, settling: false });
  };
  const move = (dx: number, dy: number) => {
    const d = dragRef.current;
    const L = latest.current;
    const el = d && L.placed.find((w) => w.id === d.id);
    if (!d || !el || d.settling) return;
    if (!d.moving && Math.abs(dx) < WORDS_TAP_SLOP && Math.abs(dy) < WORDS_TAP_SLOP) return;
    const to = draggedTo(el, d.from, dx, dy, L.k, L.ctx);
    if (to.stopped && !told.current && safeLineTold < SAFE_LINE_TELLS) { told.current = true; safeLineTold++; L.ctx.say(SAFE_LINE); }
    setBoth({ ...d, x: to.x, y: to.y, moving: true });
  };
  const end = (t: Target, tapAllowed: boolean) => {
    const d = dragRef.current;
    const L = latest.current;
    if (!d || d.settling) return;
    if (!d.moving) {
      setBoth(null);
      if (tapAllowed) runTap(t, L.ctx);
      return;
    }
    if (d.x === d.from.x && d.y === d.from.y) { setBoth(null); return; }
    L.ctx.builder.updateTextElement(d.id, { x: d.x, y: d.y });
    setBoth({ ...d, settling: true });
    settleAt(d.id, d.x, d.y);
  };

  const moving = drag ? placed.find((w) => w.id === drag.id) : undefined;
  const area = wordsSafeArea(builder.albumSize, pageIndex);
  const showLive = !!(drag && moving && (drag.moving || drag.settling));
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="words-overlay">
      {showLive && bare.uri && (
        <Image source={{ uri: bare.uri }} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} cachePolicy="memory-disk" testID="words-bare-page" />
      )}
      {showLive && drag!.moving && (
        <View pointerEvents="none" testID="words-safe-line"
          style={[styles.safe, { left: area.x * k, top: area.y * k, width: area.w * k, height: area.h * k }]} />
      )}
      {showLive && <LiveWords words={moving!} x={drag!.x} y={drag!.y} k={k} text={text} testID="words-live" />}
      {handles.map((t) => <Handle key={t.key} target={t} scale={scale} onStart={start} onMove={move} onEnd={end} />)}
    </View>
  );
}

function Handle({ target, scale, onStart, onMove, onEnd }: {
  target: Target;
  /** Screen px per page px. */
  scale: number;
  onStart: (t: Target) => void;
  onMove: (dx: number, dy: number) => void;
  onEnd: (t: Target, tapAllowed: boolean) => void;
}) {
  const on = useRef({ target, onStart, onMove, onEnd });
  on.current = { target, onStart, onMove, onEnd };
  const finger = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // Only a finger that comes down on the words: a page swipe passing over them stays a page swipe.
    onMoveShouldSetPanResponder: () => false,
    // The finger stays with the words once they have it (no swipe takes it).
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => on.current.onStart(on.current.target),
    onPanResponderMove: (_e, g) => on.current.onMove(g.dx, g.dy),
    onPanResponderRelease: () => on.current.onEnd(on.current.target, true),
    onPanResponderTerminate: () => on.current.onEnd(on.current.target, false),
  }), []);
  return <View style={targetStyle(target, scale)} {...finger.panHandlers} testID={`words-handle-${target.textId}`} />;
}

const styles = StyleSheet.create({
  safe: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accent, borderRadius: 2 },
});
