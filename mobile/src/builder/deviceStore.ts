/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM BUILDER'S STORES ON THE PHONE (shared/platform.ts KeyValueStore).

   The website's album builder (useBuilderState, shared code) keeps the album
   in progress under a name ('megy-album-v5'), and a few small things beside
   it (the occasion, the account's version of the album), in the browser's
   localStorage. In the app the same names are kept in files, ONE FILE PER
   NAME, in the app's own folder.

   Synchronous on purpose, as the builder needs: it reads its draft before
   its first screen, and when the app goes to the background it saves the
   album and counts it safe once setItem returns. So setItem hands the value
   to the system before it returns (expo-file-system's writeSync), never to
   an in-memory copy written later. Not AsyncStorage: Android's reads a value
   only up to about 2 MB, and a big album's draft is bigger.

   A value is written to a second file and then moved over the first, so a
   saved value is always a whole one: if the phone stops in the middle, the
   last whole value is still there, and a read finds it (the main file, else
   the second one: the phone stopped between the two steps).

   Reads are kept in memory after the first (the builder reads its draft
   once per piece of its state on its first screen); every write goes to the
   file first, then to that copy.
   ══════════════════════════════════════════════════════════════════════════ */
import type { KeyValueStore } from '@web/shared/platform';

/** The few file steps the store needs, all synchronous. */
export interface SyncFiles {
  /** The file's text, or null when there is no such file. */
  read(name: string): string | null;
  /** Writes the whole text, creating the file if needed. */
  write(name: string, text: string): void;
  /** Moves `from` over `to` (replacing it). */
  move(from: string, to: string): void;
  remove(name: string): void;
}

/** A name ('megy-album-v5', 'megy-quotes:Wedding') as a safe file name. */
export function fileNameFor(key: string): string {
  return `${encodeURIComponent(key).replace(/\*/g, '%2A')}.txt`;
}
const nextName = (file: string) => `${file}.next`;

/** A KeyValueStore kept in files: see the top of this file. */
export function fileKeyValueStore(files: SyncFiles): KeyValueStore & { forget(): void } {
  const known = new Map<string, string | null>();
  return {
    getItem(key) {
      if (known.has(key)) return known.get(key) ?? null;
      const file = fileNameFor(key);
      const value = files.read(file) ?? files.read(nextName(file));
      known.set(key, value);
      return value;
    },
    setItem(key, value) {
      const file = fileNameFor(key);
      const v = String(value);
      files.write(nextName(file), v);
      files.move(nextName(file), file);
      known.set(key, v);
    },
    removeItem(key) {
      const file = fileNameFor(key);
      files.remove(file);
      files.remove(nextName(file));
      known.set(key, null);
    },
    /** Drop the copies in memory (tests: a "restart" reads the files again). */
    forget() { known.clear(); },
  };
}

/** For this visit only (the website's sessionStorage): kept in memory, gone
 *  when the app is closed. */
export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}
