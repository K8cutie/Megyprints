/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S PAGES THE APP OPENS ("Message us", "Open on the website",
   Megyprints Events). The website is a #/ app (src/main.tsx HashRouter):
   https://megyprints.vercel.app/contact is served the front page
   (vercel.json sends every other path to index.html), so "Message us"
   opened the home page, not Contact. Every page the app opens is a #/ page
   the website has (src/App.tsx); only files from the website's public/
   folder are opened by their own path.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { sitePage } from '../src/lib/checkout/site';

const MOBILE = path.resolve(__dirname, '..');
const REPO = path.resolve(MOBILE, '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function appSources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) appSources(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('the website pages the app opens', () => {
  it('the website is a #/ app, and a plain path is served its front page', () => {
    expect(read('src/main.tsx')).toContain('<HashRouter>');
    expect(read('vercel.json')).toContain('"destination": "/index.html"');
  });

  it('sitePage: the #/ address of a page the website has', () => {
    const routes = read('src/App.tsx');
    for (const page of ['contact', 'memories', 'events']) {
      expect(routes).toContain(`<Route path="/${page}" element=`);
      expect(sitePage(page)).toBe(`https://megyprints.vercel.app/#/${page}`);
    }
    expect(sitePage('/contact')).toBe('https://megyprints.vercel.app/#/contact');
  });

  it('the app opens pages with sitePage, and only files (public/) with siteFile', () => {
    const wrong: string[] = [];
    for (const file of appSources(path.join(MOBILE, 'src'))) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/siteFile\(\s*'([^']*)'/g)) {
        const arg = m[1];
        // A file the website serves from public/ (it has a folder or a file
        // name), or the front page itself ('').
        const isFile = arg === '' || /\.[a-z0-9]+$/i.test(arg) || arg.endsWith('/');
        if (!isFile) wrong.push(`${path.relative(MOBILE, file)}: siteFile('${arg}')`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
