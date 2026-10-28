/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the 2.0 native Android app (React Native) imports the files
   in sharedModules.ts directly from this repo. One copy of the album rules
   (layouts, templates, prices, print-sheet cutting, the 40-photo minimum…)
   for the website and the app, so the two can never disagree.

   That only works while those files stay free of browser-only code. A
   `window.` or `localStorage` or `import { fabric }` that is fine on the
   website crashes the app on the first page it opens. This test reads every
   listed file and fails, naming the file and line, if it:
     • imports a file that is not on the list (type-only imports too: the
       app's type check reads them), or an npm package that is not in
       SHARED_NPM_PACKAGES. A file whose name.native.ts twin is listed is
       fine: the app's bundler and type check take the twin, which must
       export the same names (checked here too);
     • imports a web-only package (fabric, jsPDF, pdf-lib, pdf.js, Supabase,
       face-api, TensorFlow, libheif, mp4-muxer, react-dom);
     • uses the browser: document. window. navigator. localStorage
       sessionStorage indexedDB, canvas (getContext(, HTMLCanvasElement,
       OffscreenCanvas, CanvasRenderingContext2D, ImageData, ImageBitmap,
       createImageBitmap), new Image(), HTMLImageElement / HTMLVideoElement /
       HTMLElement, FileReader, DOMParser, a browser photo (Blob, File,
       FileList) or a blob: URL (URL.createObjectURL / URL.revokeObjectURL).
       React Native's types declare URL, Blob and File too, so the app's own
       type check would not catch these: on the phone createObjectURL throws
       or reads a picked photo as if it were an RN Blob;
     • uses the website's build tool: import.meta (Vite) or __MEGY_BUILD__.

   The files are read with the TypeScript parser, so words in comments and
   strings don't count, and `typeof window` (a safe check) is allowed.

   The album builder's state (useBuilderState) is not on the list yet (it
   still imports website files), but Phase 0b took every browser call out of
   it: the same browser check (not the import check) runs on it already, so
   none can come back while it waits.

   How to fix a failure: move the browser part into its own file that is
   not on the list (the website keeps using it; the app gets its own
   version), or take the file off the list and say why in the PR.
   ══════════════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import ts from 'typescript';
import { SHARED_MODULES, SHARED_NPM_PACKAGES } from './sharedModules';

const ROOT = resolve(__dirname, '../..');

/** Packages that only work in a browser (or only on the server for the web). */
const WEB_ONLY_PACKAGES = ['fabric', 'pdf-lib', 'jspdf', 'pdfjs-dist', '@supabase', 'face-api.js', '@tensorflow', '@tensorflow-models', 'libheif-js', 'mp4-muxer', 'react-dom'];

/** Banned when used as `name.x` or `name[x]`. A bare `typeof window` check is fine. */
const BROWSER_OBJECTS = ['document', 'window', 'navigator'];

/** Banned anywhere they are used (values and types alike: the app has no DOM types). */
const BROWSER_NAMES = [
  'localStorage', 'sessionStorage', 'indexedDB',
  'HTMLCanvasElement', 'OffscreenCanvas', 'OffscreenCanvasRenderingContext2D', 'CanvasRenderingContext2D',
  'ImageData', 'ImageBitmap', 'createImageBitmap', 'Image',
  'HTMLImageElement', 'HTMLVideoElement', 'HTMLElement',
  'FileReader', 'DOMParser',
  'Blob', 'File', 'FileList',
  '__MEGY_BUILD__',
];

/** Banned as `URL.name` (blob: URLs are the browser's; `new URL(…)` is fine). */
const BLOB_URL_CALLS = ['createObjectURL', 'revokeObjectURL'];

interface Problem { line: number; what: string }

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function isWebOnlyPackage(name: string): boolean {
  return WEB_ONLY_PACKAGES.some((p) => name === p || (p.startsWith('@') && !p.includes('/') && name.startsWith(p + '/')));
}

/** './types' from src/pages/builder/x.ts → 'src/pages/builder/types.ts' (or what exists). */
function resolveLocal(fromFile: string, spec: string): string {
  const base = spec.startsWith('@/')
    ? 'src/' + spec.slice(2)
    : posix.normalize(posix.join(posix.dirname(fromFile), spec));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(resolve(ROOT, candidate))) return candidate;
  }
  return base;
}

/** 'src/lib/x.ts' → 'src/lib/x.native.ts' (a .tsx keeps its .tsx): the file
 *  the app's bundler (Metro) and type check (moduleSuffixes) take in its
 *  place, when there is one. */
function nativeTwin(file: string): string {
  return file.replace(/(?<!\.native)\.(tsx?)$/, '.native.$1');
}

/** Every file that can stand in for `file` in the app: x.native.ts or
 *  x.native.tsx (Metro and moduleSuffixes take either, for x.ts or x.tsx). */
function nativeTwins(file: string): string[] {
  const base = file.replace(/(?<!\.native)\.tsx?$/, '');
  return base === file ? [file] : [`${base}.native.ts`, `${base}.native.tsx`];
}

/** The website file a twin stands in for: name.ts, else name.tsx. */
function websiteFileOf(twin: string): string {
  const base = twin.replace(/\.native\.tsx?$/, '');
  return [`${base}.ts`, `${base}.tsx`].find((f) => existsSync(resolve(ROOT, f))) ?? `${base}.ts`;
}

/** The names a file exports (declarations and `export { … }`). */
function exportedNames(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names: string[] = [];
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && !!ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    } else if (exported && (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st)
      || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) {
      names.push(st.name.text);
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const e of st.exportClause.elements) names.push(e.name.text);
    } else if (ts.isExportDeclaration(st) && !st.exportClause) {
      names.push(`* from ${(st.moduleSpecifier as ts.StringLiteral | undefined)?.text ?? '?'}`);
    }
  }
  return names.sort();
}

/** Is this identifier a property/member NAME (obj.name, { name: … }) rather than a use of a global? */
function isMemberName(id: ts.Identifier): boolean {
  const p = id.parent;
  return (ts.isPropertyAccessExpression(p) && p.name === id)
    || (ts.isPropertyAssignment(p) && p.name === id)
    || (ts.isPropertySignature(p) && p.name === id)
    || (ts.isPropertyDeclaration(p) && p.name === id)
    || (ts.isMethodDeclaration(p) && p.name === id)
    || (ts.isMethodSignature(p) && p.name === id)
    || (ts.isGetAccessorDeclaration(p) && p.name === id)
    || (ts.isSetAccessorDeclaration(p) && p.name === id)
    || (ts.isEnumMember(p) && p.name === id)
    || (ts.isQualifiedName(p) && p.right === id)
    || (ts.isBindingElement(p) && p.propertyName === id)
    || ts.isImportSpecifier(p)
    || ts.isExportSpecifier(p);
}

/** Everything in one file that would stop it running in the native app. */
function findProblems(file: string, text: string, listed: ReadonlySet<string>): Problem[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const problems: Problem[] = [];
  const add = (node: ts.Node, what: string) =>
    problems.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, what });
  const allowed: readonly string[] = SHARED_NPM_PACKAGES;

  const checkImport = (node: ts.Node, spec: string, typeOnly: boolean) => {
    const kind = typeOnly ? 'type import' : 'import';
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      const target = resolveLocal(file, spec);
      // A listed name.native.ts twin stands in for name.ts in the app.
      if (!listed.has(target) && !nativeTwins(target).some((t) => listed.has(t))) add(node, `${kind} '${spec}' (${target}) is not a shared file`);
      return;
    }
    const name = packageName(spec);
    if (isWebOnlyPackage(name)) add(node, `${kind} '${spec}': a web-only package`);
    else if (!allowed.includes(name)) add(node, `${kind} '${spec}': npm package not in SHARED_NPM_PACKAGES`);
  };

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(node) ? !!node.importClause?.isTypeOnly : node.isTypeOnly;
      checkImport(node, node.moduleSpecifier.text, typeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      checkImport(node, node.moduleReference.expression.text, node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) checkImport(node, arg.text, false);
      else add(node, 'import() of a computed path');
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) checkImport(node, arg.text, false);
      else add(node, 'require() of a computed path');
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      checkImport(node, node.argument.literal.text, true);
    } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      add(node, 'uses import.meta (only the website build has it)');
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && (node.expression.text === 'globalThis' || node.expression.text === 'self')
      && [...BROWSER_OBJECTS, ...BROWSER_NAMES].includes(node.name.text)) {
      add(node, `uses ${node.expression.text}.${node.name.text} (browser only)`);
    } else if (ts.isPropertyAccessExpression(node) && node.name.text === 'getContext'
      && ts.isCallExpression(node.parent) && node.parent.expression === node) {
      add(node, 'uses getContext( (a browser canvas)');
    } else if (ts.isPropertyAccessExpression(node) && BLOB_URL_CALLS.includes(node.name.text)
      && ((ts.isIdentifier(node.expression) && node.expression.text === 'URL')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'URL'))) {
      add(node, `uses URL.${node.name.text} (a browser blob: URL)`);
    } else if (ts.isIdentifier(node) && !isMemberName(node)) {
      const p = node.parent;
      const isObject = (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === node;
      if (BROWSER_OBJECTS.includes(node.text) && isObject) add(node, `uses ${node.text}. (browser only)`);
      if (BROWSER_NAMES.includes(node.text)) add(node, `uses ${node.text} (browser only)`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return problems;
}

const LISTED: ReadonlySet<string> = new Set<string>(SHARED_MODULES);
const asLines = (file: string, problems: Problem[]) => problems.map((p) => `${file}:${p.line}  ${p.what}`);

describe('shared album code (the 2.0 app imports these files)', () => {
  it('the list is tidy: real .ts source files, each once, in order', () => {
    const list: readonly string[] = SHARED_MODULES;
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size, 'a file is listed twice').toBe(list.length);
    expect([...list].sort(), 'keep SHARED_MODULES in plain sort order').toEqual([...list]);
    const bad = list.filter((f) =>
      !f.startsWith('src/') || !f.endsWith('.ts') || f.endsWith('.d.ts') || /\.(spec|test)\.ts$/.test(f)
      || !existsSync(resolve(ROOT, f)));
    expect(bad, 'listed paths must be existing non-test .ts files under src/').toEqual([]);
  });

  it('no web-only package is allowed', () => {
    expect(SHARED_NPM_PACKAGES.filter((p) => isWebOnlyPackage(p))).toEqual([]);
  });

  it.each(SHARED_MODULES)('%s imports only shared code and uses no browser', (file) => {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    expect(asLines(file, findProblems(file, text, LISTED))).toEqual([]);
  });

  // A twin stands in for the website's file in the app, so whatever imports
  // one gets the other: they must offer the same names.
  const twins = SHARED_MODULES.filter((f) => /\.native\.tsx?$/.test(f));
  it.each(twins)('%s exports the same names as the website file it stands in for', (twin) => {
    const web = websiteFileOf(twin);
    expect(existsSync(resolve(ROOT, web)), `${web} (the website's file) is missing`).toBe(true);
    expect(exportedNames(twin, readFileSync(resolve(ROOT, twin), 'utf8')))
      .toEqual(exportedNames(web, readFileSync(resolve(ROOT, web), 'utf8')));
  });
});

// Not shared yet (it imports website files), but it uses no browser itself.
const NOT_YET_SHARED = ['src/pages/builder/useBuilderState.ts'];
const isImportProblem = (p: Problem) => / is not a shared file$/.test(p.what);
describe('files on their way to the shared list use no browser themselves', () => {
  it.each(NOT_YET_SHARED)('%s', (file) => {
    expect(LISTED.has(file), `${file} is listed now: take it out of NOT_YET_SHARED`).toBe(false);
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    expect(asLines(file, findProblems(file, text, LISTED).filter((p) => !isImportProblem(p)))).toEqual([]);
  });
});

describe('the check itself catches browser code', () => {
  // A pretend file inside the builder folder, so './types' resolves to a listed file.
  const FAKE = 'src/pages/builder/__fake__.ts';
  const whats = (src: string) => findProblems(FAKE, src, LISTED).map((p) => `${p.line}: ${p.what}`);

  it('flags web-only packages, unlisted files and unknown packages, naming the line', () => {
    expect(whats([
      "import type { AlbumPage } from './types';",          // listed: fine
      "import { fabric } from 'fabric';",
      "import { supabase } from '../../lib/supabase';",
      "import type { X } from './useBuilderState';",
      "import { format } from 'date-fns';",
      "export * from '@supabase/supabase-js';",
      "const j = await import('jspdf');",
      "import { useState } from 'react';",                   // allow-listed: fine
      "import { createRoot } from 'react-dom/client';",
    ].join('\n'))).toEqual([
      "2: import 'fabric': a web-only package",
      "3: import '../../lib/supabase' (src/lib/supabase.ts) is not a shared file",
      "4: type import './useBuilderState' (src/pages/builder/useBuilderState.ts) is not a shared file",
      "5: import 'date-fns': npm package not in SHARED_NPM_PACKAGES",
      "6: import '@supabase/supabase-js': a web-only package",
      "7: import 'jspdf': a web-only package",
      "9: import 'react-dom/client': a web-only package",
    ]);
  });

  it('a website file with a listed .native.ts twin may be imported (the app gets the twin); one without may not', () => {
    expect(whats([
      "import { defaultBuilderPlatform } from '../../lib/defaultBuilderPlatform';",
      "import { browserBuilderPlatform } from '../../lib/browserPlatform';",
    ].join('\n'))).toEqual([
      "2: import '../../lib/browserPlatform' (src/lib/browserPlatform.ts) is not a shared file",
    ]);
    expect(nativeTwin('src/lib/x.ts')).toBe('src/lib/x.native.ts');
    expect(nativeTwin('src/lib/x.tsx')).toBe('src/lib/x.native.tsx');
    expect(nativeTwin('src/lib/x.native.ts')).toBe('src/lib/x.native.ts');
    expect(nativeTwins('src/lib/x.tsx')).toEqual(['src/lib/x.native.ts', 'src/lib/x.native.tsx']);
    expect(nativeTwins('src/lib/x.ts')).toEqual(['src/lib/x.native.ts', 'src/lib/x.native.tsx']);
    // The website file a twin stands in for may be a .tsx.
    expect(websiteFileOf('src/pages/builder/BuilderSetup.native.ts')).toBe('src/pages/builder/BuilderSetup.tsx');
    expect(websiteFileOf('src/lib/defaultBuilderPlatform.native.ts')).toBe('src/lib/defaultBuilderPlatform.ts');
  });

  it('flags a browser photo and a blob: URL, but not a plain URL', () => {
    expect(whats([
      'const u = URL.createObjectURL(x);',
      'URL.revokeObjectURL(u);',
      "const f = new File([], 'a.jpg');",
      'function take(list: FileList, b: Blob) { return [list, b]; }',
      'const v = globalThis.URL.createObjectURL(x);',
      "const ok = new URL('https://megyprints.com/a').pathname;",
      'const fine = { File: 1, Blob: 2 };',
    ].join('\n'))).toEqual([
      '1: uses URL.createObjectURL (a browser blob: URL)',
      '2: uses URL.revokeObjectURL (a browser blob: URL)',
      '3: uses File (browser only)',
      '4: uses FileList (browser only)',
      '4: uses Blob (browser only)',
      '5: uses URL.createObjectURL (a browser blob: URL)',
    ]);
  });

  it('flags browser globals, canvas and the website build', () => {
    expect(whats([
      'const w = window.innerWidth;',
      "localStorage.setItem('a', 'b');",
      "const c = document.createElement('canvas');",
      "const ctx = c.getContext('2d');",
      'const img = new Image();',
      'function draw(x: CanvasRenderingContext2D) { return x; }',
      'const v = import.meta.env.VITE_X;',
      'const ua = navigator.userAgent;',
      'const s = globalThis.sessionStorage;',
    ].join('\n'))).toEqual([
      '1: uses window. (browser only)',
      '2: uses localStorage (browser only)',
      '3: uses document. (browser only)',
      '4: uses getContext( (a browser canvas)',
      '5: uses Image (browser only)',
      '6: uses CanvasRenderingContext2D (browser only)',
      '7: uses import.meta (only the website build has it)',
      '8: uses navigator. (browser only)',
      '9: uses globalThis.sessionStorage (browser only)',
    ]);
  });

  it('ignores comments, strings, property names and a typeof check', () => {
    expect(whats([
      '// window.innerWidth and localStorage in a comment',
      "/* import { fabric } from 'fabric' */",
      "const label = 'Open window.document';",
      'const opts = { document: 1, window: 2 };',
      'const n = opts.window + opts.document;',
      "const onWeb = typeof window !== 'undefined';",
      'interface Box { image: string; localStorage?: never }',
    ].join('\n'))).toEqual([]);
  });
});
