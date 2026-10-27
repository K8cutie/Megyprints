import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   THE PRESS-SHEET TOOL STAYS OFF CUSTOMERS' PHONES. pdf-lib (~430 KB) is for
   the console only: it loads on the operator's click, and the offline cache
   (vite.config.ts globIgnores) skips its chunk. That only holds while the
   tool is reached by ONE dynamic import, so Rollup names the chunk after it.
   ══════════════════════════════════════════════════════════════════════════ */

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('press-sheet tool loading', () => {
  it('the offline cache skips the tool\'s chunk', () => {
    expect(read('vite.config.ts')).toMatch(/globIgnores:\s*\[[^\]]*'\*\*\/printSheetPdf-\*\.js'/);
  });

  it('only the console reaches it, and only by a dynamic import', () => {
    const importers = sources(join(ROOT, 'src')).filter((p) => /['"][./]*(pages\/builder\/)?printSheetPdf['"]/.test(readFileSync(p, 'utf8')));
    expect(importers.map((p) => p.slice(ROOT.length + 1).replace(/\\/g, '/'))).toEqual(['src/lib/pressSheetFiles.ts']);
    const src = read('src/lib/pressSheetFiles.ts');
    expect(src).toContain("import('../pages/builder/printSheetPdf')");
    expect(src).not.toMatch(/^import [^\n]*printSheetPdf/m);
    expect(read('src/pages/builder/printSheetPdf.ts')).toContain("from 'pdf-lib'");
    // pdf-lib itself is never imported anywhere a customer page loads.
    const pdfLib = sources(join(ROOT, 'src')).filter((p) => /from 'pdf-lib'/.test(readFileSync(p, 'utf8')));
    expect(pdfLib.map((p) => p.slice(ROOT.length + 1).replace(/\\/g, '/'))).toEqual(['src/pages/builder/printSheetPdf.ts']);
  });

  it('pdf.js ("Sheets as JPEG") the same way: one dynamic import, skipped by the offline cache', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toMatch(/globIgnores:\s*\[[^\]]*'\*\*\/pressSheetJpeg-\*\.js'/);
    expect(cfg).toMatch(/globIgnores:\s*\[[^\]]*'\*\*\/pdf\.worker\*'/);
    const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, '/');
    const pdfjs = sources(join(ROOT, 'src')).filter((p) => /from 'pdfjs-dist/.test(readFileSync(p, 'utf8')));
    expect(pdfjs.map(rel)).toEqual(['src/lib/pressSheetJpeg.ts']);
    const importers = sources(join(ROOT, 'src')).filter((p) => /['"][./]*(lib\/)?pressSheetJpeg['"]/.test(readFileSync(p, 'utf8')));
    expect(importers.map(rel)).toEqual(['src/lib/pressSheetFiles.ts']);
    expect(read('src/lib/pressSheetFiles.ts')).toContain("import('./pressSheetJpeg')");
  });
});
