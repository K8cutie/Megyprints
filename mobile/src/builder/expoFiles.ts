/* The builder store's files on the phone: expo-file-system's synchronous
   File calls (SDK 58: writeSync, moveSync, textSync), in one folder of the
   app's own documents (kept until the app is uninstalled, never in the
   phone's shared storage). Kept apart from deviceStore.ts so jest can test
   the store on files in memory. */
import { Directory, File, Paths } from 'expo-file-system';
import type { SyncFiles } from './deviceStore';

export const BUILDER_STORE_FOLDER = 'album-builder';

export function expoSyncFiles(folder = BUILDER_STORE_FOLDER): SyncFiles {
  let dir: Directory | null = null;
  const at = (name: string) => {
    if (!dir) {
      dir = new Directory(Paths.document, folder);
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    }
    return new File(dir, name);
  };
  return {
    read(name) {
      const f = at(name);
      return f.exists ? f.textSync() : null;
    },
    write(name, text) {
      const f = at(name);
      if (!f.exists) f.create();
      f.writeSync(text);
    },
    move(from, to) {
      at(from).moveSync(at(to), { overwrite: true });
    },
    remove(name) {
      const f = at(name);
      if (f.exists) f.delete();
    },
  };
}
