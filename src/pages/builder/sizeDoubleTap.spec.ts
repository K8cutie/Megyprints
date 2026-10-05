// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   A DOUBLE TAP PICKS ONE SIZE (1-star testers round 3, the Next-Masher;
   confirmed by the checker): double-tapping "6×4" on Megy's Step 2 card made
   a 9×9 album, and "8×6" a 6×4 one, while the toast said "Size set: 6×4".
   The card moved on, the setup page's own size grid showed under the finger
   for a moment, and the second tap picked the size there. Now the tail of a
   tap that picked a size is not a second pick, on whichever surface it lands.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/storeSettings', () => ({ loadStoreSettings: async () => {} }));
vi.mock('./albumSizeOptions', async () => {
  const { ALBUM_SIZES } = await import('./types');
  return { isSizeOfferable: () => true, offerableAlbumSizes: () => ALBUM_SIZES };
});

import BuilderSetup from './BuilderSetup';
import { noteScreenTap, SETTLE_MS } from '../../lib/settleGuard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
// Only ever forward: the guard remembers the last pick across tests, as a page does.
let now = 1_000_000;
let onSizeChange: ReturnType<typeof vi.fn>;
beforeEach(() => {
  now += 1_000_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  onSizeChange = vi.fn();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(createElement(BuilderSetup, { selectedSize: '8x8', onSizeChange, onNext: vi.fn(), albumTitle: 'Macau day', onAlbumTitleChange: vi.fn() } as never)));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const card = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!;
const tapCard = (name: string) => act(() => { card(name).click(); });

describe('the setup page\'s size grid', () => {
  it('Megy\'s card just picked a size: a tap on the grid 120 ms later is that tap\'s tail, not a pick', () => {
    now += SETTLE_MS * 2;
    noteScreenTap(); // "6×4" on Megy's card
    now += 120;
    tapCard('9×9');
    expect(onSizeChange).not.toHaveBeenCalled();
  });

  it('a tap on the grid after the pause is a real pick', () => {
    now += SETTLE_MS * 2;
    noteScreenTap();
    now += SETTLE_MS + 50;
    tapCard('9×9');
    expect(onSizeChange).toHaveBeenCalledWith('9x9');
  });

  it('a double tap on the grid itself picks the first size only', () => {
    now += SETTLE_MS * 2;
    tapCard('6×6');
    now += 90;
    tapCard('8×6');
    expect(onSizeChange.mock.calls).toEqual([['6x6']]);
  });
});

describe('Megy\'s Step 2 card (source guard)', () => {
  it('a size is picked only when no size was just picked, and the pick is marked for the other surface', () => {
    const src = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/if \(size && !tooSoonAfterScreenTap\(\)\) \{\s*noteScreenTap\(\);\s*void builder\.dispatch\(\{ type: 'change_size'/);
  });
});
