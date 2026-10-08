import { describe, expect, it } from 'vitest';
import { currentStep, guideSteps } from './guide';
import { newProject, sectionFromClassList, applyMatch } from './project';
import { parseClassList } from './classList';
import type { PhotoMeta } from './types';

describe('guide', () => {
  it('starts at naming the yearbook and walks forward as the book fills in', () => {
    expect(currentStep(guideSteps(null, null))?.id).toBe('name');
    const p = newProject('St. Joseph Academy', '2027');
    expect(currentStep(guideSteps(p, null))?.id).toBe('section');
    const s = sectionFromClassList('Grade 12', parseClassList('SANTOS, Maria\nRAMOS, Paolo'));
    const withSection = { ...p, sections: [s] };
    expect(currentStep(guideSteps(withSection, s))?.id).toBe('photos');
    const photos: PhotoMeta[] = [
      { id: 'a', fileName: 'santos_maria.jpg', width: 10, height: 10, order: 0, faces: [], flags: [], scanned: true },
      { id: 'b', fileName: 'ramos_paolo.jpg', width: 10, height: 10, order: 1, faces: [], flags: [], scanned: true },
    ];
    const matched = applyMatch(s, photos).section;
    const steps = guideSteps({ ...p, sections: [matched] }, matched);
    expect(steps.find((x) => x.id === 'photos')?.progress).toBe('2 of 2 photos matched');
    expect(currentStep(steps)?.id).toBe('check');
    const checked = { ...matched, checked: Object.fromEntries(matched.people.map((x) => [x.id, true])), sizeChosen: true, groupSkipped: true };
    expect(currentStep(guideSteps({ ...p, sections: [checked] }, checked))?.id).toBe('print');
  });

  it('every step has a labelled action and a Show me target', () => {
    for (const s of guideSteps(null, null)) {
      expect(s.action.label.length).toBeGreaterThan(3);
      expect(s.showMe).toMatch(/^[a-z-]+$/);
    }
  });
});
