/** ══════════════════════════════════════════════════════════════════════════
    THEME DETECTOR — Suggest a theme from photo CONTENT (on-device)

    Runs a MobileNet image classifier (TensorFlow.js) entirely in the browser —
    photos never leave the device, consistent with the local-first design.
    Each sampled photo yields ImageNet scene/object labels; those labels are
    mapped to occasion themes and scored. Returns the best-fit suggestion.

    tfjs + the model are loaded LAZILY (dynamic import) so they stay out of the
    main bundle. The model is the one the photo check's look pass uses
    (lib/mobileNet): one copy, downloaded once and kept in the browser.

    NOTE: content classification reliably maps OCCASION/SCENE themes (travel,
    graduation, baptism, birthday, wedding, baby). Stylistic themes (family,
    classic, vintage, minimalist) are aesthetic choices not visible in a photo,
    so they are intentionally not inferred here.
    ══════════════════════════════════════════════════════════════════════════ */

import type { UploadedPhoto, TemplateType } from './types';
import { loadMobileNet } from '../../lib/mobileNet';

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

/** The MobileNet model + a tfjs backend (lib/mobileNet: lazy, loaded once,
 *  WebGL when there is one, else the CPU so the guess still runs). */
async function getModel(): Promise<Classifier> {
  return (await loadMobileNet()).net;
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
