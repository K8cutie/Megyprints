import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   NO THEME BROWSER (2026-10-19). Themes are gone (owner, 2026-07-04: "we no
   longer need the themes thing"); step 1 of the builder is name & occasion.
   The menu and the footer still sent people to /templates, "Choose Your
   Style" with 11 themes, and "Use Template" opened /builder?template=<id>.
   The builder never reads ?template=, so the pick was dropped: the customer
   got the same welcome screen as Start Creating. The page, its menu and
   footer links are gone; an old /#/templates link lands on Home.
   ══════════════════════════════════════════════════════════════════════════ */

const SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SRC, p), 'utf8');
/** The source with its comments taken out: what can reach the page. */
const code = (src: string) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function appFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return appFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.spec\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('the theme browser is gone', () => {
  const app = code(read('App.tsx'));

  it('has no page and no route', () => {
    expect(existsSync(resolve(SRC, 'pages/Templates.tsx'))).toBe(false);
    expect(app).not.toMatch(/pages\/Templates['"]/);
    expect(app).not.toMatch(/path="\/templates"/);
  });

  it('an old /#/templates link lands on Home', () => {
    expect(app).toMatch(/<Route path="\*" element=\{<Navigate to="\/" replace \/>\} \/>/);
  });

  it('the menu and the footer do not offer templates', () => {
    for (const f of ['components/Navbar.tsx', 'components/Footer.tsx']) {
      const src = code(read(f));
      expect(src, f).not.toMatch(/\/templates/);
      expect(src, f).not.toMatch(/'Templates'|>\s*Templates\s*</);
    }
  });

  it('nothing in the app links to /templates or sends ?template=', () => {
    const offenders = appFiles(SRC).filter((p) => {
      const src = code(readFileSync(p, 'utf8'));
      return /['"`]\/templates\b|\?template=/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
