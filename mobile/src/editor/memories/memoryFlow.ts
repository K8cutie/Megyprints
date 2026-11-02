/* ══════════════════════════════════════════════════════════════════════════
   ADDING, CHANGING AND REMOVING A VIDEO MEMORY: the steps of the website's
   AddQrModal (ClipModal pick / confirm / remove), apart from the sheet so
   they are tested on their own (test/memoryFlow.test.ts).

     • pick: the video the customer chose, checked as the website checks it
       (kind, size, length; checkClipMeta's words);
     • a NEW memory: a fresh code (mintCode), its QR picture (the website's,
       qrPicture.ts), the video kept on the phone under the code, and the
       quality chosen with the album's first memory (then locked);
     • CHANGE: the same code and printed QR, the new video kept in its place
       (it replaces the one in the cloud at the next checkout);
     • REMOVE: the kept video is dropped with it.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, QrFill } from '@web/pages/builder/types';
import { checkClipMeta, clipExtFor, publicClipUrl, type ClipExt, type ClipQuality, type ClipStore } from '../../lib/memories/clips';
import { memoryUrl } from '../../lib/memories/memories';

/** What the phone's picker gave back. */
export interface PickedVideo {
  uri: string;
  name: string;
  /** Bytes; 0 = unknown. */
  size: number;
  /** Its MIME type, '' when the phone didn't say. */
  type: string;
  /** Seconds; null = unknown. */
  durationSec: number | null;
}

/** qrMemory.ts mintCode's alphabet: a–z without l and o, and 2–9. */
export const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** mintCode: a random 8-letter code from the phone's secure random bytes. */
export function mintCode(randomBytes: (n: number) => Uint8Array, len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** validateClipFile: the kind from the type or the name, then the checks. */
export function checkPicked(v: PickedVideo): { ok: true; ext: ClipExt; durationSec: number | null } | { ok: false; error: string } {
  const ext = clipExtFor({ type: v.type, name: v.name });
  const durationSec = ext ? v.durationSec : null;
  const r = checkClipMeta({ size: v.size, durationSec, ext });
  if (!r.ok) return r;
  return { ok: true, ext: ext!, durationSec };
}

/** The album's quality: locked once it has a video memory (the website's
 *  tierLocked / albumTier, read from this album's own kept videos). */
export async function albumQuality(pages: readonly AlbumPage[], store: Pick<ClipStore, 'listStagedCodes' | 'stagedClipQuality'>): Promise<{ locked: boolean; tier: ClipQuality | null }> {
  const fills = pages.flatMap((p) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])]);
  const hasClip = fills.some((f) => f?.kind === 'clip');
  const codes = new Set(fills.filter((f): f is QrFill => !!f).map((f) => f.code));
  const mine = (await store.listStagedCodes()).filter((c) => codes.has(c));
  const tier = mine.length ? await store.stagedClipQuality(mine) : null;
  return { locked: hasClip || mine.length > 0, tier };
}

export interface FlowDeps {
  store: Pick<ClipStore, 'getStagedClip' | 'stageClip' | 'removeStagedClip'>;
  randomBytes: (n: number) => Uint8Array;
  /** qrPicture.ts qrPngDataUrl, with the phone's Skia. */
  qrPicture: (memUrl: string) => string;
  /** The Supabase project's address (publicClipUrl). */
  supabaseUrl: string;
  now: () => number;
}

/** "Place QR": a new memory for this video. */
export async function newMemory(
  v: PickedVideo,
  checked: { ext: ClipExt; durationSec: number | null },
  quality: ClipQuality,
  d: FlowDeps,
): Promise<QrFill> {
  let code = mintCode(d.randomBytes);
  for (let i = 0; i < 5 && (await d.store.getStagedClip(code)); i++) code = mintCode(d.randomBytes);
  const memUrl = memoryUrl(code);
  const qrPngDataUrl = d.qrPicture(memUrl);
  await d.store.stageClip({ code, ext: checked.ext, from: v.uri, size: v.size, durationSec: checked.durationSec, name: v.name, quality });
  return {
    code, destination: publicClipUrl(code, checked.ext, d.supabaseUrl), qrPngDataUrl, memoryUrl: memUrl,
    createdAt: d.now(), kind: 'clip', clipExt: checked.ext,
  };
}

/** "Use this video": the same code and printed QR, a new video. */
export async function changeMemory(
  initial: QrFill,
  v: PickedVideo,
  checked: { ext: ClipExt; durationSec: number | null },
  fallbackQuality: ClipQuality,
  d: FlowDeps,
): Promise<QrFill> {
  const prior = await d.store.getStagedClip(initial.code);
  await d.store.stageClip({
    code: initial.code, ext: checked.ext, from: v.uri, size: v.size, durationSec: checked.durationSec, name: v.name,
    quality: prior?.quality ?? fallbackQuality,
    // It replaces what was in the cloud (or a link) unless the one it
    // replaces was never sent.
    replace: initial.kind !== 'clip' || !!prior?.uploaded || !prior,
  });
  return { ...initial, kind: 'clip', clipExt: checked.ext, destination: publicClipUrl(initial.code, checked.ext, d.supabaseUrl) };
}

/** "Remove": the kept video goes with it. */
export async function removeMemory(initial: QrFill | null, d: Pick<FlowDeps, 'store'>): Promise<void> {
  if (initial) await d.store.removeStagedClip(initial.code);
}

/** AddQrModal safeHost: the link's site, for an old link memory. */
export function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'a link'; }
}
