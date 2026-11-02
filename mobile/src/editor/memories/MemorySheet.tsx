/* ══════════════════════════════════════════════════════════════════════════
   "ADD A VIDEO MEMORY" / "CHANGE THIS MEMORY": the website's AddQrModal
   (ClipModal) as a sheet over the editor, in its words (words.ts).

   Opened three ways (the website's three hosts of the modal):
     • 'add'  — "Add a video memory" under a single-photo page: the page
       becomes the full photo with the QR in a corner (applyMemoryQr), the
       corner Auto (away from the face) or chosen;
     • 'slot' — a tap on a page's QR: change its video, move its corner
       (setMemoryQrCorner), or remove it (setQrFill null);
     • 'box'  — a tap on a QR in a caption box (older albums): change or
       remove it (setTextSlotQr).
   Every change goes through the website's own album state (ctx.builder).
   The video is kept on the phone and shrunk (lib/memories/clipStore.ts),
   and sent at checkout.
   ══════════════════════════════════════════════════════════════════════════ */
import { getRandomBytes } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { QrFill } from '@web/pages/builder/types';
import { QR_CORNERS, qrBadgeCornerOf, type QrCorner } from '@web/pages/builder/pageTemplates';
import { EXTRA_QR_RATE, FREE_QR_MEMORIES, hdMemoriesPriceOf, includedHostingYears } from '@web/lib/pricing';
import { Button } from '../../components/Button';
import { loadPriceSchedule, usePriceSchedule } from '../../lib/checkout/priceSchedule';
import { clipStore, currentClipQuality, setClipQuality } from '../../lib/memories/clipStore';
import type { ClipExt, ClipQuality } from '../../lib/memories/clips';
import { qrPngDataUrlOnPhone } from '../../lib/memories/qrPicture';
import { supabase, supabaseConfigured, supabaseUrl } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import type { SheetProps } from '../registry';
import { albumQuality, changeMemory, checkPicked, newMemory, removeMemory, safeHost, type FlowDeps, type PickedVideo } from './memoryFlow';
import { pickVideoFromPhone } from './pickVideo';
import { VideoPreview } from './VideoPreview';
import * as W from './words';

export type MemorySheetParams = { mode: 'add' } | { mode: 'slot'; slot: number } | { mode: 'box'; box: number };

const flowDeps: FlowDeps = {
  store: clipStore,
  randomBytes: (n) => getRandomBytes(n),
  qrPicture: (memUrl) => qrPngDataUrlOnPhone(memUrl),
  supabaseUrl,
  now: () => Date.now(),
};

export function MemorySheet({ ctx, params, close }: SheetProps<MemorySheetParams>) {
  const { builder, page } = ctx;
  const initial: QrFill | null = params.mode === 'slot' ? page.qrFills?.[params.slot] ?? null
    : params.mode === 'box' ? page.textSlotQr?.[params.box] ?? null
      : null;
  const editing = !!initial;

  // The corner: a new badge starts on Auto (null); a badge page's QR moves
  // at once (the website's onCorner → setMemoryQrCorner).
  const badgeCorner = params.mode === 'slot' ? qrBadgeCornerOf(page.templateId) : null;
  const [newCorner, setNewCorner] = useState<QrCorner | null>(null);
  const corner = params.mode === 'add' ? newCorner : badgeCorner;
  const showCorners = params.mode === 'add' || !!badgeCorner;
  const pickCorner = (c: QrCorner | null) => {
    if (params.mode === 'add') setNewCorner(c);
    else if (c) builder.setMemoryQrCorner(c);
  };

  // Prices (the free memories, the hosting term, the HD price).
  const loadSchedule = useCallback(() => loadPriceSchedule(supabase, supabaseConfigured), []);
  const { schedule } = usePriceSchedule(loadSchedule);
  const includedYears = includedHostingYears(schedule ?? {});
  const hdPrice = hdMemoriesPriceOf(schedule ?? {});

  // The quality: offered with the album's first memory, then locked.
  const [quality, setQuality] = useState<ClipQuality>('standard');
  const [locked, setLocked] = useState<boolean | null>(null);
  const [albumTier, setAlbumTier] = useState<ClipQuality | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const q = await currentClipQuality();
      const a = await albumQuality(builder.albumPages, clipStore);
      if (!alive) return;
      setLocked(a.locked);
      setAlbumTier(a.tier);
      setQuality(a.tier ?? q);
    })();
    return () => { alive = false; };
  }, [builder.albumPages]);
  const offerTier = !editing && locked === false && hdPrice > 0;

  // What plays now (a kept video, else the one in the cloud).
  const [keptUri, setKeptUri] = useState<string | null>(null);
  useEffect(() => {
    if (!initial || initial.kind !== 'clip') return;
    let alive = true;
    void clipStore.getStagedClip(initial.code).then((c) => { if (alive && c) setKeptUri(c.uri); });
    return () => { alive = false; };
  }, [initial]);
  const currentUrl = initial?.kind === 'clip' ? (keptUri ?? initial.destination) : null;
  const legacy = initial && initial.kind !== 'clip' ? initial.destination : null;

  const [picked, setPicked] = useState<{ video: PickedVideo; ext: ClipExt; durationSec: number | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    setError('');
    setChecking(true);
    try {
      const v = await pickVideoFromPhone();
      if (!v) return;
      setPicked(null);
      const r = checkPicked(v);
      if (!r.ok) { setError(r.error); return; }
      setPicked({ video: v, ext: r.ext, durationSec: r.durationSec });
    } catch {
      setError(W.SAVE_FAILED);
    } finally {
      setChecking(false);
    }
  };

  const confirm = async () => {
    if (!picked) { setError(W.CHOOSE_FIRST); return; }
    setError('');
    setBusy(true);
    try {
      if (initial) {
        const fill = await changeMemory(initial, picked.video, picked, albumTier ?? await currentClipQuality(), flowDeps);
        if (params.mode === 'slot') builder.setQrFill(params.slot, fill);
        else if (params.mode === 'box') builder.setTextSlotQr(params.box, fill);
        close();
        return;
      }
      if (offerTier) await setClipQuality(quality);
      const fill = await newMemory(picked.video, picked, offerTier ? quality : (albumTier ?? await currentClipQuality()), flowDeps);
      await builder.applyMemoryQr(fill, newCorner ?? undefined);
      close();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : W.SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await removeMemory(initial, flowDeps).catch(() => {});
    if (params.mode === 'slot') builder.setQrFill(params.slot, null);
    else if (params.mode === 'box') builder.setTextSlotQr(params.box, null);
    close();
  };

  return (
    <EditorSheet title={editing ? W.TITLE_CHANGE : W.TITLE_ADD} onClose={close} testID="memory-sheet" scroll>
      {!editing && (
        <View style={styles.invite}>
          <Text style={styles.inviteTitle}>{W.INVITE}</Text>
          <Text style={styles.small}>{W.INVITE_BODY}</Text>
          <Text style={styles.tiny} testID="memory-included">{W.included(FREE_QR_MEMORIES, EXTRA_QR_RATE, includedYears)}</Text>
        </View>
      )}

      {editing && !picked && (currentUrl ? (
        <View style={styles.box}>
          <VideoPreview uri={currentUrl} testID="memory-current" />
          <Text style={styles.tinyCenter}>{W.PLAYS_THIS}</Text>
        </View>
      ) : legacy ? (
        <Text style={[styles.small, styles.box]} testID="memory-legacy">{W.legacyLink(safeHost(legacy))}</Text>
      ) : null)}

      {offerTier && (
        <View>
          <Text style={styles.label}>{W.QUALITY_LABEL}</Text>
          <View style={styles.tiers} accessibilityRole="radiogroup">
            {(['standard', 'hd'] as ClipQuality[]).map((q) => (
              <Pressable key={q} accessibilityRole="radio" accessibilityState={{ checked: quality === q }} onPress={() => setQuality(q)}
                style={[styles.tier, quality === q && styles.tierOn]} testID={`memory-tier-${q}`}>
                <Text style={styles.tierName}>{W.qualityName(q)}</Text>
                <Text style={styles.tiny}>{W.qualityPrice(q, hdPrice)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.tiny}>{W.QUALITY_NOTE}</Text>
        </View>
      )}
      {!editing && locked === true && hdPrice > 0 && (
        <Text style={styles.tiny} testID="memory-tier-locked">{W.qualityLocked(quality)}</Text>
      )}

      <Button label={checking ? W.CHECKING : W.pickLabel(!!picked, editing)} kind="plain" busy={checking} onPress={() => { if (!checking && !busy) void pick(); }} testID="memory-pick" />
      {!!error && <Text style={styles.error} accessibilityRole="alert" testID="memory-error">{error}</Text>}

      {picked && (
        <View style={styles.box}>
          <VideoPreview uri={picked.video.uri} autoPlay testID="memory-preview" />
          <Text style={styles.tinyCenter} testID="memory-picked">▶ {W.pickedLine(picked.video.name, picked.video.size, picked.durationSec)}</Text>
        </View>
      )}

      {showCorners && (
        <View>
          <Text style={styles.label}>{W.CORNER_QUESTION}</Text>
          <View style={styles.cornerRow}>
            {params.mode === 'add' && (
              <Pressable accessibilityRole="button" onPress={() => pickCorner(null)} style={[styles.auto, corner == null && styles.autoOn]} testID="memory-corner-auto">
                <Text style={[styles.autoText, corner == null && styles.autoTextOn]}>{W.AUTO}</Text>
              </Pressable>
            )}
            <View style={styles.cornerBox}>
              {QR_CORNERS.map((c) => (
                <Pressable key={c} accessibilityRole="button" accessibilityLabel={W.CORNER_LABELS[c]} onPress={() => pickCorner(c)}
                  style={[styles.corner, CORNER_POS[c], corner === c && styles.cornerOn]} testID={`memory-corner-${c}`} />
              ))}
            </View>
            <Text style={[styles.tiny, styles.flex]}>{W.cornerNote(corner)}</Text>
          </View>
        </View>
      )}

      {initial && (
        <View style={styles.qrRow}>
          <Image source={{ uri: initial.qrPngDataUrl }} style={styles.qr} accessibilityIgnoresInvertColors />
          <Text style={[styles.tiny, styles.flex]} selectable>{initial.memoryUrl}</Text>
        </View>
      )}

      <View style={styles.foot}>
        {initial ? <Button label={W.REMOVE} kind="plain" onPress={() => { void remove(); }} testID="memory-remove" /> : <View />}
        <Button label={busy ? W.SAVING : W.saveLabel(editing)} busy={busy} onPress={() => { if (picked && !busy) void confirm(); }} testID="memory-save" />
      </View>
      {busy && <ActivityIndicator color={colors.accent} />}
    </EditorSheet>
  );
}

const CORNER_POS: Record<QrCorner, object> = {
  tl: { top: 5, left: 5 }, tr: { top: 5, right: 5 }, bl: { bottom: 5, left: 5 }, br: { bottom: 5, right: 5 },
};

const styles = StyleSheet.create({
  invite: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: space.md, gap: 4 },
  inviteTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
  tiny: { fontSize: 12, lineHeight: 16, color: colors.muted },
  tinyCenter: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: space.xs },
  label: { fontSize: 13, color: colors.muted, marginBottom: space.xs },
  box: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  tiers: { flexDirection: 'row', gap: space.sm },
  tier: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  tierOn: { borderColor: colors.accent, backgroundColor: colors.background },
  tierName: { fontSize: 14, fontWeight: '700', color: colors.text },
  error: { fontSize: 13, color: colors.bad },
  cornerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  auto: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.background },
  autoOn: { backgroundColor: colors.accent },
  autoText: { fontSize: 12, fontWeight: '700', color: colors.text },
  autoTextOn: { color: '#fff' },
  cornerBox: { width: 92, height: 68, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border },
  corner: { position: 'absolute', width: 24, height: 24, borderRadius: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  cornerOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  flex: { flex: 1 },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.background, borderRadius: 8, padding: space.sm },
  qr: { width: 48, height: 48 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});
