import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { testerCheckMessage, testerLine, type TesterCheck, type TesterCode } from '../../lib/checkout/testerCode';
import { colors, space } from '../../lib/theme';
import { Button } from '../Button';

const SIGN_IN_FIRST = testerCheckMessage('sign_in');

/** The tester code at checkout (the website's TesterCodeBox). Closed, one
 *  line: "Have a tester code?". Open, a box and "Use code". Once a code
 *  works it says what it does, with "Remove". Signed out, "Sign in first"
 *  comes with its Sign in button (beta round 2: the only other way to sign
 *  in from here was a button that said "pay ₱2,016"); signed in, those
 *  words go, and the code stays typed. */
export function TesterCodeBox({ tester, onChange, check, signedIn, onSignIn }: {
  tester: TesterCode | null;
  onChange: (next: TesterCode | null) => void;
  check: (typed: string) => Promise<TesterCheck>;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (signedIn) setError((e) => (e === SIGN_IN_FIRST ? '' : e)); }, [signedIn]);

  if (tester) {
    return (
      <View style={styles.onWrap}>
        <View style={styles.on} testID="tester-code-on">
          <Text style={styles.onText}>✓ {testerLine(tester)}</Text>
          <Pressable accessibilityRole="button" onPress={() => { onChange(null); setTyped(''); setError(''); }} testID="tester-code-remove">
            <Text style={styles.link}>Remove</Text>
          </Pressable>
        </View>
        {/* The test album checks only the code's shape (the shop's check is a database write). */}
        {tester.unchecked && <Text style={styles.unchecked} testID="tester-code-unchecked">Test version: this code was not checked with the shop. Here, any code of 4 to 24 letters and numbers shows as free.</Text>}
      </View>
    );
  }
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.openRow} testID="tester-code-open">
        <Text style={styles.link}>Have a tester code?</Text>
      </Pressable>
    );
  }
  const use = async () => {
    if (checking) return;
    setError('');
    setChecking(true);
    const r = await check(typed);
    setChecking(false);
    if (r.ok) onChange(r.tester);
    else setError(r.message);
  };
  return (
    <View style={styles.box} testID="tester-code-box">
      <Text style={styles.label}>Tester code</Text>
      <View style={styles.row}>
        <TextInput
          value={typed}
          onChangeText={(t) => { setTyped(t); if (error) setError(''); }}
          onSubmitEditing={() => void use()}
          maxLength={30}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Type your code"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Tester code"
          style={[styles.input, !!error && styles.inputBad]}
          testID="tester-code-input"
        />
        <Button label={checking ? 'Checking…' : 'Use code'} kind="plain" busy={checking} onPress={() => void use()} style={styles.use} testID="tester-code-apply" />
      </View>
      {!!error && <Text style={styles.error} testID="tester-code-error">{error}</Text>}
      {error === SIGN_IN_FIRST && !signedIn && <Button label="Sign in" kind="plain" onPress={onSignIn} testID="tester-code-sign-in" />}
    </View>
  );
}

const styles = StyleSheet.create({
  onWrap: { gap: 6 },
  unchecked: { fontSize: 13, lineHeight: 18, color: '#8A5A12' },
  on: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, borderRadius: 12, borderWidth: 1, borderColor: '#CDE5D3', backgroundColor: '#EEF7F0', paddingHorizontal: space.md, paddingVertical: 12 },
  onText: { fontSize: 16, fontWeight: '700', color: '#2E6B3F', flex: 1 },
  openRow: { paddingVertical: space.sm },
  link: { fontSize: 15, fontWeight: '700', color: colors.muted, textDecorationLine: 'underline' },
  box: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, minHeight: 50, borderWidth: 1, borderColor: '#C9BBAF', borderRadius: 12, backgroundColor: '#FFFAF6', paddingHorizontal: space.md, fontSize: 17, color: colors.text },
  inputBad: { borderColor: colors.bad },
  use: { minHeight: 50, paddingHorizontal: space.md },
  error: { fontSize: 14, color: colors.bad },
});
