/* ── Template Validation: Detect & Fix Slot Overlaps ── */

import type { PageTemplate, TemplateSlot } from './types';

interface OverlapResult {
  indexA: number;
  indexB: number;
  overlapArea: number;
  overlapPctOfSmaller: number;
}

function rectArea(s: TemplateSlot): number {
  return s.width * s.height;
}

function rectOverlap(a: TemplateSlot, b: TemplateSlot): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

/** Detect all pairwise overlaps in a template's slots. */
export function detectOverlaps(slots: TemplateSlot[]): OverlapResult[] {
  const results: OverlapResult[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const area = rectOverlap(slots[i], slots[j]);
      if (area > 0) {
        const smaller = Math.min(rectArea(slots[i]), rectArea(slots[j]));
        results.push({
          indexA: i,
          indexB: j,
          overlapArea: area,
          overlapPctOfSmaller: (area / smaller) * 100,
        });
      }
    }
  }
  return results;
}

/** Auto-fix a template by removing or shrinking slots with >30% overlap. */
export function autoFixTemplateSlots(template: PageTemplate, thresholdPct = 30): PageTemplate {
  let slots = [...template.slots];
  let changed = false;

  // Iteratively resolve overlaps until none exceed threshold
  let maxIterations = slots.length * 2;
  while (maxIterations-- > 0) {
    const overlaps = detectOverlaps(slots);
    const bad = overlaps.filter((o) => o.overlapPctOfSmaller > thresholdPct);
    if (bad.length === 0) break;

    // Pick the worst overlap
    const worst = bad.reduce((a, b) => (a.overlapPctOfSmaller > b.overlapPctOfSmaller ? a : b));
    const idxA = worst.indexA;
    const idxB = worst.indexB;

    // Decide which slot to modify: prefer removing the smaller one
    const areaA = rectArea(slots[idxA]);
    const areaB = rectArea(slots[idxB]);
    const [victimIdx, keeperIdx] = areaA <= areaB ? [idxA, idxB] : [idxB, idxA];

    const victim = slots[victimIdx];
    const keeper = slots[keeperIdx];

    // Strategy 1: Try to shrink victim so it no longer overlaps
    // Only shrink along one axis at a time
    const overlapLeft = Math.max(victim.x, keeper.x);
    const overlapRight = Math.min(victim.x + victim.width, keeper.x + keeper.width);
    const overlapTop = Math.max(victim.y, keeper.y);
    const overlapBottom = Math.min(victim.y + victim.height, keeper.y + keeper.height);

    const overlapW = overlapRight - overlapLeft;
    const overlapH = overlapBottom - overlapTop;

    let shrunk: TemplateSlot | null = null;

    if (overlapW > overlapH) {
      // More horizontal overlap — try shrinking width
      if (victim.x < keeper.x) {
        // victim is to the left — shrink its right edge
        const newWidth = keeper.x - victim.x;
        if (newWidth >= 5) {
          shrunk = { ...victim, width: newWidth };
        }
      } else {
        // victim is to the right — shrink its left edge
        const newX = keeper.x + keeper.width;
        const newWidth = victim.x + victim.width - newX;
        if (newWidth >= 5) {
          shrunk = { ...victim, x: newX, width: newWidth };
        }
      }
    } else {
      // More vertical overlap — try shrinking height
      if (victim.y < keeper.y) {
        // victim is above — shrink its bottom edge
        const newHeight = keeper.y - victim.y;
        if (newHeight >= 5) {
          shrunk = { ...victim, height: newHeight };
        }
      } else {
        // victim is below — shrink its top edge
        const newY = keeper.y + keeper.height;
        const newHeight = victim.y + victim.height - newY;
        if (newHeight >= 5) {
          shrunk = { ...victim, y: newY, height: newHeight };
        }
      }
    }

    if (shrunk) {
      // Verify the shrunk slot no longer overlaps badly with ANY other slot
      const testSlots = slots.map((s, i) => (i === victimIdx ? shrunk! : s));
      const newOverlaps = detectOverlaps(testSlots);
      const stillBad = newOverlaps.filter((o) => o.overlapPctOfSmaller > thresholdPct && (o.indexA === victimIdx || o.indexB === victimIdx));
      if (stillBad.length === 0) {
        slots = testSlots;
        changed = true;
        continue;
      }
    }

    // Strategy 2: Remove the victim slot entirely
    slots = slots.filter((_, i) => i !== victimIdx);
    changed = true;
  }

  if (changed) {
    return { ...template, slots };
  }
  return template;
}

/** Validate all templates, log issues, return fixed array. */
export function validateAllTemplates(templates: PageTemplate[], thresholdPct = 30): {
  fixed: PageTemplate[];
  issues: string[];
} {
  const fixed: PageTemplate[] = [];
  const issues: string[] = [];

  for (const template of templates) {
    const overlaps = detectOverlaps(template.slots);
    const bad = overlaps.filter((o) => o.overlapPctOfSmaller > thresholdPct);

    if (bad.length > 0) {
      const beforeCount = template.slots.length;
      const fixedTemplate = autoFixTemplateSlots(template, thresholdPct);
      const afterCount = fixedTemplate.slots.length;

      const detail = bad.map((o) => {
        return `slot${o.indexA + 1}-slot${o.indexB + 1} (${Math.round(o.overlapPctOfSmaller)}%)`;
      }).join(', ');

      if (afterCount < beforeCount) {
        issues.push(
          `[${template.id}] Removed ${beforeCount - afterCount} slot(s) due to >${thresholdPct}% overlap (${detail})`
        );
      } else {
        issues.push(
          `[${template.id}] Adjusted slots to resolve >${thresholdPct}% overlap (${detail})`
        );
      }
      fixed.push(fixedTemplate);
    } else {
      fixed.push(template);
    }
  }

  return { fixed, issues };
}
