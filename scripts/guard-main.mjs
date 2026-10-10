#!/usr/bin/env node
// Refuses to run a production-affecting command from any branch but main.
//
// `supabase db push` applies whatever is in ./supabase/migrations to the LIVE
// database, and it reads the folder as checked out RIGHT NOW. Run it while
// standing on a feature branch that carries an experimental migration and that
// migration lands in production with no review. This guard makes that a
// deliberate act: it must be main, or you must say so out loud.
//
//   npm run db:push                         → refused unless on main
//   ALLOW_BRANCH_DB_PUSH=1 npm run db:push  → allowed, and it prints which branch
import { execSync } from 'node:child_process';

const branch = (() => {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); }
  catch { return '(unknown)'; }
})();

const dirty = (() => {
  try { return execSync('git status --porcelain -- supabase/migrations', { encoding: 'utf8' }).trim(); }
  catch { return ''; }
})();

if (branch !== 'main' && process.env.ALLOW_BRANCH_DB_PUSH !== '1') {
  console.error(`\n✗ Refusing: you are on branch "${branch}", not main.`);
  console.error('  db:push applies ./supabase/migrations to the LIVE database exactly as checked out here.');
  console.error('  Switch to main (git checkout main) or, if this is deliberate:');
  console.error('    ALLOW_BRANCH_DB_PUSH=1 npm run db:push\n');
  process.exit(1);
}

if (dirty) {
  console.error('\n✗ Refusing: uncommitted changes under supabase/migrations:');
  console.error(dirty.split('\n').map((l) => '    ' + l).join('\n'));
  console.error('  Commit them first so what you push is what git records.\n');
  process.exit(1);
}

console.log(`✓ db:push guard: on "${branch}", migrations folder clean.`);
