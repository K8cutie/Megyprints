// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BackgroundDesigner from './BackgroundDesigner';
import type { UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE COVER'S "Background" BUTTON OPENS THE PHOTO BROWSER (owner, 2026-10-04:
   "remove that [Upload Custom Image box] and make it that if they press
   Background it opens a browser"). The dashed box under the tabs is gone;
   tapping Background opens the phone's / computer's file picker. The album's
   own photos still show under it when there are some (the cover opened again
   from the preview).
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const photo = (id: string) => ({ id, name: `${id}.jpg`, previewUrl: `https://x/${id}.jpg` } as unknown as UploadedPhoto);
const render = (photos: UploadedPhoto[], hideUpload: boolean) =>
  act(() => root.render(createElement(BackgroundDesigner, {
    background: { type: 'solid', solid: '#FFFBF7' }, onChange: () => {}, photos,
    hidePreview: true, compact: true, imageOnly: true, hideOpacity: true, hideUpload,
  } as never)));

describe('BackgroundDesigner on the cover (imageOnly + hideUpload)', () => {
  it('no "Upload Custom Image" box', () => {
    render([], true);
    expect(host.textContent).not.toMatch(/Upload Custom Image/);
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('the album photos still show to pick from when there are some', () => {
    render([photo('a'), photo('b')], true);
    expect(host.querySelectorAll('img')).toHaveLength(2);
    expect(host.textContent).not.toMatch(/Upload Custom Image/);
  });

  it('without hideUpload it is unchanged (the box is still there)', () => {
    render([], false);
    expect(host.textContent).toMatch(/Upload Custom Image/);
  });
});

describe('CoverEditor: tapping Background opens the file browser', () => {
  const src = readFileSync(resolve(__dirname, 'CoverEditor.tsx'), 'utf8');
  it('hides the designer\'s upload box', () => {
    expect(src).toMatch(/<BackgroundDesigner[^>]*\bhideUpload\b/);
  });
  it('owns a hidden image file input', () => {
    expect(src).toMatch(/type="file"[^>]*accept="image\/\*"|accept="image\/\*"[^>]*type="file"/);
  });
  it('the Background tab opens it', () => {
    expect(src).toMatch(/t\.key === 'background'[\s\S]{0,120}bgFileRef\.current\?\.click\(\)/);
  });
});
