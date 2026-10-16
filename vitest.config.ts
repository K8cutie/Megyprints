import { defineConfig } from 'vitest/config';

// Unit tests for the pure business logic (pricing, contact normalization, …).
// Node environment — these are framework-free functions, no DOM needed. Kept
// separate from vite.config.ts so the app build is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    // Never widen this to `.claude/**`: agent runs leave git worktrees under
    // .claude/worktrees/, each a full stale copy of this repo. A broader glob
    // re-runs the entire suite once per worktree against old code and
    // eventually fails the build on a snapshot nobody is working on.
    // (The Kraken auditor and its class-parity test moved to K8cutie/Overseer.)
    include: ['src/**/*.spec.ts', 'api/**/*.spec.mjs'],
  },
});
