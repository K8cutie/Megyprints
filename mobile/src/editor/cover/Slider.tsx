/* A slider for the cover editor (the website's <input type="range">: the
   photo's zoom, the title's size). React Native has none built in, and
   Gesture Handler is off in this app, so it is a PanResponder on a 48 dp
   band: touch anywhere on it to jump there, drag to slide. TalkBack can move
   it a step at a time (adjustable, increment / decrement).

   `onSlide` is called while the finger moves, at most every SLIDE_MS (each
   call is an album change, and a cover picture drawn again); `onDone` once
   when it lets go, with the final value. The slider shows the finger's value
   while it moves, whatever the album says. `onActive` says when a finger is
   on it, so a screen can stop its scrolling meanwhile (Android's scroll view
   would otherwise take a slide that wobbles up or down). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { colors } from '../../lib/theme';

const SLIDE_MS = 90;
const THUMB = 24;

export function snap(v: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  const n = Math.round((clamped - min) / step);
  return Number(Math.min(max, min + n * step).toFixed(6));
}

export function Slider({ value, min, max, step, label, onSlide, onDone, onActive, testID }: {
  value: number;
  min: number;
  max: number;
  step: number;
  /** What it sets, for TalkBack ("Zoom", "Size"). */
  label: string;
  onSlide?: (v: number) => void;
  onDone: (v: number) => void;
  onActive?: (on: boolean) => void;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const on = useRef({ onSlide, onDone, onActive, width, min, max, step });
  on.current = { onSlide, onDone, onActive, width, min, max, step };
  const last = useRef<{ at: number; timer: ReturnType<typeof setTimeout> | null; pending: number | null }>({ at: 0, timer: null, pending: null });
  useEffect(() => () => { if (last.current.timer) clearTimeout(last.current.timer); }, []);

  const valueAt = (x: number) => {
    const { width: w, min: lo, max: hi, step: st } = on.current;
    const usable = Math.max(1, w - THUMB);
    return snap(lo + ((x - THUMB / 2) / usable) * (hi - lo), lo, hi, st);
  };
  const slide = (v: number) => {
    setLive(v);
    const fn = on.current.onSlide;
    if (!fn) return;
    const l = last.current;
    l.pending = v;
    const wait = SLIDE_MS - (Date.now() - l.at);
    if (wait <= 0) { l.at = Date.now(); l.pending = null; fn(v); return; }
    if (!l.timer) {
      l.timer = setTimeout(() => {
        l.timer = null;
        l.at = Date.now();
        if (l.pending != null) { const p = l.pending; l.pending = null; on.current.onSlide?.(p); }
      }, wait);
    }
  };
  const done = (v: number) => {
    const l = last.current;
    if (l.timer) { clearTimeout(l.timer); l.timer = null; }
    l.pending = null;
    setLive(null);
    on.current.onActive?.(false);
    on.current.onDone(v);
  };

  const startX = useRef(0);
  const finger = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { on.current.onActive?.(true); startX.current = e.nativeEvent.locationX; slide(valueAt(startX.current)); },
    onPanResponderMove: (_e, g) => slide(valueAt(startX.current + g.dx)),
    onPanResponderRelease: (_e, g) => done(valueAt(startX.current + g.dx)),
    onPanResponderTerminate: (_e, g) => done(valueAt(startX.current + g.dx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const frac = (shown - min) / Math.max(1e-9, max - min);
  const left = frac * Math.max(0, width - THUMB);
  return (
    <View
      style={styles.band}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: shown }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const big = (max - min) / 20;
        const by = Math.max(step, Math.round(big / step) * step);
        done(snap(value + (e.nativeEvent.actionName === 'increment' ? by : -by), min, max, step));
      }}
      testID={testID}
      {...finger.panHandlers}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: left + THUMB / 2 }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: 48, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginHorizontal: THUMB / 2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent, marginLeft: -THUMB / 2 },
  thumb: { position: 'absolute', top: (48 - THUMB) / 2, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, elevation: 2 },
});
