/* The phone's memory-video store (lib/memories/clips.ts makeClipStore) with
   the phone's real parts: kept videos in the app's own documents folder
   (memory-clips/, never the phone's shared storage), a small index in
   AsyncStorage, the app's shrinker (modules/video-shrink) and Supabase. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { shrinkVideo, videoShrinkAvailable } from '../../../modules/video-shrink';
import { supabase } from '../supabase';
import { makeClipStore, QUALITY_TARGETS, type ClipQuality, type StagedClip } from './clips';

/** The index's key (the website's IndexedDB is named megy-memory-clips). */
export const CLIP_INDEX_KEY = 'megy-memory-clips';
export const CLIP_FOLDER = 'memory-clips';
/** memoryClips.ts QUALITY_KEY: the quality picked with an album's first memory. */
export const QUALITY_KEY = 'megy-clip-quality';

function folder(): Directory {
  const dir = new Directory(Paths.document, CLIP_FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export const clipStore = makeClipStore({
  async readIndex() {
    try {
      const raw = await AsyncStorage.getItem(CLIP_INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) as Record<string, StagedClip> : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },
  async writeIndex(index) {
    await AsyncStorage.setItem(CLIP_INDEX_KEY, JSON.stringify(index));
  },
  files: {
    async keep(from, name) {
      const to = new File(folder(), name);
      if (to.exists) to.delete();
      new File(from).copy(to);
      return to.uri;
    },
    async remove(uri) {
      const f = new File(uri);
      if (f.exists) f.delete();
    },
    exists: (uri) => new File(uri).exists,
    size: (uri) => new File(uri).size ?? 0,
    bytes: (uri) => new File(uri).bytes(),
    shrunkPath: (code, stagedAt) => new File(folder(), `${code}-${stagedAt}-small.mp4`).uri,
  },
  shrink: videoShrinkAvailable
    ? (input, output, quality, onProgress) => shrinkVideo(input, output, QUALITY_TARGETS[quality], onProgress)
    : null,
  storage: supabase.storage as never,
  rpc: (name, args) => supabase.rpc(name, args) as never,
});

/** currentClipQuality / setClipQuality: the phone-wide setting. */
export async function currentClipQuality(): Promise<ClipQuality> {
  try { return (await AsyncStorage.getItem(QUALITY_KEY)) === 'hd' ? 'hd' : 'standard'; } catch { return 'standard'; }
}
export async function setClipQuality(q: ClipQuality): Promise<void> {
  try { await AsyncStorage.setItem(QUALITY_KEY, q); } catch { /* the album's own videos say it too */ }
}
