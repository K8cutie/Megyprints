// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   NO BLANK COVER BY SURPRISE (1-star testers round 2, NEW-1 / COM2-N2): the
   cover step is optional; skip it and the album went to print with a plain
   white cover — the name typed in Step 1 never reached the cover (or the
   spine that follows its title), and nothing warned before paying.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../lib/useIndexedDBPhotos', () => {
  const idb = {
    store: async () => null, get: async () => null, getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, withNameTitle, type BuilderActions } from './useBuilderState';
import { coverIsBlank, BLANK_COVER_MESSAGE } from './orderReadiness';
import { deriveSpine } from './coverLayout';
import { coverWrapGeometry } from './coverGeometry';
import type { AlbumPage } from './types';

let builder!: BuilderActions;
function Probe() {
  const b = useBuilderState();
  useEffect(() => { builder = b; });
  return null;
}
let root: Root | null = null;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });
const title = () => builder.coverFront.textElements?.find((t) => t.boxIndex === 0);

describe('the album\'s name is the cover title until the customer writes their own', () => {
  it('a new album starts with a blank cover; naming it puts the name on the cover — and on the spine', async () => {
    expect(coverIsBlank(builder.coverFront)).toBe(true);
    await act(async () => { builder.setAlbumTitle('HK trip'); });
    expect(title()?.text).toBe('HK trip');
    expect(coverIsBlank(builder.coverFront)).toBe(false);
    const spine = deriveSpine(builder.coverFront, coverWrapGeometry('8x8', 40, 'hardboundLinen'));
    expect(spine.text.text).toBe('HK trip');
  });
  it('renaming follows — while the title is still Megy\'s', async () => {
    await act(async () => { builder.setAlbumTitle('HK trip'); });
    await act(async () => { builder.setAlbumTitle('HK trip 2026'); });
    expect(title()?.text).toBe('HK trip 2026');
    expect(builder.coverFront.textElements?.filter((t) => t.boxIndex === 0)).toHaveLength(1);
  });
  it('a title the customer types is theirs: a rename never touches it', async () => {
    await act(async () => { builder.setAlbumTitle('HK trip'); });
    await act(async () => { builder.setEditScope('coverFront'); });
    await act(async () => { builder.setBoxText(0, { text: 'Our Hong Kong' }); });
    await act(async () => { builder.setEditScope('interior'); });
    expect(title()?.text).toBe('Our Hong Kong');
    expect(title()?.fromAlbumName).toBeFalsy();
    await act(async () => { builder.setAlbumTitle('HK trip renamed'); });
    expect(title()?.text).toBe('Our Hong Kong');
  });
  it('restyling Megy\'s title (font, colour) keeps it following the name', async () => {
    await act(async () => { builder.setAlbumTitle('HK trip'); });
    await act(async () => { builder.setEditScope('coverFront'); });
    await act(async () => { builder.setBoxText(0, { text: 'HK trip', color: '#FFFFFF' }); });
    await act(async () => { builder.setEditScope('interior'); });
    await act(async () => { builder.setAlbumTitle('HK trip 2'); });
    expect(title()).toMatchObject({ text: 'HK trip 2', color: '#FFFFFF' });
  });
});

describe('withNameTitle', () => {
  const cover = (over: Partial<AlbumPage> = {}): AlbumPage => ({
    id: 'c', layout: 'freeform', size: '8x8', templateId: 'cover-hero', background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [], slotFills: [], ...over,
  } as AlbumPage);
  it('an empty name takes Megy\'s title away again; never the customer\'s', () => {
    const named = withNameTitle(cover(), 'HK');
    expect(withNameTitle(named, '').textElements).toHaveLength(0);
    const mine = cover({ textElements: [{ id: 't', text: 'Mine', boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1 } as AlbumPage['textElements'][number]] });
    expect(withNameTitle(mine, '').textElements[0].text).toBe('Mine');
    expect(withNameTitle(mine, 'HK').textElements[0].text).toBe('Mine');
  });
  it('a cover template with no title box is left as it is', () => {
    const c = cover({ templateId: 'no-such-template' });
    expect(withNameTitle(c, 'HK')).toBe(c);
  });
});

describe('Before you order: a blank front cover is said', () => {
  const blank = (over: Partial<AlbumPage> = {}): AlbumPage => ({
    id: 'c', layout: 'freeform', size: '8x8', templateId: 'cover-hero', background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [], slotFills: [null], ...over,
  } as AlbumPage);
  it('nothing on it → blank; a title, a photo, a background photo or a graphic → not blank', () => {
    expect(coverIsBlank(blank())).toBe(true);
    expect(coverIsBlank(blank({ textElements: [{ id: 't', text: '  ', boxIndex: 0 } as AlbumPage['textElements'][number]] }))).toBe(true);
    expect(coverIsBlank(blank({ textElements: [{ id: 't', text: 'Kaye', boxIndex: 0 } as AlbumPage['textElements'][number]] }))).toBe(false);
    expect(coverIsBlank(blank({ slotFills: [3] }))).toBe(false);
    expect(coverIsBlank(blank({ background: { type: 'image', image: 'blob:x' } as AlbumPage['background'] }))).toBe(false);
    expect(coverIsBlank(blank({ stickers: [{}] as AlbumPage['stickers'] }))).toBe(false);
  });
  it('the preview\'s Order says it first, and "Show me" opens the cover (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
    expect(src).toMatch(/\[coverIsBlank\(coverFront\) \? BLANK_COVER_MESSAGE : '', titleCut \? COVER_TITLE_TOO_LONG_MESSAGE : '', readinessMessage\(readiness\)/);
    expect(src).toMatch(/if \(coverIsBlank\(coverFront\) \|\| coverTitleFit\(coverFront, albumSize\)\?\.fits === false\) \{ setCoverOpen\(true\); return; \}/);
    expect(BLANK_COVER_MESSAGE).toBe('Your front cover is blank: no title or photo on it.');
  });
});
