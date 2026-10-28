/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE BEING EDITED, large: its picture drawn by the page renderer, what
   an empty frame or caption box offers (the website's "Click to add" boxes,
   which print leaves out), the selected element's outline, the parts'
   overlays, and the finger: a tap says where on the page it landed (page
   px, the renderer's own), a sideways swipe turns the page (previewPaging
   swipeTurn, as the Preview).

   Everything over the picture is drawn from the same targets the tap is
   tested against (hitTest.ts), scaled to the screen, so what is outlined is
   exactly what a tap there picks.

   TalkBack: the page is one picture, so each thing on it also gets a named,
   invisible button in its own box (`reach`): a TalkBack double tap on one
   does what a tap there does (onActivate → the screen's runTap). They let
   every finger touch through to the page, so taps and swipes work as before.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useRef, type ReactNode } from 'react';
import { ActivityIndicator, PanResponder, StyleSheet, Text, View, type ViewInstance, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { CHOOSER_TITLE, chooserListSizes } from '@web/pages/builder/chooserFit';
import { swipeTurn } from '@web/pages/builder/previewPaging';
import { colors } from '../lib/theme';
import type { Target } from './hitTest';

/** A tap moves less than this (screen px) or it is a drag. */
const TAP_SLOP = 10;

/** Where a target sits on the screen (its box scaled), turned as drawn. */
export function targetStyle(t: Target, k: number): ViewStyle {
  const { box } = t;
  const transform = [
    ...(t.rotation ? [{ rotate: `${t.rotation}deg` }] : []),
    ...(t.pivot === 'topLeft' && (t.scaleX !== 1 || t.scaleY !== 1) ? [{ scaleX: t.scaleX }, { scaleY: t.scaleY }] : []),
  ];
  return {
    position: 'absolute', left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k,
    ...(transform.length ? { transform, transformOrigin: t.pivot === 'topLeft' ? 'left top' : 'center' } : {}),
    ...(t.shape === 'ellipse' ? { borderRadius: (Math.max(box.w, box.h) * k) / 2 } : {}),
  };
}

/** An empty frame or caption box in the editor (BuilderPreview EmptyChooserBox):
 *  a dashed box saying what it takes, a dealt box's one invitation, or a "+". */
function EmptyHint({ t, k, options, roll }: { t: Target; k: number; options: string[]; roll: string | null }) {
  const w = t.box.w * k, h = t.box.h * k;
  const list = roll ? null : chooserListSizes(w, h, options);
  const rollSize = roll ? Math.min(Math.max(12, Math.min(28, Math.min(w, h) * 0.15)), (w - 24) / (roll.split(' ').reduce((a, b) => (b.length > a.length ? b : a), '').length * 0.72)) : 0;
  return (
    <View style={[targetStyle(t, k), styles.empty]} testID={`edit-empty-${t.key}`}>
      {roll && rollSize >= 10 && h - 24 >= rollSize * 2.2 ? (
        <Text style={[styles.emptyText, { fontSize: rollSize, lineHeight: rollSize * 1.2 }]}>{roll}</Text>
      ) : list ? (
        <>
          <Text style={[styles.emptyText, { fontSize: list.titleFs }]} numberOfLines={1}>{CHOOSER_TITLE}</Text>
          <View>
            {options.map((o) => <Text key={o} style={[styles.emptyItem, { fontSize: list.listFs, lineHeight: list.listFs * 1.5 }]}>{`•  ${o}`}</Text>)}
          </View>
        </>
      ) : (
        <View style={styles.plus}><Text style={styles.plusText}>+</Text></View>
      )}
    </View>
  );
}

export interface EmptyHintInfo { target: Target; options: string[]; roll: string | null }

/** A thing on the page for TalkBack: its name, and whether it is selected. */
export interface ReachInfo { target: Target; label: string; selected: boolean }

export function PageStage({ uri, busy, failed, width, height, pageWidth, hints, selected, overlay, note, onTap, onSwipe, reach = [], onActivate }: {
  /** The page's picture (file://), or null while it is first drawn. */
  uri: string | null;
  /** A newer picture is being drawn (the old one stays on show). */
  busy: boolean;
  failed: string | null;
  /** The page as shown, screen px. */
  width: number;
  height: number;
  /** The page in page px (the renderer's print px). */
  pageWidth: number;
  hints: EmptyHintInfo[];
  selected: Target | null;
  overlay?: ReactNode;
  /** A short line over the bottom of the page. */
  note: string | null;
  onTap: (x: number, y: number) => void;
  onSwipe: (dir: 'forward' | 'back') => void;
  /** Everything on the page, named for TalkBack (see the top of this file). */
  reach?: ReachInfo[];
  onActivate?: (target: Target) => void;
}) {
  const k = width / Math.max(1, pageWidth);
  const on = useRef({ onTap, onSwipe, k });
  on.current = { onTap, onSwipe, k };
  // Where the finger came down, on the page. Measured from the page's own
  // corner (pageX minus where the page is), not locationX: locationX is
  // relative to whichever view was touched, and a part's overlay inside the
  // page that lets a tap through would shift it.
  const stage = useRef<ViewInstance>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const measure = () => stage.current?.measure((_x, _y, _w, _h, pageX, pageY) => { origin.current = { x: pageX, y: pageY }; });
  const start = useRef({ pageX: 0, pageY: 0, x: 0, y: 0 });
  const finger = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // Never taken from an overlay mid-drag (a part's handle keeps its finger).
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: (e) => {
      const n = e.nativeEvent;
      start.current = { pageX: n.pageX, pageY: n.pageY, x: n.locationX, y: n.locationY };
      measure();
    },
    onPanResponderRelease: (_e, g) => {
      const s = swipeTurn(g.dx, g.dy);
      if (s) { on.current.onSwipe(s); return; }
      if (Math.abs(g.dx) >= TAP_SLOP || Math.abs(g.dy) >= TAP_SLOP) return;
      const o = origin.current, p = start.current;
      const x = o ? p.pageX - o.x : p.x, y = o ? p.pageY - o.y : p.y;
      on.current.onTap(x / on.current.k, y / on.current.k);
    },
    onPanResponderTerminationRequest: () => true,
  }), []);

  return (
    <View ref={stage} onLayout={measure} style={[styles.stage, { width, height }]} {...finger.panHandlers} testID="edit-page">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {uri ? (
          <Image source={{ uri }} style={{ width, height }} contentFit="fill" transition={0} cachePolicy="memory-disk" />
        ) : failed ? (
          <View style={styles.center}><Text style={styles.failed}>{failed}</Text></View>
        ) : (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        )}
        {busy && uri && <ActivityIndicator style={styles.busy} color={colors.accent} />}
        {hints.map((h) => <EmptyHint key={h.target.key} t={h.target} k={k} options={h.options} roll={h.roll} />)}
        {selected && <View style={[targetStyle(selected, k), styles.selected]} testID={`edit-selected-${selected.key}`} />}
      </View>
      {/* TalkBack's buttons, one per thing on the page, top-most last (as the
          tap picks). Invisible, and never in a finger's way. */}
      {reach.length > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="edit-page-reach">
          {reach.map((r) => (
            <View key={r.target.key} pointerEvents="none" style={targetStyle(r.target, k)}
              accessible accessibilityRole="button" accessibilityLabel={r.label} accessibilityState={{ selected: r.selected }}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate') onActivate?.(r.target); }}
              testID={`edit-reach-${r.target.key}`} />
          ))}
        </View>
      )}
      {overlay ? <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{overlay}</View> : null}
      {note ? (
        <View pointerEvents="none" style={styles.noteWrap}>
          <Text style={styles.note} testID="edit-note" accessibilityLiveRegion="polite">{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: '#FFFFFF', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { fontSize: 13, color: colors.muted, textAlign: 'center', padding: 8 },
  busy: { position: 'absolute', top: 8, right: 8 },
  empty: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(232,165,152,0.9)', borderRadius: 10,
    backgroundColor: 'rgba(253,232,228,0.5)', alignItems: 'center', justifyContent: 'center', padding: 6, overflow: 'hidden',
  },
  emptyText: { fontWeight: '800', color: '#A0562F', textAlign: 'center' },
  emptyItem: { fontWeight: '700', color: '#A0562F' },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', lineHeight: 30 },
  selected: { borderWidth: 3, borderColor: colors.accent },
  noteWrap: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  note: { maxWidth: '88%', backgroundColor: '#2D2D2D', color: '#FFF8F0', fontSize: 14, fontWeight: '500', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, textAlign: 'center', overflow: 'hidden' },
});
