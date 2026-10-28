/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the app imports the website's album code straight from
   ../src, but only the files listed in src/shared/sharedModules.ts (the ones
   checked to run without a browser). Anything else from ../src, say
   src/lib/supabase.ts or useBuilderState.ts, would pull web-only code into
   the app and crash it on the phone.

   This test reads every file of the app (mobile/src) with the TypeScript
   parser and fails, naming the file and line, if it imports a file from
   ../src that is not on the list, directly ('@web/…' or '../../src/…') or
   through a listed file. It also checks that Metro's guard (sharedCode.js)
   reads the same list and stops a build that reaches an unlisted file.
   ══════════════════════════════════════════════════════════════════════════ */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { SHARED_MODULES, SHARED_NPM_PACKAGES } from '@web/shared/sharedModules';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharedCode = require('../sharedCode') as {
  MOBILE_ROOT: string; REPO_ROOT: string; WEB_SRC: string;
  readSharedList: () => string[];
  makeResolveRequest: (shared?: Set<string>) => (ctx: FakeContext, name: string, platform: string | null) => unknown;
};

interface FakeContext { originModulePath: string; resolveRequest: (ctx: FakeContext, name: string, platform: string | null) => unknown }

const { MOBILE_ROOT, REPO_ROOT, WEB_SRC } = sharedCode;
const LISTED = new Set<string>(SHARED_MODULES);
const APP_DIR = path.join(MOBILE_ROOT, 'src');

const toPosix = (p: string) => p.split(path.sep).join('/');
const repoPath = (abs: string) => toPosix(path.relative(REPO_ROOT, abs));
const insideWeb = (abs: string) => { const r = path.relative(WEB_SRC, abs); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Every module specifier in a file, with its line. */
function importsOf(file: string, text: string): { spec: string; line: number }[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { spec: string; line: number }[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, line: at(node) });
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) out.push({ spec: arg.text, line: at(node) });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, line: at(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The file a specifier points at, when it is a path ('@web/…' or relative); null for a package. */
function resolvePath(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@web/')) base = path.join(WEB_SRC, spec.slice(5));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (/\.(ts|tsx)$/.test(c) && existsSync(c)) return c;
  }
  return base;
}

/** Problems in app files: imports from ../src that are not listed. */
function appProblems(files: { file: string; text: string }[]): string[] {
  const problems: string[] = [];
  for (const { file, text } of files) {
    for (const { spec, line } of importsOf(file, text)) {
      const target = resolvePath(file, spec);
      if (!target) continue;
      if (!insideWeb(target) && path.relative(REPO_ROOT, target).startsWith('src')) {
        problems.push(`${repoPath(file)}:${line}  '${spec}' points into src/ but not at a file`);
      } else if (insideWeb(target) && !LISTED.has(repoPath(target))) {
        problems.push(`${repoPath(file)}:${line}  '${spec}' (${repoPath(target)}) is not in src/shared/sharedModules.ts`);
      }
    }
  }
  return problems;
}

const appFiles = filesUnder(APP_DIR).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

describe('the app imports only shared website code', () => {
  it('finds the app files, and they do use shared code', () => {
    expect(appFiles.length).toBeGreaterThan(5);
    const usesWeb = appFiles.some(({ file, text }) => importsOf(file, text).some((i) => i.spec.startsWith('@web/')));
    expect(usesWeb).toBe(true);
  });

  it('every import from ../src in the app is on the shared list', () => {
    expect(appProblems(appFiles)).toEqual([]);
  });

  it('and so is everything those files import, all the way down', () => {
    const seen = new Set<string>();
    const queue: string[] = [];
    for (const { file, text } of appFiles) {
      for (const { spec } of importsOf(file, text)) {
        const t = resolvePath(file, spec);
        if (t && insideWeb(t)) queue.push(t);
      }
    }
    const problems: string[] = [];
    const allowed: readonly string[] = SHARED_NPM_PACKAGES;
    while (queue.length) {
      const file = queue.pop() as string;
      const rel = repoPath(file);
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!LISTED.has(rel)) { problems.push(`${rel} is reached but not listed`); continue; }
      for (const { spec, line } of importsOf(file, readFileSync(file, 'utf8'))) {
        const t = resolvePath(file, spec);
        if (t) queue.push(t);
        else {
          const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          if (!allowed.includes(pkg)) problems.push(`${rel}:${line}  imports package '${spec}'`);
        }
      }
    }
    expect(problems).toEqual([]);
    // The check really walked into the album maker's own imports.
    expect(seen.has('src/pages/builder/types.ts')).toBe(true);
    expect(seen.size).toBeGreaterThan(10);
  });

  it('catches an unlisted import (a planted one)', () => {
    const fake = path.join(APP_DIR, '__fake__.tsx');
    expect(appProblems([{
      file: fake,
      text: [
        "import { MIN_ALBUM_PHOTOS } from '@web/pages/builder/albumMinimum';", // listed: fine
        "import { supabase } from '@web/lib/supabase';",
        "import { useBuilderState } from '../../src/pages/builder/useBuilderState';",
        "import type { X } from '@web/lib/useAlbumSync';",
        "import { View } from 'react-native';",                                  // a package: fine
      ].join('\n'),
    }])).toEqual([
      "mobile/src/__fake__.tsx:2  '@web/lib/supabase' (src/lib/supabase.ts) is not in src/shared/sharedModules.ts",
      "mobile/src/__fake__.tsx:3  '../../src/pages/builder/useBuilderState' (src/pages/builder/useBuilderState.ts) is not in src/shared/sharedModules.ts",
      "mobile/src/__fake__.tsx:4  '@web/lib/useAlbumSync' (src/lib/useAlbumSync.ts) is not in src/shared/sharedModules.ts",
    ]);
  });
});

describe("Metro's guard (sharedCode.js)", () => {
  it('reads the same list as the website', () => {
    expect(sharedCode.readSharedList()).toEqual([...SHARED_MODULES]);
  });

  const resolveRequest = sharedCode.makeResolveRequest();
  const appFile = path.join(APP_DIR, 'app', 'index.tsx');
  const webFile = path.join(WEB_SRC, 'pages', 'builder', 'generateAlbum.ts');
  /** A pretend Metro: answers with the file the request names (absolute), and records what it was asked. */
  const metro = (answer: (name: string) => string) => {
    const asked: { name: string; origin: string }[] = [];
    const ctx = (origin: string): FakeContext => ({
      originModulePath: origin,
      resolveRequest: (c, name) => { asked.push({ name, origin: c.originModulePath }); return { type: 'sourceFile', filePath: answer(name) }; },
    });
    return { asked, ctx };
  };

  it("turns '@web/…' into the website's file and lets a listed one in", () => {
    const m = metro((name) => `${name}.ts`);
    resolveRequest(m.ctx(appFile), '@web/lib/pricing', 'android');
    expect(repoPath(m.asked[0].name)).toBe('src/lib/pricing');
  });

  it('stops the build at an unlisted website file, naming it', () => {
    const m = metro((name) => `${name}.ts`);
    expect(() => resolveRequest(m.ctx(appFile), '@web/lib/supabase', 'android')).toThrow(/src\/lib\/supabase\.ts \(imported by mobile\/src\/app\/index\.tsx\) is not shared album code/);
    const m2 = metro(() => path.join(WEB_SRC, 'pages', 'builder', 'useBuilderState.ts'));
    expect(() => resolveRequest(m2.ctx(webFile), './useBuilderState', 'android')).toThrow(/useBuilderState\.ts .* is not shared album code/);
  });

  it("gives a website file the app's own React", () => {
    const m = metro(() => path.join(MOBILE_ROOT, 'node_modules', 'react', 'index.js'));
    resolveRequest(m.ctx(webFile), 'react', 'android');
    expect(m.asked[0].origin).toBe(path.join(MOBILE_ROOT, 'package.json'));
    // The app's own files resolve packages as usual.
    resolveRequest(m.ctx(appFile), 'react', 'android');
    expect(m.asked[1].origin).toBe(appFile);
  });
});
