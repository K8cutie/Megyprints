/** ══════════════════════════════════════════════════════════════════════════
    THEME DETECTOR — Suggest a theme from photo CONTENT (on-device)

    Runs a MobileNet image classifier (TensorFlow.js) entirely in the browser —
    photos never leave the device, consistent with the local-first design.
    Each sampled photo yields ImageNet scene/object labels; those labels are
    mapped to occasion themes and scored. Returns the best-fit suggestion.

    tfjs + the model are loaded LAZILY (dynamic import) so they stay out of the
    main bundle and only download when the user asks for a suggestion. The model
    weights download once from the Google CDN on first use.

    NOTE: content classification reliably maps OCCASION/SCENE themes (travel,
    graduation, baptism, birthday, wedding, baby). Stylistic themes (family,
    classic, vintage, minimalist) are aesthetic choices not visible in a photo,
    so they are intentionally not inferred here.
    ══════════════════════════════════════════════════════════════════════════ */

import type { UploadedPhoto, TemplateType } from './types';

export interface ThemeSuggestion {
  theme: TemplateType;
  /** 0–1 relative dominance of the winning theme across the analyzed photos. */
  confidence: number;
  /** Human-readable labels that drove the decision (for Megy to explain). */
  evidence: string[];
  /** How many photos were actually classified. */
  analyzed: number;
}

/** ImageNet label keywords → theme. Matched as case-insensitive substrings
 *  against MobileNet's className (which is a comma-separated synonym list). */
const THEME_KEYWORDS: { theme: TemplateType; words: string[] }[] = [
  { theme: 'travel', words: ['seashore', 'coast', 'lakeside', 'lakeshore', 'sandbar', 'cliff', 'promontory', 'valley', 'alp', 'mountain', 'volcano', 'geyser', 'castle', 'palace', 'monument', 'obelisk', 'fountain', 'triumphal arch', 'suspension bridge', 'steel arch bridge', 'viaduct', 'pier', 'dock', 'breakwater', 'boathouse', 'lighthouse', 'beacon', 'gondola', 'canoe', 'catamaran', 'yawl', 'schooner', 'liner', 'speedboat', 'fireboat', 'airliner', 'airplane', 'wing', 'warplane', 'parachute', 'ski', 'mountain tent', 'planetarium', 'cinema', 'flagpole', 'maze'] },
  { theme: 'graduation', words: ['mortarboard', 'academic gown', 'academic robe'] },
  { theme: 'baptism', words: ['church', 'altar', 'vestment', 'monastery', 'bell cote', 'stupa', 'candle', 'taper', 'wax light', 'prayer rug'] },
  { theme: 'wedding', words: ['gown', 'hoopskirt', 'sarong', 'velvet', 'bridegroom'] },
  { theme: 'birthday', words: ['balloon', 'trifle', 'confectionery', 'ice cream', 'ice lolly', 'chocolate sauce'] },
  { theme: 'baby', words: ['cradle', 'crib', 'bassinet', 'bassinette', 'diaper', 'nappy', 'bib', 'bottle', 'nipple', 'teddy', 'rocking chair'] },
  { theme: 'kids', words: ['teddy', 'tricycle', 'swing', 'playground', 'toyshop', 'plaything'] },
];

type Classifier = { classify: (img: HTMLImageElement, topk?: number) => Promise<{ className: string; probability: number }[]> };
let modelPromise: Promise<Classifier> | null = null;

/** Load (and cache) the MobileNet model + a tfjs backend. Lazy + dynamic. */
async function getModel(): Promise<Classifier> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      // Prefer the fast WebGL backend; fall back to CPU when WebGL is
      // unavailable (some browsers / headless), so analysis still runs.
      let ready = false;
      for (const backend of ['webgl', 'cpu']) {
        try {
          if (await tf.setBackend(backend)) { await tf.ready(); ready = true; break; }
        } catch { /* try next backend */ }
      }
      if (!ready) throw new Error('no tfjs backend available');
      const mobilenet = await import('@tensorflow-models/mobilenet');
      return (await mobilenet.load({ version: 2, alpha: 1.0 })) as Classifier;
    })().catch((err) => {
      modelPromise = null; // allow a later retry instead of caching the failure
      throw err;
    });
  }
  return modelPromise;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

/** Pick up to `max` photos spread evenly across the set (cheaper than all). */
function sample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]);
}

/**
 * Analyze photo content and suggest the closest occasion theme.
 * Returns null when nothing classifies confidently (e.g. a stylistic shoot)
 * or the model/backend is unavailable.
 */
export async function suggestThemeFromPhotos(
  photos: UploadedPhoto[],
  opts: { maxPhotos?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<ThemeSuggestion | null> {
  if (!photos.length) return null;
  const maxPhotos = opts.maxPhotos ?? 8;
  const picked = sample(photos, maxPhotos);

  let model: Classifier;
  try {
    model = await getModel();
  } catch {
    return null; // no backend / model failed to load
  }

  const scores: Partial<Record<TemplateType, number>> = {};
  const evidence: Partial<Record<TemplateType, Record<string, number>>> = {};
  let analyzed = 0;

  for (let i = 0; i < picked.length; i++) {
    let preds: { className: string; probability: number }[];
    try {
      const img = await loadImage(picked[i].previewUrl);
      preds = await model.classify(img, 5);
    } catch {
      continue;
    }
    analyzed++;
    for (const p of preds) {
      const name = p.className.toLowerCase();
      for (const { theme, words } of THEME_KEYWORDS) {
        const hit = words.find((w) => name.includes(w));
        if (hit) {
          scores[theme] = (scores[theme] ?? 0) + p.probability;
          (evidence[theme] ??= {})[hit] = ((evidence[theme] ?? {})[hit] ?? 0) + p.probability;
        }
      }
    }
    opts.onProgress?.(i + 1, picked.length);
  }

  if (!analyzed) return null;

  const entries = Object.entries(scores) as [TemplateType, number][];
  if (!entries.length) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  entries.sort((a, b) => b[1] - a[1]);
  const [theme, top] = entries[0];

  // Need a minimum signal AND clear dominance to suggest at all.
  const confidence = total > 0 ? top / total : 0;
  if (top < 0.25 || confidence < 0.35) return null;

  const topEvidence = Object.entries(evidence[theme] ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);

  return { theme, confidence, evidence: topEvidence, analyzed };
}
