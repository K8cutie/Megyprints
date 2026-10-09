import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE WELCOME CARD SAYS THE ALBUM IS PRINTED AND SHIPPED (owner, 2026-10-08).
   "Upload your photos and I'll build a beautiful, print-ready album for you"
   read as an ONLINE album to a real visitor ("WTF"). Megy Prints is a
   physical album creator — digital printing on premium paper: the first
   thing a visitor reads has to say so.
   ══════════════════════════════════════════════════════════════════════════ */

const home = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
// The paragraph under "Hi, I'm Megy" in the hero welcome card.
const start = home.indexOf('Hi, I&apos;m Megy');
const card = home.slice(start, home.indexOf('Start Creating', start));
const line = card
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments
  .replace(/<[^>]+>/g, ' ')
  .replace(/&apos;/g, "'")
  .replace(/\s+/g, ' ');

describe('the welcome card under "Hi, I\'m Megy"', () => {
  it('is found', () => expect(line).toMatch(/album designer/));
  it('says what it is: a physical album, digital printing on premium paper, shipped', () => {
    expect(line).toMatch(/physical album/i);
    expect(line).toMatch(/digital printing/i);
    expect(line).toMatch(/premium paper/i);
    expect(line).toMatch(/\bship/i);
  });
  it('no longer says only "print-ready" (a file, not a book)', () => {
    expect(line).not.toMatch(/print-ready/i);
  });
});
