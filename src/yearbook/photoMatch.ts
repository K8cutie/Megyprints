/* ── Photographer's folder → the right name ──────────────────────────────────
   Two ways, picked automatically:
   • NAMES — the file names carry the students' names ("DELACRUZ_Juan.jpg",
     "dela-cruz-juan-toga.jpg"). Each photo is scored against every name and
     the best one-to-one pairing is found (Hungarian assignment), so two
     "Santos" kids can't both grab the same file.
   • ORDER — the files are numbered (IMG_0412.jpg). They're paired with the
     class list in shooting order, and the adviser checks each pair.
   With three looks per graduate, up to three photos go to each person, sorted
   toga → formal → creative when the file names say which is which. */

export interface MatchPerson { id: string; last: string; first: string; middle?: string; rosterOrder: number }
export interface MatchPhoto { id: string; fileName: string; order: number }

export interface MatchResult {
  method: 'names' | 'order';
  assignments: Record<string, string[]>;
  /** 0–1: how well the file name matched (names) or 0.5 (order — please check). */
  confidence: Record<string, number>;
  /** People whose file could also belong to someone with a similar name. */
  similar: Record<string, string>;
  unmatchedPhotos: string[];
  warnings: string[];
}

const STOP = new Set(['img', 'dsc', 'dscn', 'dscf', 'pic', 'photo', 'photos', 'jpg', 'jpeg', 'png', 'final', 'edit', 'edited', 'copy', 'portrait', 'grad', 'graduation', 'look', 'pose', 'retouched', 'hi', 'res', 'hd', 'sr', 'grade', 'section', 'toga', 'gown', 'formal', 'filipiniana', 'barong', 'corporate', 'creative', 'casual', 'fun']);
const LOOK_TAGS: [RegExp, number][] = [[/\b(toga|gown)\b/, 0], [/\b(formal|filipiniana|barong|corporate)\b/, 1], [/\b(creative|casual|fun)\b/, 2]];

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Words in a file name, minus extension, numbers and camera/look words. */
export function fileTokens(fileName: string): string[] {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '');
  const spaced = base.replace(/([a-z])([A-Z])/g, '$1 $2');
  return fold(spaced).split(/[^a-z]+/).filter((t) => t.length >= 2 && !STOP.has(t));
}

export function lookOf(fileName: string): number | null {
  const f = fold(fileName).replace(/[^a-z]+/g, ' ');
  for (const [re, i] of LOOK_TAGS) if (re.test(f)) return i;
  return null;
}

function nameTokens(p: MatchPerson): { last: string[]; first: string[] } {
  const words = (s: string) => fold(s).split(/[^a-z]+/).filter((t) => t.length >= 2);
  return { last: words(p.last), first: words(p.first).filter((t) => t !== 'ma') };
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 1 for the same word, partial credit for typos and run-together names. */
function tokenSim(t: string, toks: string[], joined: string): number {
  let best = 0;
  for (const u of toks) {
    if (u === t) return 1;
    const r = 1 - lev(t, u) / Math.max(t.length, u.length);
    if (r > best) best = r;
  }
  // "DELACRUZ" or "delacruzjuan" — the name hidden inside a longer token.
  if (t.length >= 3 && joined.includes(t)) best = Math.max(best, 0.95);
  return best >= 0.75 ? best : 0;
}

/** How well a photo's file name matches a person, 0–1. Needs the surname. */
export function scoreName(p: MatchPerson, fileName: string): number {
  const toks = fileTokens(fileName);
  if (!toks.length) return 0;
  const joined = toks.join('');
  const n = nameTokens(p);
  const lastJoined = n.last.join('');
  const lastScore = lastJoined.length >= 3 && joined.includes(lastJoined)
    ? 1
    : n.last.length ? n.last.reduce((s, t) => s + tokenSim(t, toks, joined), 0) / n.last.length : 0;
  if (lastScore < 0.75) return 0;
  const firstScore = n.first.length ? n.first.reduce((s, t) => s + tokenSim(t, toks, joined), 0) / n.first.length : 0;
  // Surname counts double; a file with only the surname scores 2/3.
  return (2 * lastScore + firstScore) / 3;
}

/** Minimum-cost assignment (Hungarian, rows ≤ cols after padding). Returns col per row. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const m = Math.max(n, ...cost.map((r) => r.length));
  const a = cost.map((r) => [...r, ...Array(m - r.length).fill(1)]);
  while (a.length < m) a.push(Array(m).fill(1));
  const u = Array(m + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] && p[j] <= n && j <= (cost[p[j] - 1]?.length ?? 0)) ans[p[j] - 1] = j - 1;
  return ans;
}

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function matchPhotos(people: MatchPerson[], photos: MatchPhoto[], perPerson = 1): MatchResult {
  const warnings: string[] = [];
  const assignments: Record<string, string[]> = {};
  const confidence: Record<string, number> = {};
  const similar: Record<string, string> = {};
  if (!people.length || !photos.length) {
    return { method: 'names', assignments, confidence, similar, unmatchedPhotos: photos.map((p) => p.id), warnings };
  }

  const scores = people.map((p) => photos.map((ph) => scoreName(p, ph.fileName)));
  const photosWithAName = photos.filter((_, j) => people.some((_, i) => scores[i][j] >= 0.6)).length;
  const useNames = photosWithAName >= Math.max(1, Math.ceil(photos.length * 0.5));

  if (!useNames) {
    const sortedPeople = [...people].sort((a, b) => a.rosterOrder - b.rosterOrder);
    const sortedPhotos = [...photos].sort((a, b) => a.order - b.order || natural.compare(a.fileName, b.fileName));
    sortedPeople.forEach((p, i) => {
      const mine = sortedPhotos.slice(i * perPerson, i * perPerson + perPerson).map((ph) => ph.id);
      if (mine.length) { assignments[p.id] = mine; confidence[p.id] = 0.5; }
    });
    const need = people.length * perPerson;
    if (photos.length !== need) warnings.push(`${photos.length} photos for ${people.length} people${perPerson > 1 ? ` × ${perPerson} looks` : ''} (expected ${need}). Check the order carefully.`);
    const used = new Set(Object.values(assignments).flat());
    return { method: 'order', assignments, confidence, similar, unmatchedPhotos: photos.filter((p) => !used.has(p.id)).map((p) => p.id), warnings };
  }

  if (perPerson === 1) {
    const col = hungarian(scores.map((r) => r.map((s) => 1 - s)));
    people.forEach((p, i) => {
      const j = col[i];
      if (j >= 0 && j < photos.length && scores[i][j] >= 0.6) {
        assignments[p.id] = [photos[j].id];
        confidence[p.id] = Math.round(scores[i][j] * 100) / 100;
        const rival = people.findIndex((_q, k) => k !== i && scores[k][j] >= 0.85);
        if (rival >= 0) similar[p.id] = people[rival].id;
      }
    });
  } else {
    // Each photo to its best-scoring person; then keep up to perPerson, by look.
    photos.forEach((ph, j) => {
      let bi = -1, bs = 0;
      people.forEach((_, i) => { if (scores[i][j] > bs) { bs = scores[i][j]; bi = i; } });
      if (bi >= 0 && bs >= 0.6) {
        const pid = people[bi].id;
        (assignments[pid] ||= []).push(ph.id);
        confidence[pid] = Math.min(confidence[pid] ?? 1, Math.round(bs * 100) / 100);
      }
    });
    const byId = new Map(photos.map((p) => [p.id, p]));
    for (const pid of Object.keys(assignments)) {
      const list = assignments[pid].map((id) => byId.get(id)!).sort((a, b) => (lookOf(a.fileName) ?? 9) - (lookOf(b.fileName) ?? 9) || a.order - b.order);
      if (list.length > perPerson) warnings.push(`${list.length} photos look like ${people.find((p) => p.id === pid)!.first} ${people.find((p) => p.id === pid)!.last}; using ${perPerson}.`);
      assignments[pid] = list.slice(0, perPerson).map((p) => p.id);
    }
  }
  const used = new Set(Object.values(assignments).flat());
  const unmatchedPhotos = photos.filter((p) => !used.has(p.id)).map((p) => p.id);
  const missing = people.filter((p) => !assignments[p.id]).length;
  if (missing) warnings.push(`${missing} ${missing === 1 ? 'person has' : 'people have'} no photo yet.`);
  return { method: 'names', assignments, confidence, similar, unmatchedPhotos, warnings };
}
