/* The app's one font store (fontStore.ts) on the phone's real pieces:
   Google Fonts over the network, the app's own files (Paths.document, which
   the phone never clears), expo-font for the text views, and the page
   renderer's PageText.

   BuilderProvider hands the page renderer over once its bundled fonts are
   in (loadDownloadedFonts), and the fonts saved on earlier visits go in
   before the first page is drawn. A font fetched before that waits and goes
   in with them: the page plan (fontTable.addDrawnFonts) is only told once
   PageText really has the file. */
import { Directory, File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import { addDrawnFonts, BUNDLED_FONTS } from '../../../render/fontTable';
import type { PageText } from '../../../render/pageText';
import { FONT_ASSETS } from '../../../builder/fontAssets';
import { createFontStore, type DownloadedFont, type FontStore, type FontStoreDeps } from './fontStore';
import { styleOf, uiAlias } from './fontSources';

const FOLDER = 'megy-fonts';
/** A font download that takes longer is given up (the customer is told). */
const FETCH_MS = 20000;

function folder(): Directory {
  const d = new Directory(Paths.document, FOLDER);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

async function get(url: string): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), FETCH_MS);
  try {
    const r = await fetch(url, { signal: stop.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  } finally {
    clearTimeout(timer);
  }
}

let text: PageText | null = null;
const waiting: DownloadedFont[] = [];

function intoRenderer(t: PageText, fonts: readonly DownloadedFont[]): void {
  t.addFonts(fonts);
  addDrawnFonts(fonts.map((f) => f.font));
}

const deps: FontStoreDeps = {
  fetchText: async (url) => (await get(url)).text(),
  fetchBytes: async (url) => new Uint8Array(await (await get(url)).arrayBuffer()),
  files: {
    read(name) {
      try {
        const f = new File(folder(), name);
        return f.exists ? f.bytesSync() : null;
      } catch {
        return null;
      }
    },
    write(name, bytes) {
      new File(folder(), name).writeSync(bytes);
    },
    uri: (name) => new File(folder(), name).uri,
    list() {
      try {
        return folder().list().filter((f): f is File => f instanceof File).map((f) => f.name);
      } catch {
        return [];
      }
    },
  },
  registerUi: (alias, uri) => Font.loadAsync({ [alias]: uri }),
  async addToRenderer(fonts) {
    if (text) intoRenderer(text, fonts);
    else waiting.push(...fonts);
  },
};

export const fontStore: FontStore = createFontStore(deps);

let bundledUi: Promise<void> | null = null;
/** The bundled fonts for the text views too (the typing box, the font list). */
export function registerBundledFonts(): Promise<void> {
  if (!bundledUi) {
    bundledUi = (async () => {
      for (const f of BUNDLED_FONTS) {
        const id = FONT_ASSETS[f.file];
        if (id == null) continue;
        const style = styleOf(f.weight === 700, f.italic);
        try {
          await Font.loadAsync({ [uiAlias(f.face, style)]: id });
          fontStore.markUi(f.face, style);
        } catch { /* shown in the generic; pages are drawn right anyway */ }
      }
    })();
  }
  return bundledUi;
}

/** The page renderer is ready: give it the fonts saved on earlier visits (and
 *  any fetched meanwhile) before a page is drawn. Never throws. */
export async function loadDownloadedFonts(t: PageText): Promise<void> {
  text = t;
  try {
    if (waiting.length) intoRenderer(t, waiting.splice(0));
    await fontStore.loadSaved();
  } catch (e) {
    console.warn('Could not load the downloaded fonts', e);
  }
  void registerBundledFonts();
}
