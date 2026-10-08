import { describe, expect, it } from 'vitest';
import { displayName, parseClassList, parseName, sortForPage, tidyCase } from './classList';

describe('parseName', () => {
  it('reads "LAST, First M." in capitals', () => {
    expect(parseName('DELA CRUZ, JUAN MIGUEL P.', 0)).toEqual({ last: 'Dela Cruz', first: 'Juan Miguel', middle: 'P.', rosterOrder: 0 });
  });
  it('keeps surname particles with the surname when written first-name-first', () => {
    expect(parseName('Maria Clara de los Santos', 3)).toMatchObject({ last: 'de los Santos', first: 'Maria Clara' });
    expect(parseName('Jose P. Del Rosario Jr.', 1)).toMatchObject({ last: 'Del Rosario', first: 'Jose', middle: 'P.', suffix: 'Jr.' });
  });
  it('drops numbering and keeps ñ', () => {
    expect(parseName('12. NUÑEZ, Ma. Theresa', 0)).toMatchObject({ last: 'Nuñez', first: 'Ma. Theresa' });
  });
  it('handles a suffix written after the given name', () => {
    expect(parseName('Santos, Pedro III', 0)).toMatchObject({ last: 'Santos', first: 'Pedro', suffix: 'III' });
  });
});

describe('tidyCase', () => {
  it('title-cases all-caps but leaves typed case alone', () => {
    expect(tidyCase('SANTOS-REYES')).toBe('Santos-Reyes');
    expect(tidyCase('McArthur')).toBe('McArthur');
  });
});

describe('parseClassList', () => {
  it('reads a typed list with an adviser line', () => {
    const r = parseClassList('Adviser: Ms. Ana Reyes\n1. DELA CRUZ, Juan\n2. Santos, Maria B.\n\n3. Ramos, Paolo');
    expect(r.adviser).toMatchObject({ title: 'Ms.', name: { last: 'Reyes', first: 'Ana' } });
    expect(r.students.map((s) => s.last)).toEqual(['Dela Cruz', 'Santos', 'Ramos']);
    expect(r.students.map((s) => s.rosterOrder)).toEqual([0, 1, 2]);
  });
  it('reads tab-separated columns with a header (Excel / Sheets paste)', () => {
    const r = parseClassList('No.\tLRN\tLast Name\tFirst Name\tMiddle Name\tSex\n1\t136512340001\tGARCIA\tANDREA\tL\tF\n2\t136512340002\tBAUTISTA\tMARK\tSANTOS\tM');
    expect(r.students).toEqual([
      { last: 'Garcia', first: 'Andrea', middle: 'L.', rosterOrder: 0 },
      { last: 'Bautista', first: 'Mark', middle: 'Santos', rosterOrder: 1 },
    ]);
  });
  it('guesses columns without a header, skipping numbers and sex', () => {
    const r = parseClassList('1\tREYES\tCARLO\tM\n2\tLIM\tJOY\tF');
    expect(r.students.map((s) => `${s.last}/${s.first}`)).toEqual(['Reyes/Carlo', 'Lim/Joy']);
  });
  it('warns about duplicates and unreadable lines', () => {
    const r = parseClassList('Santos, Maria\nSANTOS, MARIA\n----');
    expect(r.warnings.some((w) => w.includes('appears 2 times'))).toBe(true);
  });
  it('skips a lone header line in a typed list', () => {
    const r = parseClassList('Names of learners\nRamos, Paolo');
    expect(r.students).toHaveLength(1);
  });
});

describe('sortForPage / displayName', () => {
  it('files "Dela Cruz" under D and prints first-name-first', () => {
    const sorted = sortForPage([{ last: 'Santos', first: 'A' }, { last: 'Dela Cruz', first: 'Juan' }, { last: 'Abad', first: 'Z' }]);
    expect(sorted.map((s) => s.last)).toEqual(['Abad', 'Dela Cruz', 'Santos']);
    expect(displayName({ last: 'Dela Cruz', first: 'Juan', middle: 'P.', suffix: 'Jr.' })).toBe('Juan P. Dela Cruz Jr.');
  });
});
