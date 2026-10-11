import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOME_FEATURES, HOW_IT_WORKS, DEMO_STEP_DETAILS, DEMO_OCCASIONS, EVENTS_CARD, ALBUMS_CARD } from './homeCopy';
import { EVENT_MIN_GUESTS } from '../lib/eventBookings';
import { MIN_ALBUM_PHOTOS } from './builder/albumMinimum';
import { FREE_QR_MEMORIES } from '../lib/pricing';
import { FONTS } from './builder/fonts';
import { COMMON_THEMES } from '../lib/albumTheme';
import { WIZARD_ORDER, type WizardStep } from '../assistant/wizard';

/* ══════════════════════════════════════════════════════════════════════════
   THE HOME PAGE SAYS ONLY WHAT'S TRUE (2026-10-09).
   It showed three made-up customer quotes with five stars ("Sarah M.",
   "Mr. Dela Cruz", "Jenny L.", added with the page templates on 2026-05-23,
   months before the first real payment), sold "6 handcrafted themes" and
   "Pick a Template" (themes are gone; step 1 is name & occasion), linked to
   the old theme browser, and said "No account required" (checkout needs a
   sign-in). These checks keep it honest.
   ══════════════════════════════════════════════════════════════════════════ */

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
/** The source with its comments taken out: what can reach the page. */
const code = (p: string) => read(p)
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const home = code('Home.tsx');
const demo = code('BuilderDemoSection.tsx');
const allCopy = [
  ...HOME_FEATURES.flatMap((f) => [f.label, f.desc]),
  ...HOW_IT_WORKS.flatMap((s) => [s.title, s.desc]),
  ...Object.values(DEMO_STEP_DETAILS).flatMap((d) => [d.title, d.desc, ...d.features]),
].join('\n');

describe('no made-up customers', () => {
  it('the testimonials section is gone: no quotes, names, star ratings or stock faces', () => {
    for (const src of [home, demo]) {
      expect(src).not.toMatch(/What Our Customers Say/i);
      expect(src).not.toMatch(/Sarah M\.|Dela Cruz|Jenny L\./);
      expect(src).not.toMatch(/testimonial/i);
      expect(src).not.toMatch(/<Star\b/);
    }
    for (const n of [1, 2, 3]) {
      expect(existsSync(resolve(__dirname, `../../public/testimonial-${n}.jpg`))).toBe(false);
    }
  });
});

describe('no themes or templates to pick', () => {
  it('the copy never offers a theme or a template', () => {
    expect(allCopy).not.toMatch(/\btheme|\btemplate/i);
  });
  it('the home page no longer has the theme grid or links to the theme browser', () => {
    expect(home).not.toMatch(/Beautiful Templates|handcrafted themes|Pick a Template/i);
    expect(home).not.toMatch(/\/templates/);
    expect(demo).not.toMatch(/\/templates|curated themes/i);
  });
  it('the demo\'s occasion chips are the real step 1 chips', () => {
    for (const o of DEMO_OCCASIONS) expect(COMMON_THEMES as readonly string[]).toContain(o);
  });
});

describe('How It Works follows the wizard', () => {
  it('is the wizard\'s path, in its order', () => {
    expect(HOW_IT_WORKS.map((s) => s.title)).toEqual(
      ['Name & occasion', 'Size', 'Cover', 'Photos', 'Review', 'Preview', 'Order'],
    );
  });

  // Where each numbered wizard step shows up on the home page. A new wizard
  // step fails here until How It Works says something about it.
  const ON_HOME: Record<Exclude<WizardStep, 'welcome'>, string> = {
    pick_theme: 'Name & occasion',
    pick_size: 'Size',
    design_cover: 'Cover',
    upload_photos: 'Photos',
    review_pages: 'Review',
    add_text: 'Review', // the optional captions step, folded into Review
    finalize: 'Preview', // "Preview & Order": Preview, then Order
  };
  it('covers every wizard step, in the same order', () => {
    const steps = WIZARD_ORDER.filter((s) => s !== 'welcome') as Exclude<WizardStep, 'welcome'>[];
    const titles = HOW_IT_WORKS.map((s) => s.title);
    const where = steps.map((s) => {
      expect(ON_HOME[s], `wizard step "${s}" is missing from How It Works`).toBeDefined();
      return titles.indexOf(ON_HOME[s]);
    });
    expect(where.every((i) => i >= 0)).toBe(true);
    expect(where).toEqual([...where].sort((a, b) => a - b));
  });

  it('step 1 is the occasion; photos say the real minimum; the last step prints and ships', () => {
    expect(HOW_IT_WORKS[0].desc).toMatch(/occasion|what it.s for/i);
    expect(HOW_IT_WORKS.find((s) => s.title === 'Photos')!.desc).toContain(`${MIN_ALBUM_PHOTOS} or more`);
    const order = HOW_IT_WORKS[HOW_IT_WORKS.length - 1].desc;
    expect(order).toMatch(/print/i);
    expect(order).toMatch(/premium paper/i);
    expect(order).toMatch(/\bship/i);
  });
});

describe('the feature strip', () => {
  const by = (k: string) => HOME_FEATURES.find((f) => f.key === k)!;
  it('says the album is printed and shipped', () => {
    expect(`${by('printed').label} ${by('printed').desc}`).toMatch(/print/i);
    expect(by('printed').desc).toMatch(/premium paper/i);
    expect(by('printed').desc).toMatch(/\bship/i);
  });
  it('video memories: on a full-page photo, the included count from pricing', () => {
    expect(by('memories').desc).toMatch(/full-page photo/i);
    expect(by('memories').desc).toContain(`${FREE_QR_MEMORIES} included`);
  });
  it('the photo minimum is the builder\'s gate', () => {
    expect(by('photos').label).toBe(`${MIN_ALBUM_PHOTOS} photos or more`);
  });
});

describe('the editor demo', () => {
  it('counts the real font list', () => {
    expect(DEMO_STEP_DETAILS.text.features.join(' ')).toContain(`${FONTS.length} fonts`);
    expect(allCopy).not.toMatch(/30\+ /);
  });
  it('promises nothing the app doesn\'t do (PNG export, picking materials)', () => {
    expect(allCopy).not.toMatch(/PNG|materials/i);
  });
});

describe('the bottom call to action', () => {
  it('doesn\'t say "No account required" (checkout asks for a sign-in)', () => {
    expect(home).not.toMatch(/No account required/i);
    expect(home).toMatch(/account when you order/i);
  });
});

describe('the two cards at the top (the owner\'s canvas board, built 2026-10-10)', () => {
  const cards = code('home/HomeCards.tsx');
  it('Home shows the Albums and Events cards, not "Hi, I\'m Megy"', () => {
    expect(home).toMatch(/<AlbumsCard\b/);
    expect(home).toMatch(/<EventsCard\b/);
    expect(home).not.toMatch(/Hi, I.m Megy/);
  });
  it('the Albums card: the real photo minimum, the gold video memory, printed and shipped', () => {
    expect(ALBUMS_CARD.hook).toContain(`Upload ${MIN_ALBUM_PHOTOS} or more`);
    expect(ALBUMS_CARD.steps[0].desc).toContain(`${MIN_ALBUM_PHOTOS} or more`);
    expect(ALBUMS_CARD.steps.map((s) => s.title)).toEqual(['You upload', 'Megy designs', 'Add a video memory', 'We print & ship']);
    expect(ALBUMS_CARD.hook).toMatch(/premium paper/);
    expect(ALBUMS_CARD.hook).toMatch(/\bship/);
    // The slide shows the builder's own gold button, the one the step names.
    expect(cards).toMatch(/memory-shine/);
  });
  it('the Events card: the owner\'s words, step 1 is booking (15+ is booked)', () => {
    for (const k of ['label', 'title', 'body', 'how', 'who', 'cta']) expect(cards).toContain(`EVENTS_CARD.${k}`);
    expect(EVENTS_CARD.title).toBe('Shared Memories, Different Perspectives');
    expect(EVENTS_CARD.steps.map((s) => s.title)).toEqual(['Book your event', 'Guests scan it', 'Everyone’s photos come to you', 'Pick the best. We print it.']);
    expect(EVENTS_CARD.cta).toBe('Book your event');
  });
  it('no "Try it now": there is no demo event (under-15 self-serve isn\'t built)', () => {
    expect(`${cards}\n${JSON.stringify(EVENTS_CARD)}`).not.toMatch(/Try it now/i);
  });
  it('says who it is for with the same number the booking form and the database use', () => {
    expect(EVENTS_CARD.who).toContain(`${EVENT_MIN_GUESTS} or more guests`);
  });
  it('the Events button goes to booking and is outlined: Start Creating stays the one filled button', () => {
    expect(cards).toMatch(/to="\/events" data-testid="home-events-book"/);
    const link = /data-testid="home-events-book"\s+className="([^"]+)"/.exec(cards)!;
    expect(link[1]).toContain('border-2 border-peach');
    expect(link[1]).not.toMatch(/\bbg-(peach|blush-pink)\b/);
    const start = /data-testid="home-start-creating"\s+className="([^"]+)"/.exec(cards)!;
    expect(start[1]).toMatch(/\bbg-peach\b/);
  });
  it('the cards\' words never offer a theme or a template', () => {
    const words = [ALBUMS_CARD.hook, ...ALBUMS_CARD.steps.flatMap((s) => [s.title, s.desc]), EVENTS_CARD.body, ...EVENTS_CARD.steps.flatMap((s) => [s.title, s.desc])].join('\n');
    expect(words).not.toMatch(/\btheme|\btemplate/i);
  });
});
