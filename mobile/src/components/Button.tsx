import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space } from '../lib/theme';

interface Props {
  label: string;
  onPress: () => void;
  /** 'main' = the one filled terracotta button that moves you forward. */
  kind?: 'main' | 'plain';
  /** Working on it: the label stays, with a spinner, and taps wait. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A button that says what it does. Never greyed out: while busy it keeps
 *  its colour and shows a spinner next to the words. */
export function Button({ label, onPress, kind = 'main', busy = false, style, testID }: Props) {
  const main = kind === 'main';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      testID={testID}
      onPress={busy ? undefined : onPress}
      style={({ pressed }) => [styles.base, main ? styles.main : styles.plain, pressed && styles.pressed, style]}
    >
      {busy && <ActivityIndicator color={main ? colors.accentText : colors.accent} style={styles.spinner} />}
      <Text style={[styles.label, main ? styles.mainLabel : styles.plainLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  main: { backgroundColor: colors.accent },
  plain: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent },
  pressed: { opacity: 0.85 },
  spinner: { marginRight: space.sm },
  label: { fontSize: 17, fontWeight: '700' },
  mainLabel: { color: colors.accentText },
  plainLabel: { color: colors.accent },
});
