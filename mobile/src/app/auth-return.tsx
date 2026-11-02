/* ══════════════════════════════════════════════════════════════════════════
   BACK FROM GOOGLE: the screen a Google sign-in comes back to
   (+native-intent.tsx sends megyprints://auth?… and the website's
   auth-native.html link here). With the one-time code this phone started,
   the session is set and the person goes back to the sign-in screen, which
   goes on as after a password (then=back: back to the order). Refused or
   cancelled: the website's words and the way back. A link this phone did
   not start: the start screen, nothing signed in.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { finishGoogleSignIn } from '../lib/googleSignIn';
import { nonceStore } from '../lib/googleNonce';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';

export default function AuthReturn() {
  const params = useLocalSearchParams<Record<string, string>>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === 'string') p.set(k, v);
    void finishGoogleSignIn(p, { client: supabase as never, store: nonceStore }).then((r) => {
      if (!alive) return;
      if (!r) { router.replace('/'); return; }
      if (!r.ok) { setError(r.error); return; }
      if (router.canGoBack()) router.back();
      else router.replace('/albums');
    });
    return () => { alive = false; };
    // Once, for the answer this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.page} testID="auth-return">
      {error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <Button label="Back to sign in" kind="plain" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/sign-in'); }} testID="auth-return-back" />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.body}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.background },
  body: { fontSize: 16, color: colors.muted },
  error: { fontSize: 16, lineHeight: 22, color: colors.bad, textAlign: 'center' },
});
