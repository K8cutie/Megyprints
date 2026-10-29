/* ══════════════════════════════════════════════════════════════════════════
   CHANGE PASSWORD (Phase 6), the website's way: "Email me a link" sends the
   account's email a link to make a new password (lib/account/passwordLink.ts),
   then "Check your email". The words are the website's sign-in box
   ("Forgot your password?" → "Check your email").
   ══════════════════════════════════════════════════════════════════════════ */
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import {
  CHANGE_SUB,
  CHANGE_TITLE,
  DONE,
  EMAIL_LABEL,
  OPENS_WEBSITE,
  SEND,
  SENDING,
  sendPasswordLink,
  SENT_HELP,
  SENT_SUB,
  SENT_TITLE,
  sentTo,
} from '../lib/account/passwordLink';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

export default function ChangePassword() {
  const { loading, session } = useAuth();
  const email = session?.user.email ?? '';
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!loading && !session) return <Redirect href="/sign-in" />;

  const send = async () => {
    setError(null);
    setSending(true);
    const err = await sendPasswordLink(supabase, email);
    setSending(false);
    if (err) setError(err); else setSent(true);
  };

  if (sent) {
    return (
      <ScrollView contentContainerStyle={styles.page} testID="password-sent">
        <Text style={styles.h1}>{SENT_TITLE}</Text>
        <Text style={styles.sub}>{SENT_SUB}</Text>
        <Text style={styles.body}>{sentTo(email)}</Text>
        <Text style={styles.small}>{SENT_HELP}</Text>
        <Text style={styles.small}>{OPENS_WEBSITE}</Text>
        <Button label={DONE} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} testID="password-done" />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} testID="password-change">
      <Text style={styles.h1}>{CHANGE_TITLE}</Text>
      <Text style={styles.sub}>{CHANGE_SUB}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{EMAIL_LABEL}</Text>
        <Text style={styles.email} testID="password-email">{email}</Text>
      </View>
      <Text style={styles.small}>{OPENS_WEBSITE}</Text>
      {!!error && <Text style={styles.error} accessibilityRole="alert" testID="password-error">{error}</Text>}
      <Button label={sending ? SENDING : SEND} busy={sending} onPress={() => void send()} testID="password-send" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.background, flexGrow: 1 },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text },
  sub: { fontSize: 16, lineHeight: 22, color: colors.muted },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  small: { fontSize: 14, lineHeight: 20, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted },
  email: { fontSize: 17, fontWeight: '700', color: colors.text },
  error: { fontSize: 15, lineHeight: 21, color: colors.bad },
});
