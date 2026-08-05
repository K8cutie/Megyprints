import { defineConfig } from 'vitest/config';

// Unit tests for the pure business logic (pricing, contact normalization, …).
// Node environment — these are framework-free functions, no DOM needed. Kept
// separate from vite.config.ts so the app build is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    // The auditor workflows live in .claude/workflows, and their attack-class
    // parity check has to run in the SAME `npm test` a developer already runs,
    // or it will not fire when it matters.
    //
    // Scoped to that ONE directory, not `.claude/**`: agent runs leave git
    // worktrees under .claude/worktrees/, each a full stale copy of this repo.
    // A broader glob re-runs the entire suite once per worktree against old
    // code — 209 tests instead of 77 — and eventually fails the build on a
    // snapshot nobody is working on.
    include: ['src/**/*.spec.ts', 'api/**/*.spec.mjs', '.claude/workflows/*.spec.ts'],
  },
});
