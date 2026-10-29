/* ══════════════════════════════════════════════════════════════════════════
   DELETE MY ACCOUNT (Phase 6): the website's dialog (src/components/
   DeleteAccountSection.tsx) as a screen. Unhurried on purpose: it reads
   first what would go (the preflight: the real counts, any order that
   blocks it), says what the shop keeps and why, and deletes only after
   DELETE is typed. "Delete forever" is never greyed out: a tap before
   DELETE is typed says so. See lib/account/deleteAccount.ts for the call.
   ══════════════════════════════════════════════════════════════════════════ */
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { preflightAccountDeletionWith, type DeletionPreflight } from '@web/lib/accountDeletionRules';
import { releasePickedFiles } from '../../modules/photo-files';
import { useBuilder } from '../builder/BuilderProvider';
import { Button } from '../components/Button';
import { DeleteByEmailError, deleteAccountEndpoint, deleteAccountFromApp, EMAIL_DELETE_URL, SHOP_EMAIL } from '../lib/account/deleteAccount';
import {
  blockedWords,
  CLOSE,
  confirmed,
  DELETE_FOREVER,
  DELETING,
  deletionItems,
  DIALOG_TITLE,
  DONE_TEXT,
  DONE_TITLE,
  KEEP,
  keptNote,
  LIST_LEAD,
  LOAD_FAILED,
  TYPE_IT_FIRST,
  TYPE_PROMPT,
  CONFIRM_WORD,
} from '../lib/account/deletionWords';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draftStore';
import { supabase, supabaseUrl } from '../lib/supabase';
import { colors, space } from '../lib/theme';

type Phase = 'loading' | 'failed' | 'ready' | 'deleting' | 'done';

export default function DeleteAccount() {
  const { loading: authLoading, session } = useAuth();
  const { builder } = useBuilder();
  const { draft, clear } = useDraft();
  const [phase, setPhase] = useState<Phase>('loading');
  const [preflight, setPreflight] = useState<DeletionPreflight | null>(null);
  const [loadError, setLoadError] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [byEmail, setByEmail] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const deleted = useRef(false);

  // Ask the server what deletion would actually do, before anything else.
  useEffect(() => {
    if (!session || deleted.current) return;
    let alive = true;
    preflightAccountDeletionWith(supabase)
      .then((p) => { if (alive) { setPreflight(p); setPhase('ready'); } })
      .catch((e: unknown) => { if (alive) { setLoadError(e instanceof Error && e.message ? e.message : ''); setPhase('failed'); } });
    return () => { alive = false; };
  }, [session, attempt]);

  // Let the confirmation land before going back to the start screen (the website's 2.2 s).
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => { if (router.canDismiss()) router.dismissAll(); else router.replace('/'); }, 2200);
    return () => clearTimeout(t);
  }, [phase]);

  const leave = () => { if (phase !== 'deleting') { if (router.canGoBack()) router.back(); else router.replace('/profile'); } };

  const doDelete = useCallback(async () => {
    if (!confirmed(typed)) { setError(TYPE_IT_FIRST); return; }
    const where = deleteAccountEndpoint(supabaseUrl, process.env.EXPO_PUBLIC_DELETE_ACCOUNT_URL);
    if ('problem' in where) { setError(where.problem); return; }
    setPhase('deleting');
    setError(null);
    setByEmail(false);
    try {
      await deleteAccountFromApp({
        endpoint: where.url,
        token: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
        fetch: (url, init) => fetch(url, init),
        wipe: async () => {
          // What the phone keeps: the album in progress and the access to photos
          // picked with "Choose from Files" (as Start a new album lets them go).
          await releasePickedFiles(draft.photos.filter((p) => p.source === 'files').map((p) => p.uri)).catch(() => 0);
          builder.reset();
          clear();
        },
        // The account is gone on the server: drop the sign-in on this phone.
        signOut: async () => { await supabase.auth.signOut({ scope: 'local' }); },
      });
      deleted.current = true;
      setPhase('done');
    } catch (e) {
      setByEmail(e instanceof DeleteByEmailError);
      setError(e instanceof Error && e.message ? e.message : 'Deletion failed. Please try again.');
      setPhase('ready');
    }
  }, [typed, draft.photos, builder, clear]);

  if (phase === 'done') {
    return (
      <View style={styles.center} testID="delete-done">
        <Text style={styles.h1}>{DONE_TITLE}</Text>
        <Text style={styles.body}>{DONE_TEXT}</Text>
      </View>
    );
  }
  if (!authLoading && !session) return <Redirect href="/sign-in" />;

  const blocked = (preflight?.blocking.length ?? 0) > 0;
  const note = preflight ? keptNote(preflight) : '';

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" testID="delete-account">
      <Text style={styles.h1}>{DIALOG_TITLE}</Text>

      {phase === 'loading' || authLoading ? (
        <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} />
      ) : phase === 'failed' ? (
        <>
          <Text style={styles.error} testID="delete-load-failed">{LOAD_FAILED}{loadError ? ` ${loadError}` : ''}</Text>
          <Button label="Try again" onPress={() => { setPhase('loading'); setAttempt((n) => n + 1); }} testID="delete-retry" />
          <Button label={KEEP} kind="plain" onPress={leave} testID="delete-keep" />
        </>
      ) : blocked && preflight ? (
        <>
          <Text style={styles.body} testID="delete-blocked">{blockedWords(preflight).first}</Text>
          <Text style={styles.small}>{blockedWords(preflight).second}</Text>
          <Button label={CLOSE} kind="plain" onPress={leave} testID="delete-close" />
        </>
      ) : preflight ? (
        <>
          <Text style={styles.body}>{LIST_LEAD}</Text>
          <View style={styles.list} testID="delete-list">
            {deletionItems(preflight).map((item) => (
              <View key={item} style={styles.item}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.itemText}>{item}</Text>
              </View>
            ))}
          </View>
          {!!note && <Text style={styles.kept} testID="delete-kept">{note}</Text>}

          {/* TYPE_PROMPT, with the word in bold. */}
          <Text style={styles.small} accessibilityLabel={TYPE_PROMPT}>Type <Text style={styles.word}>{CONFIRM_WORD}</Text> to confirm.</Text>
          <TextInput
            value={typed}
            onChangeText={(t) => { setTyped(t); if (error === TYPE_IT_FIRST) setError(null); }}
            editable={phase !== 'deleting'}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
            style={styles.input}
            testID="delete-typed"
          />
          {!!error && <Text style={styles.error} accessibilityRole="alert" testID="delete-error">{error}</Text>}
          {byEmail && <Button label="Email us to delete my account" kind="plain" onPress={() => { void Linking.openURL(EMAIL_DELETE_URL); }} testID="delete-by-email" />}

          <Button label={phase === 'deleting' ? DELETING : DELETE_FOREVER} kind="danger" busy={phase === 'deleting'} onPress={() => void doDelete()} testID="delete-forever" />
          <Button label={KEEP} kind="plain" onPress={leave} testID="delete-keep" />
          <Text style={styles.tiny}>Questions? Email {SHOP_EMAIL}.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md, backgroundColor: colors.background },
  spinner: { marginTop: space.xl },
  h1: { fontSize: 24, fontWeight: '800', color: colors.text },
  body: { fontSize: 16, lineHeight: 23, color: colors.text },
  small: { fontSize: 15, lineHeight: 21, color: colors.muted },
  tiny: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: space.sm },
  bullet: { fontSize: 16, lineHeight: 23, color: colors.text },
  itemText: { flex: 1, fontSize: 16, lineHeight: 23, color: colors.text },
  kept: { fontSize: 14, lineHeight: 20, color: colors.muted, backgroundColor: '#FBF7F2', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
  word: { fontWeight: '800', color: colors.text },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, fontSize: 18, color: colors.text, letterSpacing: 1 },
  error: { fontSize: 15, lineHeight: 21, color: colors.bad },
});
