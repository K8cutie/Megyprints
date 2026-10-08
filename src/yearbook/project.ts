/* ── Project operations (pure) ──────────────────────────────────────────────
   Everything the screens do to a yearbook goes through these functions, so
   the same rules hold whether the adviser clicks, pastes, or the guide does it. */
import type { ParsedClassList } from './classList';
import { matchPhotos } from './photoMatch';
import { newMemoryCode } from './qr';
import type { Person, PhotoMeta, Section, YearbookProject } from './types';

const id = (): string => crypto.randomUUID();

export function newProject(school: string, schoolYear: string): YearbookProject {
  const now = Date.now();
  return { id: id(), school, schoolYear, sections: [], binding: 'hard', copies: 100, otherPages: 24, createdAt: now, updatedAt: now };
}

export function sectionFromClassList(title: string, parsed: ParsedClassList): Section {
  const people: Person[] = parsed.students.map((s) => ({
    id: id(), last: s.last, first: s.first, ...(s.middle ? { middle: s.middle } : {}), ...(s.suffix ? { suffix: s.suffix } : {}),
    role: 'student', rosterOrder: s.rosterOrder, memoryCode: newMemoryCode(),
  }));
  if (parsed.adviser) {
    const a = parsed.adviser.name;
    people.push({ id: id(), last: a.last, first: a.first, ...(a.middle ? { middle: a.middle } : {}), ...(parsed.adviser.title ? { title: parsed.adviser.title } : {}), role: 'class_adviser', rosterOrder: -1, memoryCode: newMemoryCode() });
  }
  return { id: id(), title, people, assignments: {}, confidence: {}, checked: {}, classMemoryCode: newMemoryCode(), layout: 'portraits', density: 12, looksPerPage: 3 };
}

/** Pair the section's people with new photos (names or shooting order). */
export function applyMatch(section: Section, photos: PhotoMeta[]): { section: Section; method: 'names' | 'order'; warnings: string[]; unmatched: string[] } {
  const perPerson = section.layout === 'looks3' ? 3 : 1;
  const r = matchPhotos(section.people.map((p) => ({ id: p.id, last: p.last, first: p.first, middle: p.middle, rosterOrder: p.role === 'class_adviser' ? 10_000 : p.rosterOrder })), photos.map((p) => ({ id: p.id, fileName: p.fileName, order: p.order })), perPerson);
  const checked: Record<string, boolean> = {};
  return {
    section: { ...section, assignments: r.assignments, confidence: r.confidence, checked },
    method: r.method,
    warnings: r.warnings,
    unmatched: r.unmatchedPhotos,
  };
}

/** Give a photo to a person. If someone else had it, they swap. */
export function assignPhoto(section: Section, personId: string, photoId: string, slot = 0): Section {
  const assignments = Object.fromEntries(Object.entries(section.assignments).map(([k, v]) => [k, [...v]]));
  const mine = assignments[personId] ?? [];
  const previous = mine[slot];
  for (const [pid, list] of Object.entries(assignments)) {
    const at = list.indexOf(photoId);
    if (pid !== personId && at >= 0) {
      if (previous) list[at] = previous; else list.splice(at, 1);
      if (!list.length) delete assignments[pid];
    }
  }
  const next = [...mine];
  next[slot] = photoId;
  assignments[personId] = next.filter(Boolean);
  const checked = { ...section.checked, [personId]: false };
  return { ...section, assignments, checked, confidence: { ...section.confidence, [personId]: 1 } };
}

export function removePhoto(section: Section, personId: string): Section {
  const assignments = { ...section.assignments };
  delete assignments[personId];
  return { ...section, assignments, checked: { ...section.checked, [personId]: false } };
}

export function updateSection(project: YearbookProject, section: Section): YearbookProject {
  return { ...project, sections: project.sections.map((s) => (s.id === section.id ? section : s)), updatedAt: Date.now() };
}

/** Students the adviser still has to confirm on the name check. */
export function uncheckedCount(section: Section): number {
  return section.people.filter((p) => !section.checked[p.id]).length;
}
