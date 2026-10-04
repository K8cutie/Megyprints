// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import VideoMemoryButton from './VideoMemoryButton';

/* ══════════════════════════════════════════════════════════════════════════
   THE VIDEO MEMORY SHINES (owner, 2026-10-04: "Add a memory is a creme dela
   creme feature of this app can you make it more noticeable like a shiny
   glowing feature a different color which catches attention"). It was a
   terracotta button like Next page, and only pulsed until the first tap. Now
   it is gold, glows and has a light sweeping across it, on the phone and the
   desktop editor alike, every time. With reduced motion it stays gold and
   holds still.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

function render(variant: 'phone' | 'desktop') {
  const onClick = vi.fn();
  act(() => root.render(createElement(VideoMemoryButton, { variant, onClick })));
  const button = host.querySelector('button')!;
  return { onClick, button, words: button.textContent!.replace(/\s+/g, ' ').trim() };
}

describe('VideoMemoryButton', () => {
  for (const variant of ['phone', 'desktop'] as const) {
    it(`${variant}: says "Add a video memory" with the video icon, opens the memory`, () => {
      const { button, words, onClick } = render(variant);
      expect(words).toBe('Add a video memory');
      expect(button.querySelector('svg')).not.toBeNull();
      act(() => button.click());
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it(`${variant}: wears the gold shine, not the terracotta of Next page`, () => {
      const { button } = render(variant);
      expect(button.classList.contains('memory-shine')).toBe(true);
      expect(button.className).not.toMatch(/\bbg-(blush-pink|peach)\b|\btext-white\b/);
    });
  }

  it('the shine is gold, glows, sweeps, and every time (no until-first-tap flag)', () => {
    const rule = css.match(/\.memory-shine\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/linear-gradient\([^)]*#E9C46F/);
    expect(rule).toMatch(/animation:\s*megyMemoryGlow/);
    expect(css).toMatch(/\.memory-shine::after\s*\{[^}]*animation:\s*megyMemorySweep/);
    for (const f of ['MobileReview.tsx', 'BuilderEdit.tsx']) {
      expect(src(f)).not.toMatch(/memoryDiscovered|memory-pulse/);
    }
  });

  it('reduced motion: nothing moves, the gold stays', () => {
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\.memory-shine[\s\S]*?\n\}/)![0];
    expect(reduced).toMatch(/\.memory-shine, \.memory-shine::after \{ animation: none; \}/);
    expect(reduced).not.toMatch(/background/);
  });

  it('the phone and desktop editors both use it (one button, one look)', () => {
    expect(src('MobileReview.tsx')).toMatch(/<VideoMemoryButton variant="phone" onClick=\{openMemory\} \/>/);
    expect(src('BuilderEdit.tsx')).toMatch(/<VideoMemoryButton variant="desktop" onClick=\{\(\) => setMemoryOpen\(true\)\} \/>/);
    for (const f of ['MobileReview.tsx', 'BuilderEdit.tsx']) expect(src(f)).not.toMatch(/> Add a video memory/);
  });
});
