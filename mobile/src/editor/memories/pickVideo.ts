/* "Choose a video": Android's own picker (expo-image-picker opens the
   system photo picker, so the app needs no permission to see the phone's
   videos). The video comes back as a copy the app may read; its length is
   the picker's, or read from the file (modules/video-shrink probe). */
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { probeVideo } from '../../../modules/video-shrink';
import type { PickedVideo } from './memoryFlow';

export async function pickVideoFromPhone(): Promise<PickedVideo | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  let durationSec = typeof a.duration === 'number' && a.duration > 0 ? a.duration / 1000 : null;
  if (durationSec == null) {
    const p = await probeVideo(a.uri);
    if (p && p.durationMs > 0) durationSec = p.durationMs / 1000;
  }
  let size = a.fileSize ?? 0;
  if (!size) { try { size = new File(a.uri).size ?? 0; } catch { size = 0; } }
  return { uri: a.uri, name: a.fileName || a.uri.split('/').pop() || 'video', size, type: a.mimeType ?? '', durationSec };
}
