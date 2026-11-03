/* The order's journey, step by step, from its REAL status (the shared
   orderTracker.trackOf, the same steps as the website's OrderTracker):
   steps reached are ticked, the one in progress spins, the rest wait in
   grey with their number. */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { OrderTrack } from '@web/lib/orderTracker';
import { colors, space } from '../../lib/theme';

export function OrderTracker({ track }: { track: OrderTrack }) {
  return (
    <View style={styles.list} testID="order-tracker" accessibilityRole="list">
      {track.labels.map((label, i) => {
        const done = i < track.stage || (track.finished && i === track.stage);
        const active = i === track.stage && !track.finished;
        const reached = i <= track.stage;
        const state = done ? 'done' : active ? 'now' : 'waiting';
        return (
          <View key={label} style={styles.step} testID={`order-step-${i}`} accessibilityLabel={`${label}: ${done ? 'done' : active ? 'happening now' : 'not yet'}`}>
            <View style={[styles.dot, reached ? styles.dotOn : styles.dotOff]}>
              {active ? <ActivityIndicator size="small" color={colors.accent} />
                : done ? <Text style={styles.tick}>✓</Text>
                  : <Text style={styles.num}>{i + 1}</Text>}
            </View>
            <Text style={[styles.label, reached ? styles.labelOn : styles.labelOff]} testID={`order-step-${i}-${state}`}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: '#E3F0E7' },
  dotOff: { backgroundColor: '#EFEDEA' },
  tick: { fontSize: 16, fontWeight: '800', color: colors.good },
  num: { fontSize: 14, fontWeight: '700', color: '#A8A8A8' },
  label: { fontSize: 16, flexShrink: 1 },
  labelOn: { color: colors.text, fontWeight: '600' },
  labelOff: { color: '#9A9A9A' },
});
