/* ══════════════════════════════════════════════════════════════════════════
   WHERE THE ALBUM BEING MADE IS SAVED: one file in the app's own folder.

   Not AsyncStorage: Android's AsyncStorage reads one saved value only up to
   about 2 MB (a photo takes about 220 bytes saved, so about 9,500 photos),
   and "Select all" on a big phone goes past that. A bigger value is saved but
   can never be read back. A file has no such limit.

   A save writes the whole album to a second file first and then moves it over
   the first, so the saved album is always a whole one: if the phone stops in
   the middle, the last whole save is still there. Reading takes the main file,
   else the second one (the phone stopped between the two steps of a move).

   A saved album that can't be read is moved aside (keepAside), never written
   over, and the person is told (draftStore).
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

export const DRAFT_FILE = 'album-draft-v1.json';
export const DRAFT_NEXT_FILE = 'album-draft-v1.next.json';
export const DRAFT_UNREADABLE_FILE = 'album-draft-v1.unreadable.json';
/** Where the first Phase 2 test build kept the album (one AsyncStorage
 *  value). Read once if there is no file yet; never written again. */
export const OLD_DRAFT_KEY = 'megy-2.0-album-draft-v1';

export interface DraftStorage {
  /** The saved album's text. Null: nothing saved. Throws: something is
   *  saved but could not be read. */
  read(): Promise<string | null>;
  /** Saves the album's text, all of it or nothing. */
  write(text: string): Promise<void>;
  /** Moves a save that could not be read out of the way, so the next save
   *  never lands on it. */
  keepAside(): Promise<void>;
}

const inAppFolder = (name: string) => new File(Paths.document, name);

export const fileDraftStorage: DraftStorage = {
  async read() {
    for (const name of [DRAFT_FILE, DRAFT_NEXT_FILE]) {
      const f = inAppFolder(name);
      if (f.exists) return f.text();
    }
    return AsyncStorage.getItem(OLD_DRAFT_KEY);
  },

  async write(text) {
    const next = inAppFolder(DRAFT_NEXT_FILE);
    await next.write(text);
    await next.move(inAppFolder(DRAFT_FILE), { overwrite: true });
  },

  async keepAside() {
    for (const name of [DRAFT_FILE, DRAFT_NEXT_FILE]) {
      const f = inAppFolder(name);
      if (f.exists) {
        await f.move(inAppFolder(DRAFT_UNREADABLE_FILE), { overwrite: true });
        return;
      }
    }
    // The old AsyncStorage value: nothing writes there any more, so it stays as it is.
  },
};
