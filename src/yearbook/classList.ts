/* ── Class list paste → names ────────────────────────────────────────────────
   Advisers paste from Excel, Google Sheets, a DepEd SF1, or a typed list. We
   accept all of them: "DELA CRUZ, Juan Miguel P.", "Juan P. Dela Cruz",
   numbered lines, tab-separated columns with a header row, and an optional
   "Adviser: Ms. Ana Reyes" line. Names stay in the class-list order
   (rosterOrder); sorting for the page is done by sortForPage(). */

export interface ParsedName {
  last: string;
  first: string;
  middle?: string;
  suffix?: string;
  rosterOrder: number;
}

export interface ParsedClassList {
  students: ParsedName[];
  adviser?: { title?: string; name: ParsedName };
  warnings: string[];
}

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
const PARTICLES = new Set(['de', 'del', 'dela', 'delos', 'delas', 'la', 'las', 'los', 'san', 'sta', 'sta.', 'santa', 'sto', 'sto.', 'santo', 'van', 'von', 'di', 'da', 'du', 'le', 'mac', 'y']);
const HONORIFICS = /^(mr|mrs|ms|miss|mx|dr|sir|ma'?am|sr|bro|fr|engr|atty|prof)\.?$/i;
const ADVISER_LINE = /^\s*(class\s+)?adviser\s*[:\-–]\s*(.+)$/i;
const HEADER_WORDS = /\b(name|names|last|first|middle|surname|given|apelyido|pangalan|lrn|sex|gender|no\.?)\b/i;

const isAllCaps = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();
const ROMAN = /^(ii|iii|iv|v)[.,]?$/i;

/** Title-case each ALL-CAPS word ("DELA CRUZ" → "Dela Cruz", "JR." → "Jr.");
 *  words typed in mixed case stay exactly as typed ("McArthur", "de los"). */
export function tidyCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => {
      if (ROMAN.test(w)) return w.toUpperCase();
      if (!isAllCaps(w) || w.replace(/[^A-Za-zÑñ]/g, '').length < 2) return w;
      return w.toLowerCase().split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
    })
    .join(' ');
}

function stripNumbering(line: string): string {
  return line.replace(/^\s*(\d{1,3}[.)]?|[-•*])\s+/, '').trim();
}

function splitGiven(given: string): { first: string; middle?: string; suffix?: string } {
  const toks = given.split(' ').filter(Boolean);
  let suffix: string | undefined;
  const rest: string[] = [];
  for (const t of toks) {
    if (SUFFIXES.has(t.toLowerCase().replace(/,$/, ''))) suffix = t.replace(/,$/, '');
    else rest.push(t);
  }
  // A trailing initial ("P." or "P") is the middle initial; a full middle
  // name can't be told apart from a second given name, so it stays in first.
  let middle: string | undefined;
  if (rest.length >= 2 && /^[A-Za-zÑñ]\.?$/.test(rest[rest.length - 1])) {
    middle = rest.pop()!.replace(/\.?$/, '.');
  }
  return { first: rest.join(' '), middle, suffix };
}

/** Parse one person's name written in a single cell. */
export function parseName(cell: string, rosterOrder: number): ParsedName | null {
  let s = tidyCase(stripNumbering(cell)).replace(/\s+,/g, ',');
  if (!s) return null;
  // Drop a leading honorific ("Ms. Ana Reyes") — kept separately for advisers.
  const firstTok = s.split(' ')[0];
  if (HONORIFICS.test(firstTok) && s.split(' ').length > 1) s = s.slice(firstTok.length).trim();

  if (s.includes(',')) {
    const [lastPart, ...givenParts] = s.split(',');
    const given = givenParts.join(' ').trim();
    const g = splitGiven(given);
    const last = lastPart.trim();
    if (!last) return null;
    return { last, first: g.first || '', ...(g.middle ? { middle: g.middle } : {}), ...(g.suffix ? { suffix: g.suffix } : {}), rosterOrder };
  }

  const toks = s.split(' ').filter(Boolean);
  let suffix: string | undefined;
  if (toks.length > 1 && SUFFIXES.has(toks[toks.length - 1].toLowerCase())) suffix = toks.pop();
  if (toks.length === 1) return { last: toks[0], first: '', ...(suffix ? { suffix } : {}), rosterOrder };
  // Surname = last token plus any particles right before it ("Dela Cruz", "De los Santos").
  let i = toks.length - 1;
  while (i - 1 >= 1 && PARTICLES.has(toks[i - 1].toLowerCase())) i--;
  const last = toks.slice(i).join(' ');
  const g = splitGiven(toks.slice(0, i).join(' '));
  return { last, first: g.first, ...(g.middle ? { middle: g.middle } : {}), ...(suffix || g.suffix ? { suffix: suffix || g.suffix } : {}), rosterOrder };
}

type Col = 'last' | 'first' | 'middle' | 'suffix' | 'full' | 'skip';

function headerColumns(cells: string[]): Col[] | null {
  if (!cells.some((c) => HEADER_WORDS.test(c))) return null;
  return cells.map((c) => {
    const t = c.toLowerCase();
    if (/(last|surname|apelyido|family)/.test(t)) return 'last';
    if (/(first|given)/.test(t)) return 'first';
    if (/middle/.test(t)) return 'middle';
    if (/(suffix|ext)/.test(t)) return 'suffix';
    if (/(name|pangalan)/.test(t)) return 'full';
    return 'skip';
  });
}

/** Guess columns without a header: skip numbers, LRNs and sex columns; the
 *  remaining text columns are full name (1), last+first (2), last+first+middle (3). */
function guessColumns(rows: string[][]): Col[] {
  const width = Math.max(...rows.map((r) => r.length));
  const kinds: Col[] = [];
  const textCols: number[] = [];
  for (let c = 0; c < width; c++) {
    const vals = rows.map((r) => (r[c] ?? '').trim()).filter(Boolean);
    const numeric = vals.length > 0 && vals.every((v) => /^[\d.)\s-]+$/.test(v));
    const sex = vals.length > 0 && vals.every((v) => /^(m|f|male|female|lalaki|babae)$/i.test(v));
    kinds.push(numeric || sex || vals.length === 0 ? 'skip' : 'full');
    if (kinds[c] === 'full') textCols.push(c);
  }
  if (textCols.length >= 2) {
    kinds[textCols[0]] = 'last';
    kinds[textCols[1]] = 'first';
    if (textCols[2] !== undefined) kinds[textCols[2]] = 'middle';
    for (const c of textCols.slice(3)) kinds[c] = 'skip';
  }
  return kinds;
}

export function parseClassList(text: string): ParsedClassList {
  const warnings: string[] = [];
  let adviser: ParsedClassList['adviser'];
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/ /g, ' ')).filter((l) => l.trim());

  const body: string[] = [];
  for (const l of lines) {
    const m = l.match(ADVISER_LINE);
    if (m) {
      const raw = m[2].trim();
      const tok = raw.split(/\s+/)[0];
      const title = HONORIFICS.test(tok) ? tok.replace(/\.?$/, '.').replace(/^./, (c) => c.toUpperCase()) : undefined;
      const name = parseName(raw, -1);
      if (name) adviser = { ...(title ? { title } : {}), name };
    } else body.push(l);
  }

  const tabbed = body.some((l) => l.includes('\t'));
  let rows: string[][] = body.map((l) => (tabbed ? l.split('\t') : [l]));
  let cols: Col[] = ['full'];
  if (tabbed) {
    const header = headerColumns(rows[0] ?? []);
    if (header) { cols = header; rows = rows.slice(1); } else cols = guessColumns(rows);
  } else if (rows.length && HEADER_WORDS.test(rows[0][0]) && !/,/.test(rows[0][0]) && rows[0][0].split(/\s+/).length <= 3) {
    rows = rows.slice(1); // a lone "Name" / "Names of learners" header line
  }

  const students: ParsedName[] = [];
  rows.forEach((cells) => {
    const order = students.length;
    let p: ParsedName | null = null;
    const get = (k: Col) => {
      const i = cols.indexOf(k);
      return i >= 0 ? tidyCase(cells[i] ?? '') : '';
    };
    if (cols.includes('last') && cols.includes('first')) {
      const last = get('last');
      const g = splitGiven(get('first'));
      const middle = get('middle');
      const suffix = get('suffix') || g.suffix;
      if (last || g.first) p = { last, first: g.first, ...(middle ? { middle: /^[A-Za-zÑñ]\.?$/.test(middle) ? middle.replace(/\.?$/, '.') : middle } : g.middle ? { middle: g.middle } : {}), ...(suffix ? { suffix } : {}), rosterOrder: order };
    } else {
      const i = cols.indexOf('full');
      p = parseName(cells[i >= 0 ? i : 0] ?? '', order);
    }
    if (p && (p.last || p.first)) students.push(p);
    else if (cells.join('').trim()) warnings.push(`Couldn't read a name from: "${cells.join(' ').trim()}"`);
  });

  const seen = new Map<string, number>();
  for (const s of students) {
    const k = `${s.last}|${s.first}`.toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1) warnings.push(`"${k.replace('|', ', ')}" appears ${n} times`);
  return { students, ...(adviser ? { adviser } : {}), warnings };
}

/** Surname order for the page ("Dela Cruz" files under D), then given name. */
export function sortForPage<T extends { last: string; first: string }>(people: T[]): T[] {
  const coll = new Intl.Collator('en', { sensitivity: 'base' });
  return [...people].sort((a, b) => coll.compare(a.last, b.last) || coll.compare(a.first, b.first));
}

/** How a name prints under a portrait: "Juan Miguel P. Dela Cruz Jr." */
export function displayName(p: { last: string; first: string; middle?: string; suffix?: string }): string {
  return [p.first, p.middle, p.last, p.suffix].filter(Boolean).join(' ');
}
