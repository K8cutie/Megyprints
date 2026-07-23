import { defineConfig } from 'vitest/config';

// Unit tests for the pure business logic (pricing, contact normalization, …).
// Node environment — these are framework-free functions, no DOM needed. Kept
// separate from vite.config.ts so the app build is untouched.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'api/**/*.spec.mjs'],
  },
});
