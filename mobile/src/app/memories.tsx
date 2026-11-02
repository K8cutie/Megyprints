/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES (Phase 6): the QR "living memories" printed in your albums,
   the website's My Memories page (src/pages/MyMemories.tsx) on the phone,
   in its words (lib/memories/memories.ts, held to the website by
   test/memories.test.ts).

   Every memory, newest first: the address its printed QR opens ("Share
   link"), its scans, how long a video is kept, a longer term waiting on
   payment. A link memory is re-pointed here (the printed QR stays the same).
   A video memory can be watched; replacing or deleting a memory is done on
   the website for now (it changes the video file, or the albums the QR is
   printed in): "Open on the website".
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/checkout/Field';
import { useAuth } from '../lib/auth';
import { siteFile } from '../lib/checkout/site';
import {
  fmtMonth, isHostedClip, listMyMemories, memoryUrl, pendingTermsByCode, pendingUntil, relinkMemory, validateDestination,
  type PendingTerm, type QrMemoryRow,
} from '../lib/memories/memories';
import { supabase, supabaseUrl } from '../lib/supabase';
import { colors, space } from '../lib/theme';

const db = supabase as unknown as Parameters<typeof listMyMemories>[0];
/** The website's My Memories (its hash route). */
const WEBSITE_MEMORIES = siteFile('#/memories');

export default function Memories() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [rows, setRows] = useState<QrMemoryRow[] | null>(null);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<Record<string, PendingTerm>>({});

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    listMyMemories(db).then((r) => { if (alive) setRows(r); }).catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    void pendingTermsByCode(db, userId).then((p) => { if (alive) setPending(p); });
    return () => { alive = false; };
  }, [userId]);

  if (!userId) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Sign in to see your QR memories.</Text>
        <Button label="Sign in" onPress={() => router.push({ pathname: '/sign-in', params: { then: 'back' } })} testID="memories-sign-in" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} testID="memories">
      <Text style={styles.lead}>Each QR printed in your album points here. Re-point it anytime — the printed code stays the same, the video updates. No reprint.</Text>
      {!!err && <Text style={styles.error}>{err}</Text>}
      {rows === null && !err && <ActivityIndicator color={colors.accent} />}
      {rows && rows.length === 0 && <Text style={styles.body} testID="memories-none">No QR memories yet.</Text>}
      {rows?.map((row) => <MemoryRow key={row.code} row={row} pending={pending[row.code]} />)}
    </ScrollView>
  );
}

function MemoryRow({ row, pending }: { row: QrMemoryRow; pending?: PendingTerm }) {
  const url = memoryUrl(row.code);
  const [dest, setDest] = useState(row.destination);
  // What the memory points at now (after a re-point).
  const [saved, setSaved] = useState(row.destination);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [now] = useState(() => Date.now());
  const isClip = row.kind === 'clip' || isHostedClip(saved, supabaseUrl);
  const expired = !!row.expires_at && new Date(row.expires_at).getTime() < now;
  const until = pendingUntil(row, pending);
  const dirty = dest.trim() !== saved;

  const save = async () => {
    const v = validateDestination(dest);
    if ('error' in v) { setMsg({ text: v.error, ok: false }); return; }
    setSaving(true);
    setMsg(null);
    const ok = await relinkMemory(db, row.code, v.url);
    setSaving(false);
    if (ok) { setDest(v.url); setSaved(v.url); setMsg({ text: 'Re-pointed ✓ — same QR, new video', ok: true }); }
    else setMsg({ text: 'Could not save. Try again.', ok: false });
  };

  return (
    <View style={styles.card} testID={`memory-${row.code}`}>
      <Text style={styles.address} testID={`memory-address-${row.code}`} selectable>{url}</Text>
      {!!row.expires_at && (
        <Text style={[styles.small, expired && styles.bad]} testID={`memory-term-${row.code}`}>
          {expired ? `Hosting ended ${fmtMonth(row.expires_at)} — renew to bring it back` : `Live until ${fmtMonth(row.expires_at)}`}
        </Text>
      )}
      {!!until && pending && (
        <Text style={styles.small} testID={`memory-pending-${row.code}`}>
          Your {pending.years}-year term (to {fmtMonth(until)}) starts once we confirm your payment for order {pending.orderNumber}.
        </Text>
      )}
      {isClip ? (
        <View style={styles.gap}>
          <Button label="Watch the video" kind="plain" onPress={() => { void Linking.openURL(saved); }} testID={`memory-watch-${row.code}`} />
          <Text style={styles.small}>To replace the video or delete this memory, use My Memories on the website.</Text>
          <Button label="Open on the website" kind="plain" onPress={() => { void Linking.openURL(WEBSITE_MEMORIES); }} testID={`memory-website-${row.code}`} />
        </View>
      ) : (
        <View style={styles.gap}>
          <Field label="Points to" value={dest} onChangeText={(t) => { setDest(t); if (msg) setMsg(null); }}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://youtu.be/…" testID={`memory-dest-${row.code}`} />
          {dirty && <Button label="Save" busy={saving} onPress={() => { void save(); }} testID={`memory-save-${row.code}`} />}
          <Button label="Open the link" kind="plain" onPress={() => { void Linking.openURL(saved); }} testID={`memory-open-${row.code}`} />
        </View>
      )}
      {msg && <Text style={msg.ok ? styles.good : styles.error}>{msg.text}</Text>}
      <View style={styles.foot}>
        <Text style={styles.small} testID={`memory-scans-${row.code}`}>{row.scan_count} scan{row.scan_count === 1 ? '' : 's'}</Text>
        <Button label="Share link" kind="plain" onPress={() => { void Share.share({ message: url }); }} testID={`memory-share-${row.code}`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.md, paddingBottom: space.xl, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.background },
  lead: { fontSize: 15, lineHeight: 21, color: colors.text },
  body: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: space.md, gap: space.sm },
  address: { fontSize: 13, color: colors.muted },
  small: { fontSize: 13, color: colors.muted },
  bad: { color: colors.bad, fontWeight: '700' },
  good: { fontSize: 13, color: colors.good, fontWeight: '600' },
  error: { fontSize: 13, color: colors.bad },
  gap: { gap: space.sm },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
