/* ══════════════════════════════════════════════════════════════════════════
   THE SELECTED PHOTO ON THE FINGER: one finger moves it in its frame, two
   pinch it bigger or smaller (framing.ts does the arithmetic, the website's
   setters store it: actions.ts storeFraming).

   An overlay over the page (registry overlays) sized to the selected photo.
   It claims a touch only where that photo is the thing on top (a caption box
   or a title over it still gets its own tap), keeps its finger once it has
   it (a pinch's second finger can land anywhere), and hands a plain tap back
   to the page's own tap (hitTest → runTap), so a tap on the selected photo
   does what any tap on it does (a second tap puts it down: index.ts). A
   sideways swipe that could not move the photo turns the page, as the page
   itself does (previewPaging swipeTurn).

   While the finger works, the photo is shown here, drawn the way the page
   renderer will draw it (photoRect: slotPhotoRect, clipped to the photo's
   frame, turned with it); the page picture under it is drawn again from the
   stored framing, and this preview steps aside once that picture is on show
   (builder/pageShown.ts, said by usePagePicture), so the photo never jumps back.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import type { AlbumPage } from '@web/pages/builder/types';
import { swipeTurn } from '@web/pages/builder/previewPaging';
import { onPagePictureShown } from '../../builder/pageShown';
import { colors } from '../../lib/theme';
import { hitTest } from '../hitTest';
import { targetStyle } from '../PageStage';
import { runTap, type OverlayProps } from '../registry';
import { storeFraming } from './actions';
import { baseSize, frameCell, FramingGesture, photoRect, storedFraming, type Framing, type TouchPoint } from './framing';

/** After the page picture is on show, the time its image takes to appear. */
const SHOWN_DELAY_MS = 180;
/** The preview never stays longer than this after the finger is up. */
const SETTLE_MAX_MS = 2500;

const touchesOf = (e: GestureResponderEvent): TouchPoint[] =>
  (e.nativeEvent.touches?.length ? e.nativeEvent.touches : [e.nativeEvent]).map((t) => ({ x: t.pageX, y: t.pageY }));

export function FramingOverlay({ ctx, scale }: OverlayProps) {
  const t = ctx.selected?.kind === 'photo' ? ctx.selected : null;
  const { page, pageIndex } = ctx;
  const albumSize = ctx.builder.albumSize;
  const photo = t?.photoIndex != null ? ctx.builder.uploadedPhotos[t.photoIndex] : undefined;
  const cell = useMemo(() => (t ? frameCell(page, t.index, albumSize, pageIndex) : null), [t, page, albumSize, pageIndex]);
  // The photo's size as shown (upright, as the album keeps it). Without it
  // (never for a photo the phone opened) the photo takes taps only.
  const img = photo && photo.width > 0 && photo.height > 0 && photo.previewUrl ? { w: photo.width, h: photo.height } : null;

  // What the finger shows (null: nothing, the page picture is the photo).
  const [live, setLive] = useState<Framing | null>(null);
  const gesture = useRef<FramingGesture | null>(null);
  const tapAt = useRef<{ x: number; y: number } | null>(null);

  // The preview steps aside once the page it changed is on show.
  const settle = useRef<{ timers: ReturnType<typeof setTimeout>[]; off: () => void } | null>(null);
  const endSettle = () => {
    const s = settle.current;
    if (!s) return;
    s.timers.forEach(clearTimeout);
    s.off();
    settle.current = null;
  };
  const settleAfter = (before: AlbumPage) => {
    endSettle();
    const hide = () => { endSettle(); setLive(null); };
    const timers = [setTimeout(hide, SETTLE_MAX_MS)];
    const off = onPagePictureShown((shownPage) => { if (shownPage !== before) timers.push(setTimeout(hide, SHOWN_DELAY_MS)); });
    settle.current = { timers, off };
  };

  /** The page point under a touch on this view (locationX: from its corner). */
  const pointOf = (e: GestureResponderEvent, box: { x: number; y: number }, k: number) =>
    ({ x: box.x + e.nativeEvent.locationX / k, y: box.y + e.nativeEvent.locationY / k });

  const finish = (tapAllowed: boolean) => {
    const L = latest.current;
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.isTap) {
      setLive(null);
      const at = tapAt.current;
      const hit = tapAllowed && at ? hitTest(L.ctx.targets, at.x, at.y) : null;
      if (hit) runTap(hit, L.ctx);
      return;
    }
    const before = L.ctx.page;
    const changes = g.end();
    // Nothing left to store (a pinch back to where it was, or stored as a
    // finger came or went): the page already shows it. A sideways swipe that
    // could not move the photo (no room that way, e.g. a full-page photo of
    // the page's own shape) turns the page, as anywhere else on it.
    if (!L.t || !changes.length) {
      setLive(null);
      const travel = g.oneFingerTravel;
      const turn = travel ? swipeTurn(travel.dx, travel.dy) : null;
      const to = L.ctx.pageIndex + (turn === 'forward' ? 1 : -1);
      if (turn && to >= 0 && to < L.ctx.builder.albumPages.length) L.ctx.builder.goToPage(to);
      return;
    }
    storeFraming(L.ctx, L.t.index, changes);
    setLive({ zoom: g.live.zoom, pan: { ...g.live.pan } });
    settleAfter(before);
  };

  // The responder is made once; it reads everything through this.
  const latest = useRef({ ctx, t, cell, img, scale, finish });
  latest.current = { ctx, t, cell, img, scale, finish };

  // Another photo, another page, or the screen going: no preview.
  const key = t ? `${pageIndex}|${t.key}|${t.photoIndex}` : '';
  useEffect(() => { endSettle(); gesture.current = null; setLive(null); }, [key]);
  useEffect(() => () => endSettle(), []);

  const finger = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (e) => {
      const L = latest.current;
      if (!L.t) return false;
      const p = pointOf(e, L.t.box, L.scale);
      return hitTest(L.ctx.targets, p.x, p.y)?.key === L.t.key;
    },
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: (e) => {
      const L = latest.current;
      endSettle();
      gesture.current = null;
      if (!L.t) return;
      tapAt.current = pointOf(e, L.t.box, L.scale);
      if (!L.cell || !L.img) return;
      const g = new FramingGesture(L.img, L.cell, storedFraming(L.ctx.page, L.t.index, L.cell), L.scale);
      g.touches(touchesOf(e));
      gesture.current = g;
    },
    onPanResponderMove: (e) => {
      const g = gesture.current;
      const L = latest.current;
      if (!g || !L.t) return;
      const changes = g.touches(touchesOf(e));
      if (changes.length) storeFraming(L.ctx, L.t.index, changes);
      if (!g.isTap) setLive({ zoom: g.live.zoom, pan: { ...g.live.pan } });
    },
    onPanResponderRelease: () => latest.current.finish(true),
    onPanResponderTerminate: () => latest.current.finish(false),
    // A pinch's second finger may land on the page: this view keeps the gesture.
    onPanResponderTerminationRequest: () => false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  if (!t || !cell) return null;
  const shown = live && img ? (() => {
    const r = photoRect(img, cell, live);
    const base = baseSize(img, cell);
    // Drawn at its zoom-1 size about the photo's centre, then scaled (the
    // phone decodes the picture once, not at every step of a pinch).
    return { cx: (r.x + r.w / 2) * scale, cy: (r.y + r.h / 2) * scale, w: base.w * scale, h: base.h * scale, zoom: r.w / Math.max(1e-6, base.w) };
  })() : null;

  return (
    <View style={[targetStyle(t, scale), styles.hit]} {...finger.panHandlers} testID="photos-framing">
      {shown && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={{
            position: 'absolute',
            left: (cell.box.x - t.box.x) * scale, top: (cell.box.y - t.box.y) * scale,
            width: cell.box.w * scale, height: cell.box.h * scale,
            ...(cell.rotation ? { transform: [{ rotate: `${cell.rotation}deg` }] } : {}),
          }}>
            <Image
              source={{ uri: photo!.previewUrl }}
              style={{ position: 'absolute', left: shown.cx - shown.w / 2, top: shown.cy - shown.h / 2, width: shown.w, height: shown.h, transform: [{ scale: shown.zoom }] }}
              contentFit="fill" transition={0} cachePolicy="memory-disk"
            />
          </View>
          <View style={[StyleSheet.absoluteFill, styles.outline, t.shape === 'ellipse' && { borderRadius: (Math.max(t.box.w, t.box.h) * scale) / 2 }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { overflow: 'hidden' },
  outline: { borderWidth: 3, borderColor: colors.accent },
});
