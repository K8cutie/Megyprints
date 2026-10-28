import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { PlaceProgress } from '@web/lib/placeProgress';
import { barPercent, KEEP_OPEN_NOTE } from '../../lib/checkout/placeRun';
import { colors, space } from '../../lib/theme';

/** The bar while the order is placed (the website's PlaceOrderProgress):
 *  it fills as the work is done, and while the file is sent (no measure) a
 *  band moves along it instead of a made-up number. */
export function PlaceProgressBar({ progress }: { progress: PlaceProgress }) {
  const pct = barPercent(progress);
  const [width, setWidth] = useState(0);
  const band = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!progress.sending) { band.stopAnimation(); return; }
    const loop = Animated.loop(Animated.timing(band, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    band.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [progress.sending, band]);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  return (
    <View testID="order-progress">
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Placing your order"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={styles.track}
        onLayout={onLayout}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} testID="order-progress-fill" />
        {progress.sending && width > 0 && (
          <Animated.View
            style={[styles.band, { transform: [{ translateX: band.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.3, width] }) }] }]}
            testID="order-progress-sending"
          />
        )}
      </View>
      <Text style={styles.note} testID="order-progress-note">{KEEP_OPEN_NOTE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, backgroundColor: '#F1E4DA', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: colors.accent },
  band: { position: 'absolute', top: 0, bottom: 0, width: '30%', backgroundColor: 'rgba(255,255,255,0.45)' },
  note: { marginTop: space.sm, fontSize: 14, color: colors.muted, textAlign: 'center' },
});
