import { describe, expect, it } from 'vitest';
import { parseClassList } from './classList';
import { applyMatch, assignPhoto, sectionFromClassList } from './project';
import type { PhotoMeta } from './types';

const photo = (id: string, fileName: string, order = 0): PhotoMeta => ({ id, fileName, width: 1200, height: 1500, order, faces: [], flags: [], scanned: true });

describe('project operations', () => {
  const parsed = parseClassList('Adviser: Ms. Ana Reyes\nDELA CRUZ, Juan\nSANTOS, Maria\nRAMOS, Paolo');

  it('makes a section with an adviser and a printed code for everyone', () => {
    const s = sectionFromClassList('Grade 12 · St. Joseph', parsed);
    expect(s.people).toHaveLength(4);
    expect(s.people.find((p) => p.role === 'class_adviser')).toMatchObject({ title: 'Ms.', last: 'Reyes' });
    const codes = new Set([s.classMemoryCode, ...s.people.map((p) => p.memoryCode)]);
    expect(codes.size).toBe(5);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{8}$/);
  });

  it('matches the adviser by name too', () => {
    const s = sectionFromClassList('X', parsed);
    const r = applyMatch(s, [photo('1', 'reyes_ana.jpg'), photo('2', 'santos maria.jpg'), photo('3', 'dela_cruz_juan.jpg'), photo('4', 'ramos-paolo.jpg')]);
    const adviser = s.people.find((p) => p.role === 'class_adviser')!;
    expect(r.section.assignments[adviser.id]).toEqual(['1']);
    expect(r.method).toBe('names');
  });

  it('swaps when a photo is moved to someone who already had one', () => {
    let s = sectionFromClassList('X', parsed);
    s = applyMatch(s, [photo('1', 'dela_cruz_juan.jpg'), photo('2', 'santos maria.jpg'), photo('3', 'ramos-paolo.jpg')]).section;
    const [juan, maria] = s.people;
    const next = assignPhoto(s, juan.id, '2');
    expect(next.assignments[juan.id]).toEqual(['2']);
    expect(next.assignments[maria.id]).toEqual(['1']);
    expect(next.checked[juan.id]).toBe(false);
  });
});
