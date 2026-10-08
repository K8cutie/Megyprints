import { describe, expect, it } from 'vitest';
import { fileTokens, hungarian, lookOf, matchPhotos, scoreName, type MatchPerson, type MatchPhoto } from './photoMatch';

const people: MatchPerson[] = [
  { id: 'a', last: 'Dela Cruz', first: 'Juan', rosterOrder: 0 },
  { id: 'b', last: 'Santos', first: 'Maria', rosterOrder: 1 },
  { id: 'c', last: 'Santos', first: 'Mario', rosterOrder: 2 },
  { id: 'd', last: 'Nuñez', first: 'Ana', rosterOrder: 3 },
];
const ph = (id: string, fileName: string, order = 0): MatchPhoto => ({ id, fileName, order });

describe('file names', () => {
  it('splits camel case and drops camera words and numbers', () => {
    expect(fileTokens('IMG_0412_DelaCruz-Juan_FINAL.jpg')).toEqual(['dela', 'cruz', 'juan']);
  });
  it('finds a run-together surname and folds ñ', () => {
    expect(scoreName(people[0], 'DELACRUZ_JUAN.JPG')).toBeGreaterThan(0.95);
    expect(scoreName(people[3], 'nunez-ana.jpg')).toBeGreaterThan(0.95);
  });
  it('needs the surname', () => {
    expect(scoreName(people[1], 'maria.jpg')).toBe(0);
  });
  it('reads the look from the file name', () => {
    expect(lookOf('santos_maria_TOGA.jpg')).toBe(0);
    expect(lookOf('santos maria filipiniana.jpg')).toBe(1);
    expect(lookOf('santos-maria-creative.jpg')).toBe(2);
    expect(lookOf('santos.jpg')).toBeNull();
  });
});

describe('hungarian', () => {
  it('finds the cheapest one-to-one pairing', () => {
    expect(hungarian([[4, 1, 3], [2, 0, 5], [3, 2, 2]])).toEqual([1, 0, 2]);
  });
});

describe('matchPhotos', () => {
  it('pairs by name and never gives one file to two people', () => {
    const r = matchPhotos(people, [ph('1', 'santos_mario.jpg'), ph('2', 'Santos Maria.jpg'), ph('3', 'DELACRUZ_JUAN.jpg'), ph('4', 'NUNEZ ANA.jpg')]);
    expect(r.method).toBe('names');
    expect(r.assignments).toEqual({ a: ['3'], b: ['2'], c: ['1'], d: ['4'] });
    expect(r.similar.b).toBe('c');
    expect(r.unmatchedPhotos).toEqual([]);
  });
  it('falls back to shooting order for numbered files and warns on a count mismatch', () => {
    const r = matchPhotos(people, [ph('x', 'IMG_0003.jpg', 3), ph('y', 'IMG_0001.jpg', 1), ph('z', 'IMG_0002.jpg', 2)]);
    expect(r.method).toBe('order');
    expect(r.assignments).toEqual({ a: ['y'], b: ['z'], c: ['x'] });
    expect(r.warnings[0]).toContain('3 photos for 4 people');
  });
  it('groups three looks per graduate, toga first', () => {
    const files = [ph('1', 'santos_maria_creative.jpg'), ph('2', 'santos_maria_toga.jpg'), ph('3', 'santos_maria_filipiniana.jpg'), ph('4', 'dela_cruz_juan_barong.jpg'), ph('5', 'dela_cruz_juan_toga.jpg')];
    const r = matchPhotos(people.slice(0, 2), files, 3);
    expect(r.assignments.b).toEqual(['2', '3', '1']);
    expect(r.assignments.a).toEqual(['5', '4']);
  });
});
