/* ══════════════════════════════════════════════════════════════════════════
   THE CAPTION FONTS ON THIS PHONE: getting one from Google Fonts the first
   time, keeping it, and handing it to the two things that draw words.

   A font that is not inside the app (fontSources.ts: 'google') is fetched
   the first time a customer picks it, in every style the website loads for
   it, and saved in the app's own files (never cleared by the phone). From
   then on it is on the phone for good: every start hands the saved files to
   the page renderer before a page is drawn (BuilderProvider pageFonts), so
   pages, captions measured for "Too long for this box", and later the print
   files, all use the exact font the website prints with.

   Each font file goes to:
     • the page renderer (PageText.addFonts + fontTable.addDrawnFonts): the
       page on screen and print;
     • the phone's own text views (expo-font): the typing box in the text
       editor shows the words in that font.
   The font list shows each name in its own face from a tiny copy holding
   just those letters (about 4 KB, Google Fonts' text=), fetched as the row
   comes into view, the way the website's list downloads a face only when
   its row scrolls near.

   No internet: nothing changes. The customer's words keep the font they had,
   and the editor says so in plain words (words.ts fontOffline).

   Everything that touches the phone is handed in (FontStoreDeps), so the
   tests run the whole flow with no network and no files; the app's own
   deps are in appFontDeps.ts.
   ══════════════════════════════════════════════════════════════════════════ */
import { FONTS, fontFace } from '@web/pages/builder/fontCatalog';
import type { BundledFont } from '../../../render/fontTable';
import {
  catalogFace, fontFileName, fontSource, genericOf, googleCssUrl, googlePreviewUrl, isItalic, looksLikeFont,
  parseFontCss, styleOf, uiAlias, weightOf, WEBSITE_STYLES, type StyleKey,
} from './fontSources';

/** A downloaded font file, shaped like a bundled one for the renderer. */
export interface DownloadedFont { font: BundledFont; bytes: Uint8Array }

export interface FontStoreDeps {
  /** GET, as text. Throws when it can't (offline, the server said no). */
  fetchText(url: string): Promise<string>;
  /** GET, as bytes. Throws when it can't. */
  fetchBytes(url: string): Promise<Uint8Array>;
  /** The app's font folder. */
  files: {
    read(name: string): Uint8Array | null;
    write(name: string, bytes: Uint8Array): void;
    /** file:// address of a saved file, for the phone's text views. */
    uri(name: string): string;
    list(): string[];
  };
  /** The phone's text views: a saved file under a name. */
  registerUi(alias: string, uri: string): Promise<void>;
  /** The page renderer: drawing, measuring, print. */
  addToRenderer(fonts: readonly DownloadedFont[]): Promise<void>;
}

export type FontStatus = 'bundled' | 'phone' | 'ready' | 'missing' | 'loading';
export type EnsureResult = { ok: true } | { ok: false; reason: 'offline' };

interface FaceState {
  status: 'missing' | 'loading' | 'ready';
  styles: StyleKey[];
}

const RENDERER_PREFIX = 'google-fonts:';

export interface FontStore {
  /** Where a face stands on this phone. */
  status(face: string): FontStatus;
  /** Gets a face (all the website's styles) if it isn't here yet. Never throws. */
  ensure(family: string): Promise<EnsureResult>;
  /** Hands every font saved earlier to the renderer and the text views (app start). */
  loadSaved(): Promise<string[]>;
  /** The little copy for the font list's row. Never throws. */
  ensurePreview(face: string): Promise<void>;
  /** How the phone's text views write a family in a style: a registered
   *  file's name when there is one, else the family's generic. */
  uiFont(family: string | undefined, bold?: boolean, italic?: boolean): { fontFamily: string; fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic' };
  /** The row's face for the font list (the full regular, or the little copy). */
  previewFont(face: string): string | null;
  /** Bundled files the text views know (appFontDeps registers them). */
  markUi(face: string, style: StyleKey): void;
  subscribe(fn: () => void): () => void;
  version(): number;
}

export function createFontStore(deps: FontStoreDeps): FontStore {
  const faces = new Map<string, FaceState>();
  const running = new Map<string, Promise<EnsureResult>>();
  const ui = new Set<string>(); // registered aliases
  const previews = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let ver = 0;
  const changed = () => { ver++; listeners.forEach((l) => l()); };

  const stateOf = (face: string): FaceState => {
    let s = faces.get(face);
    if (!s) { s = { status: 'missing', styles: [] }; faces.set(face, s); }
    return s;
  };

  const toRenderer = (face: string, style: StyleKey, bytes: Uint8Array): DownloadedFont => ({
    font: { face, weight: weightOf(style), italic: isItalic(style), file: `${RENDERER_PREFIX}${fontFileName(face, style)}` },
    bytes,
  });

  /** Puts saved files to use: the renderer first (pages, measuring, print),
   *  then the text views. Resolves once the renderer has them; the text views
   *  follow (`uiReady`), and the editor re-reads when they do. */
  async function use(face: string, files: { style: StyleKey; bytes: Uint8Array }[]): Promise<{ uiReady: Promise<void> }> {
    if (!files.length) return { uiReady: Promise.resolve() };
    await deps.addToRenderer(files.map((f) => toRenderer(face, f.style, f.bytes)));
    const s = stateOf(face);
    s.status = 'ready';
    s.styles = [...new Set([...s.styles, ...files.map((f) => f.style)])];
    const uiReady = (async () => {
      for (const f of files) {
        const alias = uiAlias(face, f.style);
        try {
          await deps.registerUi(alias, deps.files.uri(fontFileName(face, f.style)));
          ui.add(alias);
        } catch { /* the typing box shows the generic; pages are right anyway */ }
      }
      changed();
    })();
    return { uiReady };
  }

  /** The face's files already saved on the phone. */
  function saved(face: string): { style: StyleKey; bytes: Uint8Array }[] {
    const out: { style: StyleKey; bytes: Uint8Array }[] = [];
    for (const style of WEBSITE_STYLES[face] ?? ['400']) {
      const bytes = deps.files.read(fontFileName(face, style));
      if (bytes && looksLikeFont(bytes)) out.push({ style, bytes });
    }
    return out;
  }

  async function download(face: string): Promise<EnsureResult> {
    const have = saved(face);
    if (have.length) {
      // Saved on an earlier visit: no network needed.
      await (await use(face, have)).uiReady;
      return { ok: true };
    }
    try {
      const refs = parseFontCss(await deps.fetchText(googleCssUrl(face)));
      if (!refs.length) return { ok: false, reason: 'offline' };
      const got: { style: StyleKey; bytes: Uint8Array }[] = [];
      for (const r of refs) {
        const bytes = await deps.fetchBytes(r.url);
        if (!looksLikeFont(bytes)) return { ok: false, reason: 'offline' };
        got.push({ style: r.style, bytes });
      }
      for (const g of got) deps.files.write(fontFileName(face, g.style), g.bytes);
      await (await use(face, got)).uiReady;
      return { ok: true };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  const store: FontStore = {
    status(face) {
      const src = fontSource(face);
      if (src === 'bundled') return 'bundled';
      if (src === 'phone') return 'phone';
      if (running.has(face)) return 'loading';
      return faces.get(face)?.status === 'ready' ? 'ready' : 'missing';
    },

    ensure(family) {
      const face = catalogFace(family);
      // Not one of the 74 (an old album's font), bundled, or Georgia: nothing to get.
      if (!face || fontSource(face) !== 'google' || faces.get(face)?.status === 'ready') return Promise.resolve({ ok: true });
      const on = running.get(face);
      if (on) return on;
      stateOf(face).status = 'loading';
      changed();
      const job = download(face).then((r) => {
        running.delete(face);
        if (!r.ok) stateOf(face).status = 'missing';
        changed();
        return r;
      });
      running.set(face, job);
      return job;
    },

    async loadSaved() {
      const names = new Set(deps.files.list());
      const loaded: string[] = [];
      for (const f of FONTS) {
        const face = fontFace(f.family);
        if (fontSource(face) !== 'google' || faces.get(face)?.status === 'ready') continue;
        if (!(WEBSITE_STYLES[face] ?? ['400']).some((s) => names.has(fontFileName(face, s)))) continue;
        const have = saved(face);
        if (!have.length) continue;
        try {
          await use(face, have);
          loaded.push(face);
        } catch { /* fetched again when it is next picked */ }
      }
      if (loaded.length) changed();
      return loaded;
    },

    ensurePreview(face) {
      if (fontSource(face) !== 'google' || faces.get(face)?.status === 'ready' || ui.has(uiAlias(face, 'preview'))) return Promise.resolve();
      const on = previews.get(face);
      if (on) return on;
      const name = FONTS.find((f) => fontFace(f.family) === face)?.name ?? face;
      const job = (async () => {
        const file = fontFileName(face, 'preview');
        let bytes = deps.files.read(file);
        if (!bytes || !looksLikeFont(bytes)) {
          const refs = parseFontCss(await deps.fetchText(googlePreviewUrl(face, name)));
          const ref = refs.find((r) => r.style === '400') ?? refs[0];
          if (!ref) return;
          bytes = await deps.fetchBytes(ref.url);
          if (!looksLikeFont(bytes)) return;
          deps.files.write(file, bytes);
        }
        await deps.registerUi(uiAlias(face, 'preview'), deps.files.uri(file));
        ui.add(uiAlias(face, 'preview'));
        changed();
      })().catch(() => { previews.delete(face); });
      previews.set(face, job);
      return job;
    },

    uiFont(family, bold, italic) {
      const face = catalogFace(family);
      const want = styleOf(bold, italic);
      const generic = { fontFamily: genericOf(family), fontWeight: bold ? 'bold' as const : 'normal' as const, fontStyle: italic ? 'italic' as const : 'normal' as const };
      if (!face) return generic;
      if (ui.has(uiAlias(face, want))) return { fontFamily: uiAlias(face, want), fontWeight: 'normal', fontStyle: 'normal' };
      // No file of that style: the regular file, made bold or slanted by the phone (as the website's browser does).
      const regular = uiAlias(face, '400');
      if (ui.has(regular)) return { ...generic, fontFamily: regular };
      return generic;
    },

    previewFont(face) {
      if (ui.has(uiAlias(face, '400'))) return uiAlias(face, '400');
      if (ui.has(uiAlias(face, 'preview'))) return uiAlias(face, 'preview');
      return null;
    },

    markUi(face, style) {
      ui.add(uiAlias(face, style));
      changed();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    version: () => ver,
  };
  return store;
}

/** Every family a page's words use (captions, free texts, words in frames). */
export function familiesOn(page: { textElements?: { fontFamily?: string }[]; slotTexts?: ({ fontFamily?: string } | null)[] }): string[] {
  const out = new Set<string>();
  for (const t of page.textElements ?? []) if (t.fontFamily) out.add(t.fontFamily);
  for (const s of page.slotTexts ?? []) if (s?.fontFamily) out.add(s.fontFamily);
  return [...out];
}
