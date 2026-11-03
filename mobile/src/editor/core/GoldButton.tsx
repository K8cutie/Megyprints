/* ══════════════════════════════════════════════════════════════════════════
   THE GOLD BUTTON: "Add a video memory", the website's VideoMemoryButton
   (phone) and its look, src/index.css .memory-shine (owner, 2026-10-04: the
   video memory is "the crème de la crème" of the album: "make it more
   noticeable like a shiny glowing feature, a different color which catches
   attention"; 2026-11-03: "we need the golden button for the QR video").

   Gold, not terracotta, so it never reads as a second "Next page": the same
   gradient and dark-gold words, a soft glow that swells and fades (2.6 s),
   and a band of light that sweeps across it (3.4 s), every time. With the
   phone's "reduce motion" on it holds still, as the website does under
   prefers-reduced-motion. Its own full-width row, 44 px tall.

   Drawn with React Native's own styles (backgroundImage, boxShadow) and its
   Animated (native driver): no new library in the app.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

/** The website's .memory-shine, value for value. */
export const GOLD = {
  gradient: 'linear-gradient(135deg, #C9962F 0%, #E9C46F 38%, #F7E3A8 52%, #DDAE4C 70%, #C08A2B 100%)',
  /** Under the gradient, for a phone that can't draw it. */
  base: '#DDAE4C',
  text: '#2E1A08',
  shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 rgba(120, 80, 10, 0.3), 0 2px 10px 0 rgba(214, 160, 50, 0.45)',
  glow: '0 0 22px 4px rgba(232, 178, 64, 0.75)',
  sweep: 'linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.8) 50%, transparent 65%)',
  glowMs: 2600,
  sweepMs: 3400,
} as const;

/** The phone's "reduce motion" setting, kept up to date. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}

/** A small video camera (the website's lucide Video), in the words' colour. */
function VideoMark() {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.markBody} />
      <View style={styles.markLens} />
    </View>
  );
}

export function GoldButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const still = useReduceMotion();
  const glow = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (still) { glow.setValue(0); sweep.setValue(0); return undefined; }
    const half = GOLD.glowMs / 2;
    const swell = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: half, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    // The website's sweep: across in the first 35% of 3.4 s, then a rest.
    const pass = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: Math.round(GOLD.sweepMs * 0.35), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(Math.round(GOLD.sweepMs * 0.65)),
    ]));
    swell.start();
    pass.start();
    return () => { swell.stop(); pass.stop(); };
  }, [still, glow, sweep]);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      {/* The swelling glow, under the button. */}
      {!still && <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow }]} testID={testID ? `${testID}-glow` : undefined} />}
      <View style={styles.face} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {!still && width > 0 && (
          <Animated.View pointerEvents="none" testID={testID ? `${testID}-sweep` : undefined}
            style={[styles.sweep, { width, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-1.2 * width, 1.2 * width] }) }] }]} />
        )}
        <View style={styles.row}>
          <VideoMark />
          <Text style={styles.text}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const RADIUS = 12;
const styles = StyleSheet.create({
  wrap: { minHeight: 44, borderRadius: RADIUS },
  pressed: { transform: [{ scale: 0.98 }] },
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: RADIUS, backgroundColor: GOLD.base, boxShadow: GOLD.glow },
  face: { minHeight: 44, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: GOLD.base, backgroundImage: GOLD.gradient, boxShadow: GOLD.shadow, alignItems: 'center', justifyContent: 'center' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundImage: GOLD.sweep },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  text: { fontSize: 15, fontWeight: '700', color: GOLD.text },
  mark: { flexDirection: 'row', alignItems: 'center' },
  markBody: { width: 13, height: 11, borderRadius: 2.5, borderWidth: 2, borderColor: GOLD.text },
  markLens: { width: 0, height: 0, marginLeft: 1, borderTopWidth: 4, borderBottomWidth: 4, borderRightWidth: 5, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: GOLD.text },
});
