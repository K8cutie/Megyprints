/* ══════════════════════════════════════════════════════════════════════════
   THE 74 CAPTION FONTS IN THE APP (src/editor/text/fonts).

   • Each font's styles are the ones the website loads (index.html and
     src/index.css, worked out again here from those two files).
   • Where each comes from: inside the app (the renderer's bundled theme
     fonts), Google Fonts the first time (the rest), or the phone (Georgia).
   • The font store's whole flow with no network and no files (fakes):
     fetched once in every style, saved, handed to the page renderer and the
     text views; found on the phone next time with no network; offline or a
     bad answer changes nothing; a tiny copy for the font list's row.
   • The page renderer really draws and measures in a downloaded font once
     it has it (headless Skia, a real font file), the page plan stops
     calling it "drawn in the phone's own font", and a page's picture name
     changes so a page drawn before the font arrived is drawn again.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { FONTS, fontFace } from '@web/pages/builder/fontCatalog';
import type { AlbumPage } from '@web/pages/builder/types';
import {
  catalogFace, fontFileName, fontsBySource, fontSource, genericOf, googleCssUrl, googlePreviewUrl, looksLikeFont, MAX_FONT_BYTES,
  parseFontCss, uiAlias, WEBSITE_STYLES, type StyleKey,
} from '../src/editor/text/fonts/fontSources';
import { createFontStore, familiesOn, type DownloadedFont, type FontStoreDeps } from '../src/editor/text/fonts/fontStore';
import { fontOffline } from '../src/editor/text/words';
import { addDrawnFonts, BUNDLED_FONTS, drawnFonts, drawnFontsVersion, fontNotDrawn, forgetAddedFonts, hasExactFont } from '../src/render/fontTable';
import { PageText } from '../src/render/pageText';
import { planPage } from '../src/render/pagePlan';
import { downloadedFontsOn, pageKey } from '../src/builder/pageImages';
import { fontFiles, fontPath, headlessSkia, REPO_ROOT } from './golden/headless';

afterEach(() => forgetAddedFonts());

/* ── The website's styles, worked out from its own two files ── */
function websiteStyles(): Map<string, Set<StyleKey>> {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(REPO_ROOT, 'src', 'index.css'), 'utf8');
  const urls = [...(html + css).matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"')\s]+/g)].map((m) => m[0]);
  const inRange = (spec: string, w: number) => {
    if (spec.includes('..')) { const [a, b] = spec.split('..').map(Number); return w >= a && w <= b; }
    return Number(spec) === w;
  };
  const out = new Map<string, Set<StyleKey>>();
  for (const u of urls) {
    for (const part of u.split('?')[1].replace(/&amp;/g, '&').split('&')) {
      if (!part.startsWith('family=')) continue;
      const [name, axesSpec] = decodeURIComponent(part.slice(7)).replace(/\+/g, ' ').split(':');
      const set = out.get(name) ?? new Set<StyleKey>();
      out.set(name, set);
      if (!axesSpec) { set.add('400'); continue; }
      const [axesStr, valsStr] = axesSpec.split('@');
      const axes = axesStr.split(',');
      for (const tuple of valsStr.split(';')) {
        const vals = axes.length === 1 ? [tuple] : tuple.split(',');
        const ital = axes.includes('ital') && vals[axes.indexOf('ital')] === '1';
        const wspec = axes.includes('wght') ? vals[axes.indexOf('wght')] : '400';
        for (const w of [400, 700]) if (inRange(wspec, w)) set.add(`${w}${ital ? 'i' : ''}` as StyleKey);
      }
    }
  }
  return out;
}

describe('where the 74 fonts come from', () => {
  it("fetches each font in exactly the styles the website loads (index.html + src/index.css)", () => {
    const web = websiteStyles();
    const order: StyleKey[] = ['400', '700', '400i', '700i'];
    for (const f of FONTS) {
      const face = fontFace(f.family);
      if (face === 'Georgia') { expect(WEBSITE_STYLES[face]).toBeUndefined(); continue; }
      expect({ face, styles: WEBSITE_STYLES[face] }).toEqual({ face, styles: order.filter((s) => web.get(face)?.has(s)) });
    }
    expect(Object.keys(WEBSITE_STYLES).sort()).toEqual(FONTS.map((f) => fontFace(f.family)).filter((f) => f !== 'Georgia').sort());
  });

  it('bundles the theme fonts, fetches the rest, and leaves Georgia to the phone', () => {
    const by = fontsBySource();
    expect(by.bundled.length + by.google.length + by.phone.length).toBe(74);
    expect(by.phone).toEqual(['Georgia']);
    // Whatever the renderer bundles is bundled here too (Cinzel, the cover title's face, included).
    const bundledFaces = [...new Set(BUNDLED_FONTS.map((b) => b.face))];
    expect(by.bundled.map((n) => fontFace(FONTS.find((f) => f.name === n)!.family)).sort()).toEqual(bundledFaces.sort());
    for (const face of ['Playfair Display', 'DM Sans', 'Dancing Script', 'Cinzel']) expect(fontSource(face)).toBe('bundled');
    for (const face of ['Lora', 'Great Vibes', 'Montserrat', 'Cutive Mono']) expect(fontSource(face)).toBe('google');
    // Megy's own text uses only bundled fonts (the themes: Playfair Display, DM Sans).
    expect(catalogFace('"Playfair Display", serif')).toBe('Playfair Display');
    expect(catalogFace('Comic Sans MS')).toBeNull();
  });

  it("asks Google Fonts for a face's styles the way css2 wants them", () => {
    expect(googleCssUrl('Lora')).toBe('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400;1,700');
    expect(googleCssUrl('Great Vibes')).toBe('https://fonts.googleapis.com/css2?family=Great+Vibes');
    expect(googleCssUrl('Cinzel')).toBe('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700');
    expect(googlePreviewUrl('Mrs Saint Delafield', 'Mrs Saint Delafield')).toBe('https://fonts.googleapis.com/css2?family=Mrs+Saint+Delafield&text=Mrs%20Saint%20Delafield');
  });

  it("reads Google's answer: one file per style, only from fonts.gstatic.com", () => {
    const css = [
      "@font-face {\n  font-family: 'Lora';\n  font-style: italic;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/lora/v37/a.ttf) format('truetype');\n}",
      "@font-face {\n  font-family: 'Lora';\n  font-style: normal;\n  font-weight: 700;\n  src: url(https://fonts.gstatic.com/s/lora/v37/b.ttf) format('truetype');\n}",
      "@font-face {\n  font-family: 'Lora';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://evil.example/c.ttf) format('truetype');\n}",
    ].join('\n');
    expect(parseFontCss(css)).toEqual([
      { style: '400i', url: 'https://fonts.gstatic.com/s/lora/v37/a.ttf' },
      { style: '700', url: 'https://fonts.gstatic.com/s/lora/v37/b.ttf' },
    ]);
  });

  it('names files and text-view fonts plainly, knows a font file, and finds the generic', () => {
    expect(fontFileName('Source Sans 3', '700i')).toBe('source-sans-3-700i.ttf');
    expect(uiAlias('Lora', 'preview')).toBe('megy-lora-preview');
    const ttf = new Uint8Array(fs.readFileSync(fontPath(BUNDLED_FONTS[0].file)));
    expect(looksLikeFont(ttf)).toBe(true);
    expect(looksLikeFont(new TextEncoder().encode('<html><body>Sign in to the Wi-Fi</body></html>'.repeat(40)))).toBe(false);
    const huge = new Uint8Array(MAX_FONT_BYTES + 1);
    huge.set(ttf.subarray(0, 4));
    expect(looksLikeFont(huge)).toBe(false);
    expect(genericOf('"Great Vibes", cursive')).toBe('cursive');
    expect(genericOf('"Inter", system-ui, sans-serif')).toBe('sans-serif');
    expect(genericOf('Georgia, "Times New Roman", serif')).toBe('serif');
  });
});

/* ── The store, on fakes ── */
const TTF = new Uint8Array(fs.readFileSync(fontPath(BUNDLED_FONTS[0].file)));
const LORA_CSS = (['normal', 'italic'] as const).flatMap((st) => [400, 700].map((w) =>
  `@font-face {\n  font-family: 'Lora';\n  font-style: ${st};\n  font-weight: ${w};\n  src: url(https://fonts.gstatic.com/s/lora/${st}${w}.ttf) format('truetype');\n}`)).join('\n');

function fakes(opts: { online?: boolean; css?: string; bytes?: Uint8Array; files?: Map<string, Uint8Array> } = {}) {
  const files = opts.files ?? new Map<string, Uint8Array>();
  const log = { css: [] as string[], bytes: [] as string[], ui: [] as string[], renderer: [] as DownloadedFont[] };
  const deps: FontStoreDeps = {
    async fetchText(url) {
      log.css.push(url);
      if (opts.online === false) throw new Error('Network request failed');
      return opts.css ?? LORA_CSS;
    },
    async fetchBytes(url) {
      log.bytes.push(url);
      if (opts.online === false) throw new Error('Network request failed');
      return opts.bytes ?? TTF;
    },
    files: {
      read: (n) => files.get(n) ?? null,
      write: (n, b) => { files.set(n, b); },
      uri: (n) => `file:///data/megy-fonts/${n}`,
      list: () => [...files.keys()],
    },
    registerUi: async (alias) => { log.ui.push(alias); },
    addToRenderer: async (fonts) => { log.renderer.push(...fonts); },
  };
  return { deps, files, log };
}

describe('the font store', () => {
  it('fetches a font the first time it is picked, in every style the website loads, and keeps it', async () => {
    const { deps, files, log } = fakes();
    const store = createFontStore(deps);
    expect(store.status('Lora')).toBe('missing');
    const p = store.ensure('"Lora", Georgia, serif');
    expect(store.status('Lora')).toBe('loading');
    expect(await p).toEqual({ ok: true });
    expect(log.css).toEqual(['https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400;1,700']);
    expect(log.bytes).toHaveLength(4);
    expect([...files.keys()].sort()).toEqual(['lora-400.ttf', 'lora-400i.ttf', 'lora-700.ttf', 'lora-700i.ttf']);
    expect(log.renderer.map((f) => f.font).sort((a, b) => a.file.localeCompare(b.file))).toEqual([
      { face: 'Lora', weight: 400, italic: false, file: 'google-fonts:lora-400.ttf' },
      { face: 'Lora', weight: 400, italic: true, file: 'google-fonts:lora-400i.ttf' },
      { face: 'Lora', weight: 700, italic: false, file: 'google-fonts:lora-700.ttf' },
      { face: 'Lora', weight: 700, italic: true, file: 'google-fonts:lora-700i.ttf' },
    ]);
    expect(log.ui.sort()).toEqual(['megy-lora-400', 'megy-lora-400i', 'megy-lora-700', 'megy-lora-700i']);
    expect(store.status('Lora')).toBe('ready');
    // The typing box writes it in the exact style's file.
    expect(store.uiFont('"Lora", Georgia, serif', true, true)).toEqual({ fontFamily: 'megy-lora-700i', fontWeight: 'normal', fontStyle: 'normal' });
    // Picked again: nothing fetched.
    expect(await store.ensure('Lora, serif')).toEqual({ ok: true });
    expect(log.css).toHaveLength(1);
  });

  it('asks once while a fetch is running, however many times it is picked', async () => {
    const { deps, log } = fakes();
    const store = createFontStore(deps);
    const [a, b] = await Promise.all([store.ensure('Lora'), store.ensure('"Lora", serif')]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(log.css).toHaveLength(1);
  });

  it('offline: nothing is saved or changed, and it says why (the editor keeps the old font)', async () => {
    const { deps, files, log } = fakes({ online: false });
    const store = createFontStore(deps);
    expect(await store.ensure('Lora')).toEqual({ ok: false, reason: 'offline' });
    expect(files.size).toBe(0);
    expect(log.renderer).toHaveLength(0);
    expect(store.status('Lora')).toBe('missing');
    expect(store.uiFont('"Lora", Georgia, serif')).toEqual({ fontFamily: 'serif', fontWeight: 'normal', fontStyle: 'normal' });
  });

  it('a web page instead of a font (a Wi-Fi sign-in page) is not saved or used', async () => {
    const { deps, files, log } = fakes({ bytes: new TextEncoder().encode('<html>Log in to the Wi-Fi</html>'.repeat(60)) });
    const store = createFontStore(deps);
    expect(await store.ensure('Lora')).toEqual({ ok: false, reason: 'offline' });
    expect(files.size).toBe(0);
    expect(log.renderer).toHaveLength(0);
  });

  it('online but no font (the server said no, it took too long): says so without blaming the internet', async () => {
    const { deps } = fakes();
    const store = createFontStore({ ...deps, fetchText: async () => { throw new Error('HTTP 503'); } });
    expect(await store.ensure('Lora')).toEqual({ ok: false, reason: 'failed' });
    const slow = createFontStore({ ...deps, fetchText: async () => { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; } });
    expect(await slow.ensure('Lora')).toEqual({ ok: false, reason: 'failed' });
    expect(fontOffline('Lora', 'Georgia', 'failed')).toBe('We could not get Lora right now. Your words stay in Georgia. Try again later.');
    expect(fontOffline('Lora', 'Georgia')).toBe("No internet: Lora can't be downloaded now. Your words stay in Georgia. Try again when you are online.");
  });

  it('a damaged saved file is not used: deleted, said, and the next pick downloads the font again', async () => {
    const first = fakes();
    await createFontStore(first.deps).ensure('Lora');
    const removed: string[] = [];
    const again = fakes({ files: first.files });
    let refuse = true;
    const store = createFontStore({
      ...again.deps,
      files: { ...again.deps.files, remove: (n) => { removed.push(n); first.files.delete(n); } },
      addToRenderer: async (fonts) => { if (refuse) throw new Error('could not read the font file'); again.log.renderer.push(...fonts); },
    });
    expect(await store.ensure('Lora')).toEqual({ ok: false, reason: 'failed' });
    expect(store.status('Lora')).toBe('missing'); // not stuck on "Getting the font…"
    expect(removed.sort()).toEqual(['lora-400.ttf', 'lora-400i.ttf', 'lora-700.ttf', 'lora-700i.ttf']);
    refuse = false;
    expect(await store.ensure('Lora')).toEqual({ ok: true }); // downloaded again
    expect(again.log.css).toHaveLength(1);
  });

  it('a downloaded file the renderer refuses is never saved', async () => {
    const { deps, files } = fakes();
    const store = createFontStore({ ...deps, addToRenderer: async () => { throw new Error('could not read the font file'); } });
    expect(await store.ensure('Lora')).toEqual({ ok: false, reason: 'failed' });
    expect(files.size).toBe(0);
    expect(store.status('Lora')).toBe('missing');
  });

  it('next time the font is on the phone: no network, into the renderer at start', async () => {
    const first = fakes();
    await createFontStore(first.deps).ensure('Lora');
    const again = fakes({ online: false, files: first.files });
    const store = createFontStore(again.deps);
    expect(await store.loadSaved()).toEqual(['Lora']);
    expect(again.log.css).toHaveLength(0);
    expect(again.log.renderer.map((f) => f.font.file).sort()).toEqual(['google-fonts:lora-400.ttf', 'google-fonts:lora-400i.ttf', 'google-fonts:lora-700.ttf', 'google-fonts:lora-700i.ttf']);
    expect(store.status('Lora')).toBe('ready');
    expect(await store.ensure('Lora')).toEqual({ ok: true });
    expect(again.log.css).toHaveLength(0);
  });

  it('bundled fonts and Georgia need nothing fetched', async () => {
    const { deps, log } = fakes();
    const store = createFontStore(deps);
    expect(await store.ensure('"Playfair Display", serif')).toEqual({ ok: true });
    expect(await store.ensure('Georgia, "Times New Roman", serif')).toEqual({ ok: true });
    expect(await store.ensure('Comic Sans MS, cursive')).toEqual({ ok: true }); // not one of the 74
    expect(log.css).toHaveLength(0);
    expect(store.status('Playfair Display')).toBe('bundled');
    expect(store.status('Georgia')).toBe('phone');
    // A bundled file the text views know (appFonts registers them).
    store.markUi('Playfair Display', '400i');
    expect(store.uiFont('"Playfair Display", serif', false, true).fontFamily).toBe('megy-playfair-display-400i');
    // Bold has no registered file here: the regular… none either, so the generic, made bold.
    expect(store.uiFont('"Playfair Display", serif', true, false)).toEqual({ fontFamily: 'serif', fontWeight: 'bold', fontStyle: 'normal' });
  });

  it("the font list's row: a tiny copy with just the name's letters, kept", async () => {
    const preview = "@font-face {\n  font-family: 'Great Vibes';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/l/font?kit=abc) format('truetype');\n}";
    const { deps, files, log } = fakes({ css: preview });
    const store = createFontStore(deps);
    expect(store.previewFont('Great Vibes')).toBeNull();
    await store.ensurePreview('Great Vibes');
    expect(log.css).toEqual(['https://fonts.googleapis.com/css2?family=Great+Vibes&text=Great%20Vibes']);
    expect(files.has('great-vibes-preview.ttf')).toBe(true);
    expect(store.previewFont('Great Vibes')).toBe('megy-great-vibes-preview');
    await store.ensurePreview('Great Vibes');
    expect(log.css).toHaveLength(1);
    // Offline: the row stays in the plain font, nothing breaks.
    const off = createFontStore(fakes({ online: false }).deps);
    await expect(off.ensurePreview('Lobster')).resolves.toBeUndefined();
    expect(off.previewFont('Lobster')).toBeNull();
  });

  it("lists every family a page's words use", () => {
    expect(familiesOn({ textElements: [{ fontFamily: 'Lora' }, { fontFamily: 'Lora' }], slotTexts: [null, { fontFamily: '"Caveat", cursive' }] })).toEqual(['Lora', '"Caveat", cursive']);
  });
});

/* ── The page renderer with a downloaded font ── */
describe('the page renderer draws a downloaded font exactly', () => {
  const page = (family: string) => ({
    id: 'p', layout: 'freeform', size: '8x8', photos: [], background: { type: 'solid', solid: '#FFFFFF' },
    textElements: [{ id: 't', text: 'Our first beach day', x: 10, y: 10, rotation: 0, opacity: 100, fontSize: 30, fontFamily: family, color: '#2D2D2D' }],
  } as unknown as AlbumPage);
  const LORA = '"Lora", Georgia, serif';

  it('measures and plans it as drawn once it is in (here: a real font file standing in for Lora)', async () => {
    const Sk = await headlessSkia();
    const text = new PageText(Sk, fontFiles());
    const look = { family: LORA, size: 40 };
    const before = text.measure('Our first beach day', look);
    expect(fontNotDrawn({ family: LORA })).toBe(`font ${LORA} (drawn in the phone's own font)`);
    expect(planPage({ page: page(LORA), albumSize: '8x8', pageIndex: 1, photoCount: 0 }).notDrawn).toContain(`font ${LORA} (drawn in the phone's own font)`);
    const req = { page: page(LORA), pageIndex: 1, albumSize: '8x8' as const, photos: [], width: 800 };
    const keyBefore = pageKey(req);
    expect(downloadedFontsOn(req.page)).toEqual([]);

    // DM Sans's upright file, downloaded as "Lora" (any real font proves the path;
    // headless Skia has no phone fonts, so before it the words fell back to the
    // first font it has, Playfair Display).
    const pf = BUNDLED_FONTS.find((b) => b.face === 'DM Sans' && b.weight === 400 && !b.italic)!;
    const bytes = new Uint8Array(fs.readFileSync(fontPath(pf.file)));
    const lora = { face: 'Lora', weight: 400 as const, italic: false, file: 'google-fonts:lora-400.ttf' };
    const v = drawnFontsVersion();
    text.addFonts([{ font: lora, bytes }]);
    addDrawnFonts([lora]);
    expect(drawnFontsVersion()).toBe(v + 1);
    expect(drawnFonts()).toContainEqual(lora);
    expect(text.hasFile('google-fonts:lora-400.ttf')).toBe(true);

    const after = text.measure('Our first beach day', look);
    const asDmSans = text.measure('Our first beach day', { family: '"DM Sans", sans-serif', size: 40 });
    expect(after).toBeCloseTo(asDmSans, 3);
    expect(after).not.toBeCloseTo(before, 1);
    expect(hasExactFont({ family: LORA })).toBe(true);
    expect(fontNotDrawn({ family: LORA })).toBeNull();
    expect(planPage({ page: page(LORA), albumSize: '8x8', pageIndex: 1, photoCount: 0 }).notDrawn).toEqual([]);
    // The page's picture gets a new name, so one drawn before the font arrived is drawn again.
    expect(downloadedFontsOn(req.page)).toEqual([`${LORA}=Lora`]);
    expect(pageKey(req)).not.toBe(keyBefore);
    // A style it has no file for is still named as made up by the app.
    expect(fontNotDrawn({ family: LORA, bold: true })).toBe(`font ${LORA} bold (no bold file: faked by the app)`);
  });

  it('a page in bundled fonts only keeps the picture name it had before downloads existed', () => {
    const req = { page: page('"Playfair Display", serif'), pageIndex: 1, albumSize: '8x8' as const, photos: [], width: 800 };
    const before = pageKey(req);
    addDrawnFonts([{ face: 'Lora', weight: 400, italic: false, file: 'google-fonts:lora-400.ttf' }]);
    expect(downloadedFontsOn(req.page)).toEqual([]);
    expect(pageKey(req)).toBe(before);
  });
});
