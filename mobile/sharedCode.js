/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S ALBUM CODE, USED BY THE APP (read by metro.config.js).

   The 2.0 app does not keep its own copy of the album rules. It imports them
   straight from the website's folder (../src), so the website and the app can
   never disagree about layouts, prices or print cutting.

   Only the files listed in ../src/shared/sharedModules.ts may come in: they
   are the ones checked to run without a browser. Metro (the app's bundler)
   asks `checkWebFile` about every file it takes from ../src, and stops the
   build with the file's name if it is not on the list. The jest test
   test/sharedImports.test.ts checks the same thing without a build.

   In the app's code, a website file is imported as '@web/<path under src>',
   for example '@web/pages/builder/albumMinimum'.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');

const MOBILE_ROOT = __dirname;
const REPO_ROOT = path.resolve(MOBILE_ROOT, '..');
const WEB_SRC = path.join(REPO_ROOT, 'src');
const LIST_FILE = path.join(WEB_SRC, 'shared', 'sharedModules.ts');
const WEB_ALIAS = '@web/';

/** The repo-relative paths in SHARED_MODULES ('src/lib/pricing.ts', …).
 *  Read as text: the list is a plain array of quoted 'src/….ts' strings. */
function readSharedList(file = LIST_FILE) {
  const text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf('SHARED_MODULES');
  const end = text.indexOf('] as const', start);
  if (start < 0 || end < 0) throw new Error(`Could not find the SHARED_MODULES list in ${file}`);
  const body = text.slice(start, end);
  return [...body.matchAll(/'(src\/[^']+\.ts)'/g)].map((m) => m[1]);
}

const toPosix = (p) => p.split(path.sep).join('/');

/** Is this absolute path inside the website's src folder? */
function isInsideWeb(file) {
  const rel = path.relative(WEB_SRC, file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** 'C:\…\src\lib\pricing.ts' → 'src/lib/pricing.ts' */
function repoPath(file) {
  return toPosix(path.relative(REPO_ROOT, file));
}

/** Throws, naming the file, when a file from ../src is not on the list. */
function checkWebFile(file, shared, importedFrom) {
  if (!isInsideWeb(file)) return;
  const rel = repoPath(file);
  if (shared.has(rel)) return;
  const from = importedFrom ? ` (imported by ${toPosix(path.relative(REPO_ROOT, importedFrom))})` : '';
  throw new Error(
    `${rel}${from} is not shared album code. The app may only import files listed in ` +
    `src/shared/sharedModules.ts. Add it there (and run npx vitest run src/shared) or ` +
    `split the browser part out of it.`,
  );
}

/** A bare package name ('react', '@supabase/supabase-js'), not a path or the alias. */
function isPackage(name) {
  return !name.startsWith('.') && !name.startsWith('/') && !path.isAbsolute(name) && !name.startsWith(WEB_ALIAS);
}

/**
 * Wraps Metro's resolver:
 *   • '@web/x' → ../src/x;
 *   • a package a website file imports (only 'react' is allowed there) comes
 *     from the app's own node_modules, so there is one React;
 *   • every file taken from ../src must be on the shared list.
 */
function makeResolveRequest(shared = new Set(readSharedList())) {
  return function resolveRequest(context, moduleName, platform) {
    let name = moduleName;
    let ctx = context;
    if (name.startsWith(WEB_ALIAS)) name = path.join(WEB_SRC, name.slice(WEB_ALIAS.length));
    else if (isPackage(name) && isInsideWeb(context.originModulePath)) {
      ctx = { ...context, originModulePath: path.join(MOBILE_ROOT, 'package.json') };
    }
    const result = context.resolveRequest(ctx, name, platform);
    if (result && result.type === 'sourceFile') checkWebFile(result.filePath, shared, context.originModulePath);
    return result;
  };
}

module.exports = {
  MOBILE_ROOT,
  REPO_ROOT,
  WEB_SRC,
  WEB_ALIAS,
  readSharedList,
  isInsideWeb,
  repoPath,
  checkWebFile,
  makeResolveRequest,
};
