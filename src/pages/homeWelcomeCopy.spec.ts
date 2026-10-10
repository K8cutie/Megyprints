import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALBUMS_CARD } from './homeCopy';

/* ══════════════════════════════════════════════════════════════════════════
   THE FIRST CARD SAYS THE ALBUM IS PRINTED AND SHIPPED (owner, 2026-10-08).
   "Upload your photos and I'll build a beautiful, print-ready album for you"
   read as an ONLINE album to a real visitor ("WTF"). Megy Prints is a
   physical album creator: the first thing a visitor reads has to say so.
   Since 2026-10-10 that's the Megyprints Albums card (the owner's canvas
   board replaced "Hi, I'm Megy"): its headline and first slide carry it.
   ══════════════════════════════════════════════════════════════════════════ */

const home = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');
const cards = readFileSync(resolve(__dirname, 'home/HomeCards.tsx'), 'utf8');

describe('the Megyprints Albums card, first on Home', () => {
  it('comes first, before Events', () => {
    expect(home.indexOf('<AlbumsCard')).toBeGreaterThan(-1);
    expect(home.indexOf('<AlbumsCard')).toBeLessThan(home.indexOf('<EventsCard'));
  });
  it('its headline says it is a printed album', () => {
    expect(ALBUMS_CARD.title).toMatch(/printed album/i);
    expect(cards).toMatch(/<h1[^>]*>\{ALBUMS_CARD\.title\}<\/h1>/);
  });
  it('its first slide says premium paper and shipped to the door', () => {
    expect(ALBUMS_CARD.hook).toMatch(/premium paper/i);
    expect(ALBUMS_CARD.hook).toMatch(/\bship\b.*door/i);
  });
  it('never says only "print-ready" (a file, not a book)', () => {
    expect(JSON.stringify(ALBUMS_CARD)).not.toMatch(/print-ready/i);
  });
});
