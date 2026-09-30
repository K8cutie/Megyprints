/* ══════════════════════════════════════════════════════════════════════════
   Uncapped multi-photo picker for the native Android shell.

   On Android, <input type=file multiple accept="image/*"> opens the system
   Photo Picker, which stops at ~100 photos per pick. Inside the Capacitor shell
   we route those inputs to the document picker instead (no cap, and it has
   "Select all"). On the plain web / old TWA nothing here runs — the normal
   <input> keeps working, so this is purely additive.

   ONE capture-phase listener covers every photo button (builder, assistant,
   mobile review, panel): it swaps the native pick in, then hands the files to
   the input's existing onChange — no per-site changes.
   ══════════════════════════════════════════════════════════════════════════ */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface PickedRef { uri: string; name: string; mimeType: string; size?: number }
interface MegyPhotoPickerPlugin {
  pick(): Promise<{ files: PickedRef[] }>;
  read(o: { uri: string }): Promise<{ data: string }>;
}
// Custom native plugin: android-native/.../MegyPhotoPickerPlugin.java
const MegyPhotoPicker = registerPlugin<MegyPhotoPickerPlugin>('MegyPhotoPicker');

const isPhotoInput = (el: EventTarget | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === 'file' && el.multiple &&
  (el.accept || '').includes('image');

/** Read each picked photo one at a time into a File — never all bytes in memory at once. */
async function toFiles(picked: PickedRef[]): Promise<File[]> {
  const out: File[] = [];
  for (const p of picked) {
    if (!p.mimeType.startsWith('image/')) continue;
    try {
      const { data } = await MegyPhotoPicker.read({ uri: p.uri });
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      out.push(new File([bytes], p.name, { type: p.mimeType }));
    } catch {
      /* one unreadable photo must not sink the other 199 */
    }
  }
  return out;
}

let busy = false;

export function installNativePhotoPicker(): void {
  if (!Capacitor.isNativePlatform()) return;
  document.addEventListener('click', (e) => {
    const input = e.target;
    if (!isPhotoInput(input) || busy) return;
    e.preventDefault();
    busy = true;
    void (async () => {
      try {
        const { files } = await MegyPhotoPicker.pick();
        const picked = await toFiles(files);
        if (picked.length === 0) return;
        const dt = new DataTransfer();
        picked.forEach((f) => dt.items.add(f));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {
        /* user cancelled the picker — nothing to add */
      } finally {
        busy = false;
      }
    })();
  }, true);
}
