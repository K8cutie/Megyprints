import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { googleRefusedNotice } from '@web/lib/accountErrors';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { TermsAgreeLine } from '../components/LegalLinks';
import { useAuth } from '../lib/auth';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { startGoogleSignIn } from '../lib/googleSignIn';
import { GOOGLE_IN_PLAY_APP, GOOGLE_IN_PLAY_APP_SHORT, googleSignInHere } from '../lib/account/googleHere';
import { nonceStore, randomHex } from '../lib/googleNonce';
import { colors, space } from '../lib/theme';
import { forgetResume } from '../editor/text/resumeQuote';
import {
  BACK_TO_SIGN_IN, CHANGE_SUB, EMAIL_LABEL, emailProblem, FORGOT_LINK, FORGOT_TITLE, OPENS_WEBSITE, SEND, SENDING,
  sendPasswordLink, SENT_HELP, SENT_SUB, SENT_TITLE, sentTo,
} from '../lib/account/passwordLink';

/** Sign in with the email and password of a Megy Prints account (the same
 *  account as on the website). Opened from checkout or the editor's quotes
 *  (then=back), it goes back there once signed in, as the website's sign-in
 *  box keeps you on the page; from anywhere else it opens My albums.
 *  "Forgot password?" is the website's: an emailed link that opens the
 *  website to make a new password (lib/account/passwordLink.ts). */
export default function SignIn() {
  const { signIn, session } = useAuth();
  // Opened from a screen that carries on once signed in (checkout, or the
  // editor's "Write a line for this photo"): then=back goes back to it.
  const { then } = useLocalSearchParams<{ then?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The website's sign-in box: signin → forgot ("Email me a link") → sent.
  const [view, setView] = useState<'signin' | 'forgot' | 'sent'>('signin');
  const [sending, setSending] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const showView = (next: 'signin' | 'forgot' | 'sent') => { setError(null); setForgotError(null); setView(next); };
  // Left without signing in (back, or another way): the editor's "Write a
  // line" does not carry on by itself later (resumeQuote.ts). Only the way
  // straight back from a sign-in made here does.
  const signedInHere = useRef(false);
  useEffect(() => () => { if (!signedInHere.current) forgetResume(); }, []);

  // A message about what was typed before goes away as soon as it changes.
  const editEmail = (text: string) => { setEmail(text); setError(null); };
  const editPassword = (text: string) => { setPassword(text); setError(null); };

  // Signed in: back where sign-in was opened from (then=back), else My albums.
  const goOn = () => {
    signedInHere.current = true;
    if (then === 'back' && router.canGoBack()) router.back();
    else router.replace('/albums');
  };

  // "Sign in with Google": Google opens in a Chrome tab; its answer comes back
  // through the auth-return screen, which sets the session and closes itself.
  // Only then, with this screen in front again, it goes on as after a
  // password: never while auth-return is still on top (two screens moving at
  // once). A session already there when this screen opened does not go on.
  const focused = useIsFocused();
  const googleStarted = useRef(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  useEffect(() => {
    if (focused && session && googleStarted.current) { googleStarted.current = false; goOn(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, focused]);
  const google = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      googleStarted.current = true;
      await startGoogleSignIn({ client: supabase as never, store: nonceStore, open: (url) => openBrowserAsync(url), randomHex });
    } catch {
      googleStarted.current = false;
      setError(googleRefusedNotice('').text);
    } finally {
      setGoogleBusy(false);
    }
  };

  const sendLink = async () => {
    const problem = emailProblem(email);
    if (problem) { setForgotError(problem); return; }
    setForgotError(null);
    setSending(true);
    const err = await sendPasswordLink(supabase, email);
    setSending(false);
    if (err) setForgotError(err); else setView('sent');
  };

  // Google's answer comes back only to the Play app (lib/account/googleHere.ts):
  // the test app says so instead of offering the button.
  const googleBlock = (short: boolean) => (googleSignInHere() ? (
    <>
      <Button label="Sign in with Google" kind="plain" busy={googleBusy} onPress={() => { void google(); }} style={styles.button} testID="sign-in-google" />
      <Text style={styles.note}>Signed up with a Gmail? Sign in with Google using that same Gmail. Your albums will be there.</Text>
    </>
  ) : (
    <Text style={styles.note} testID="google-play-only">{short ? GOOGLE_IN_PLAY_APP_SHORT : GOOGLE_IN_PLAY_APP}</Text>
  ));

  if (view === 'sent') {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content} testID="forgot-sent">
        <Text style={styles.h1}>{SENT_TITLE}</Text>
        <Text style={styles.lead}>{SENT_SUB}</Text>
        <Text style={styles.body}>{sentTo(email)}</Text>
        <Text style={styles.note}>{SENT_HELP}</Text>
        <Text style={styles.note}>{OPENS_WEBSITE}</Text>
        <Button label={BACK_TO_SIGN_IN} onPress={() => showView('signin')} style={styles.button} testID="back-to-sign-in" />
      </ScrollView>
    );
  }

  if (view === 'forgot') {
    return (
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="forgot">
          <Text style={styles.h1}>{FORGOT_TITLE}</Text>
          <Text style={styles.lead}>{CHANGE_SUB}</Text>
          <Text style={styles.label}>{EMAIL_LABEL}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(t) => { setEmail(t); setForgotError(null); }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => { void sendLink(); }}
            testID="forgot-email"
          />
          {forgotError && <Text style={styles.error} accessibilityLiveRegion="polite" testID="forgot-error">{forgotError}</Text>}
          <Text style={styles.note}>{OPENS_WEBSITE}</Text>
          <Button label={sending ? SENDING : SEND} busy={sending} onPress={() => { void sendLink(); }} style={styles.button} testID="send-link" />
          {error && <Text style={styles.error} accessibilityLiveRegion="polite" testID="sign-in-error">{error}</Text>}
          {googleBlock(true)}
          <Button label={BACK_TO_SIGN_IN} kind="plain" onPress={() => showView('signin')} style={styles.button} testID="back-to-sign-in" />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const submit = async () => {
    // A Google tab closed without signing in: this sign-in is the password's.
    googleStarted.current = false;
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) goOn();
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
        <Pressable accessibilityRole="button" onPress={() => showView('forgot')} style={styles.forgot} testID="forgot-password">
          <Text style={styles.forgotText}>{FORGOT_LINK}</Text>
        </Pressable>

        {error && <Text style={styles.error} accessibilityLiveRegion="polite" testID="sign-in-error">{error}</Text>}
        {!supabaseConfigured && !error && (
          <Text style={styles.error}>This test build was made without the Megy Prints server address, so it cannot sign in.</Text>
        )}

        <Button label={busy ? 'Signing in' : 'Sign in'} busy={busy} onPress={submit} style={styles.button} testID="sign-in" />

        {googleBlock(false)}
        {/* The website's line under Create Account: in the app, Sign in with
            Google is how a new account is made. */}
        <TermsAgreeLine by="signing in" style={styles.agree} testID="sign-in-agree" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg },
  lead: { fontSize: 16, lineHeight: 22, color: colors.muted, marginBottom: space.lg },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: space.sm },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  forgot: { alignSelf: 'flex-end', paddingVertical: space.sm, paddingLeft: space.md },
  forgotText: { fontSize: 15, fontWeight: '700', color: colors.accent },
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
  agree: { marginTop: space.md },
});
