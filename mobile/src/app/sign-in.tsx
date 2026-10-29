import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { useAuth } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabase';
import { colors, space } from '../lib/theme';

/** Sign in with the email and password of a Megy Prints account (the same
 *  account as on the website). */
export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A message about what was typed before goes away as soon as it changes.
  const editEmail = (text: string) => { setEmail(text); setError(null); };
  const editPassword = (text: string) => { setPassword(text); setError(null); };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) router.replace('/albums');
    else setError(result.error ?? 'Sign-in did not work. Try again.');
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Use the same email and password as on the Megy Prints website.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={editEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="name@example.com"
          placeholderTextColor={colors.muted}
          testID="email"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={editPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            placeholder="Your password"
            placeholderTextColor={colors.muted}
            onSubmitEditing={submit}
            testID="password"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            onPress={() => setShowPassword((s) => !s)}
            style={styles.eye}
          >
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.error} accessibilityLiveRegion="polite" testID="sign-in-error">{error}</Text>}
        {!supabaseConfigured && !error && (
          <Text style={styles.error}>This test build was made without the Megy Prints server address, so it cannot sign in.</Text>
        )}

        <Button label={busy ? 'Signing in' : 'Sign in'} busy={busy} onPress={submit} style={styles.button} testID="sign-in" />

        <Text style={styles.note}>Made your account with Google? Google sign-in is not in this test version yet.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg },
  lead: { fontSize: 16, lineHeight: 22, color: colors.muted, marginBottom: space.lg },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.xs, marginTop: space.md },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    fontSize: 17,
    color: colors.text,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingRight: 72 },
  eye: { position: 'absolute', right: 0, height: 52, paddingHorizontal: space.md, justifyContent: 'center' },
  eyeText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  error: { color: colors.bad, fontSize: 15, lineHeight: 21, marginTop: space.md },
  button: { marginTop: space.lg },
  note: { fontSize: 14, color: colors.muted, marginTop: space.lg, lineHeight: 20 },
});
