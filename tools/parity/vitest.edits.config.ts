import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The website's half of the edit parity check only (see webEdits.spec.ts).
// Kept out of the website's own test run (vitest.config.ts includes src/**
// only): it writes a file for the app's test to read.
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  test: {
    root: path.resolve(here, '..', '..'),
    include: ['tools/parity/webEdits.spec.ts'],
    environment: 'node',
  },
});
