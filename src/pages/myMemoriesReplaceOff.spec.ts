// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   REPLACE VIDEO IS SWITCHED OFF FOR NOW (owner, 2026-11-21): Replace is a
   fix for a complaint ("my video is blurry", "it's the wrong video"), not
   something to show off. The app's 2.1.5 carries it switched off, and the
   website follows ("Yes, hide it"): a video memory plays in My Memories with
   no Replace button, and Delete's question doesn't point to it
   (lib/replaceVideoSwitch.ts; myMemoriesDelete.spec.ts has the question).
   ══════════════════════════════════════════════════════════════════════════ */

const AUTH = { user: { id: 'user-1' } }; // one object: a new user every render re-runs the page's effects forever
vi.mock('../lib/authContext', () => ({ useAuth: () => AUTH }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../lib/qrMemory', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), generateQrPngDataUrl: async () => '' }));
const CLIP = 'https://example.supabase.co/storage/v1/object/public/memory-clips/wxyz6789.mp4';
const ROW = { code: 'wxyz6789', destination: CLIP, title: null, scan_count: 1, created_at: '2026-10-05T00:00:00Z', updated_at: '2026-10-05T00:00:00Z', kind: 'clip', expires_at: '2031-10-05T00:00:00Z' };
vi.mock('../lib/qrMemories', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listMemories: async () => [ROW],
  pendingTermsByCode: async () => ({}),
}));

import MyMemories from './MyMemories';
import { REPLACE_VIDEO_ON } from '../lib/replaceVideoSwitch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(createElement(MyMemories)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('Replace video, switched off for now', () => {
  it('is off', () => {
    expect(REPLACE_VIDEO_ON).toBe(false);
  });
  it('a video memory plays, with no Replace button and no file picker for it', () => {
    expect(host.querySelector('video')?.getAttribute('src')).toBe(CLIP);
    expect(host.querySelector('[data-testid="memory-replace"]')).toBeNull();
    expect(host.querySelector('input[type="file"]')).toBeNull();
    expect(host.textContent).not.toContain('Replace video');
    // Delete is still there.
    expect(host.querySelector('[data-testid="memory-delete"]')).not.toBeNull();
  });
});
