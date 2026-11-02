/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES (Phase 6): the QR "living memories" printed in your albums,
   the website's My Memories page (src/pages/MyMemories.tsx) on the phone,
   in its words (lib/memories/memories.ts, held to the website by
   test/memories.test.ts).

   Every memory, newest first: the address its printed QR opens ("Share
   link"), its scans, how long a video is kept, a longer term waiting on
   payment. A link memory is re-pointed here (the printed QR stays the same).
   A video memory plays here, and "Replace video" puts a new video behind
   the same printed QR (lib/memories/replaceVideo.ts). "Delete" asks first,
   saying where the QR is, then takes it off the account's albums too
   (lib/memories/removal.ts), as the website does.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/checkout/Field';
import { useAuth } from '../lib/auth';
import {
  fmtMonth, isHostedClip, listMyMemories, memoryUrl, pendingTermsByCode, pendingUntil, relinkMemory, validateDestination,
  type PendingTerm, type QrMemoryRow,
} from '../lib/memories/memories';
import { supabase, supabaseUrl } from '../lib/supabase';
import { deletedNotice, deleteMemoryEverywhere, memoryDeleteWarning, memoryPlaces } from '../lib/memories/removal';
import { replaceMemoryVideo, type ReplaceDeps } from '../lib/memories/replaceVideo';
import { pickVideoFromPhone } from '../editor/memories/pickVideo';
import { VideoPreview } from '../editor/memories/VideoPreview';
import { colors, space } from '../lib/theme';

const db = supabase as unknown as Parameters<typeof listMyMemories>[0];

/** The phone's parts of "Replace video" (the kept-video store and its shrinker, loaded when used). */
const replaceDeps: ReplaceDeps = {
  upload: async (clip) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipStore } = require('../lib/memories/clipStore') as typeof import('../lib/memories/clipStore');
    await clipStore.uploadClip({ ...clip, durationSec: null, name: clip.code, stagedAt: 0 });
  },
  shrink: (input, target) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const v = require('../../modules/video-shrink') as typeof import('../../modules/video-shrink');
    if (!v.videoShrinkAvailable) return Promise.reject(new Error('no shrinker'));
    return v.shrinkVideo(input, `${input}.small.mp4`, target);
  },
  relink: (code, destination) => relinkMemory(db, code, destination),
  supabaseUrl,
  now: () => Date.now(),
};

export default function Memories() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [rows, setRows] = useState<QrMemoryRow[] | null>(null);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<Record<string, PendingTerm>>({});
  const [notice, setNotice] = useState<string | null>(null);

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
      {!!notice && <Text style={styles.notice} accessibilityRole="alert" testID="memory-deleted">{notice}</Text>}
      {!!err && <Text style={styles.error}>{err}</Text>}
      {rows === null && !err && <ActivityIndicator color={colors.accent} />}
      {rows && rows.length === 0 && <Text style={styles.body} testID="memories-none">No QR memories yet.</Text>}
      {rows?.map((row) => (
        <MemoryRow key={row.code} row={row} pending={pending[row.code]} userId={userId}
          onRemoved={(albums) => {
            setRows((rs) => rs?.filter((r) => r.code !== row.code) ?? null);
            setNotice(deletedNotice(albums));
          }} />
      ))}
    </ScrollView>
  );
}

function MemoryRow({ row, pending, userId, onRemoved }: {
  row: QrMemoryRow; pending?: PendingTerm; userId: string; onRemoved: (albums: { title: string; pages: number[] }[]) => void;
}) {
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
  // Delete asks first, saying where the QR is: null = not asking, '' = looking it up.
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const replace = async () => {
    const v = await pickVideoFromPhone().catch(() => null);
    if (!v) return;
    setSaving(true);
    setMsg(null);
    const r = await replaceMemoryVideo(row.code, v, replaceDeps);
    setSaving(false);
    if (r.ok) { setSaved(r.destination); setDest(r.destination); }
    setMsg({ text: r.text, ok: r.ok });
  };

  const askDelete = async () => {
    setConfirmDel('');
    try {
      setConfirmDel(memoryDeleteWarning(await memoryPlaces(supabase as never, userId, row.code)));
    } catch {
      setConfirmDel('Delete it?');
    }
  };
  const del = async () => {
    setDeleting(true);
    try {
      const r = await deleteMemoryEverywhere(supabase as never, userId, row.code);
      if (r.ok) onRemoved(r.albums); else setMsg({ text: 'Could not delete. Try again.', ok: false });
    } finally {
      setDeleting(false);
    }
  };

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
          <VideoPreview uri={saved} testID={`memory-video-${row.code}`} />
          <Button label="Replace video" busy={saving} onPress={() => { if (!saving) void replace(); }} testID={`memory-replace-${row.code}`} />
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
      {confirmDel == null ? (
        <Pressable accessibilityRole="button" onPress={() => { void askDelete(); }} style={styles.delete} testID={`memory-delete-${row.code}`}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      ) : (
        <View style={styles.ask} testID={`memory-delete-ask-${row.code}`}>
          <Text style={styles.askText} testID={`memory-delete-warning-${row.code}`}>{confirmDel || 'Checking where this QR is…'}</Text>
          <View style={styles.askRow}>
            <Button label="Delete the video" busy={deleting} onPress={() => { if (confirmDel && !deleting) void del(); }} testID={`memory-delete-confirm-${row.code}`} />
            <Button label="Keep it" kind="plain" onPress={() => { if (!deleting) setConfirmDel(null); }} testID={`memory-delete-keep-${row.code}`} />
          </View>
        </View>
      )}
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
  notice: { fontSize: 14, color: colors.text, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  delete: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: space.sm },
  deleteText: { fontSize: 13, color: colors.muted },
  ask: { borderRadius: 12, borderWidth: 1, borderColor: colors.bad, padding: space.sm, gap: space.sm },
  askText: { fontSize: 13, lineHeight: 18, color: colors.bad },
  askRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
