import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, space } from '../../lib/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  /** A small line under the box (the street's character count). */
  note?: { text: string; bad: boolean } | null;
}

/** A labelled text box with its problem said right under it. */
export function Field({ label, error, note, style, ...input }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        style={[styles.input, !!error && styles.inputBad, style]}
        {...input}
      />
      {!!note && <Text style={[styles.note, note.bad && styles.noteBad]}>{note.text}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

/** A box that opens a list (province, city, barangay). Never greyed out:
 *  before its turn it says what to choose first, and opens that instead. */
export function PickField({ label, value, prompt, error, onPress, testID }: {
  label: string; value: string; prompt: string; error?: string; onPress: () => void; testID?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || prompt}`}
        onPress={onPress}
        testID={testID}
        style={[styles.input, styles.pick, !value && styles.prompt, !!error && styles.inputBad]}
      >
        {value || prompt}
      </Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, minHeight: 50, fontSize: 17, color: colors.text },
  pick: { paddingVertical: 13, overflow: 'hidden' },
  prompt: { color: colors.muted },
  inputBad: { borderColor: colors.bad },
  note: { fontSize: 12, color: colors.muted, textAlign: 'right' },
  noteBad: { color: colors.bad, fontWeight: '700' },
  error: { fontSize: 14, color: colors.bad },
});
