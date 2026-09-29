import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cityUnit, cityRegion } from './psgc';

// The address picker's province list is generated data (scripts/build-psgc.mjs),
// so these check the files a buyer's checkout actually fetches.
const dir = path.resolve(process.cwd(), 'public/psgc');
const load = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

interface Item { code: string; name: string }
const provinces = load<(Item & { regCode: string })[]>('provinces.json');
const cities = load<(Item & { provKey: string })[]>('muncities.json');
const regions = load<Item[]>('regions.json');
const brgyFiles = new Map<string, { cityKey: string }[]>();
const brgyOf = (cityCode: string) => {
  const unit = cityUnit(cityCode);
  if (!brgyFiles.has(unit)) {
    const f = path.join(dir, 'brgy', `${unit}.json`);
    brgyFiles.set(unit, fs.existsSync(f) ? load(`brgy/${unit}.json`) : []);
  }
  return brgyFiles.get(unit)!.filter((b) => b.cityKey === cityCode);
};

const province = (name: string) => provinces.find((p) => p.name === name);
const citiesIn = (name: string) => cities.filter((c) => c.provKey === province(name)?.code).map((c) => c.name);

describe('PSGC province list (checkout address picker)', () => {
  it('lists Metro Manila as one province, like mail and couriers do', () => {
    expect(province('Metro Manila')).toBeDefined();
    const mm = citiesIn('Metro Manila');
    for (const c of ['Makati City', 'Quezon City', 'Pasay City', 'Taguig City', 'Pateros', 'Manila – Sampaloc', 'Manila – Tondo I/II']) {
      expect(mm).toContain(c);
    }
  });

  it('never lists a city as a province', () => {
    const cityLike = provinces.filter((p) => /^City of |\bCity$/.test(p.name));
    expect(cityLike.map((p) => p.name)).toEqual([]);
    expect(provinces).toHaveLength(84); // 82 provinces + Metro Manila + BARMM SGA
  });

  it('puts each highly urbanized city inside its own province', () => {
    expect(citiesIn('Cebu')).toEqual(expect.arrayContaining(['Cebu City', 'Lapu-Lapu City', 'Mandaue City']));
    expect(citiesIn('Davao del Sur')).toContain('Davao City');
    expect(citiesIn('Benguet')).toContain('Baguio City');
    expect(citiesIn('Pampanga')).toContain('Angeles City');
    expect(citiesIn('Negros Occidental')).toContain('Bacolod City');
    expect(citiesIn('Iloilo')).toContain('Iloilo City');
    expect(citiesIn('Basilan')).toContain('Isabela City');
  });

  it('every province has cities and every city has barangays (no dead ends)', () => {
    const provCodes = new Set(provinces.map((p) => p.code));
    for (const p of provinces) expect(cities.some((c) => c.provKey === p.code), p.name).toBe(true);
    for (const c of cities) {
      expect(provCodes.has(c.provKey), c.name).toBe(true);
      expect(brgyOf(c.code).length, `${c.name} barangays`).toBeGreaterThan(0);
    }
  });

  it("derives the city's true region even when its province is in another", () => {
    const known = new Set(regions.map((r) => r.code));
    for (const c of cities) expect(known.has(cityRegion(c.code)), c.name).toBe(true);
    const isabela = cities.find((c) => c.name === 'Isabela City' && c.provKey === province('Basilan')?.code)!;
    expect(cityRegion(isabela.code)).toBe('09'); // Zamboanga Peninsula, though Basilan is BARMM
    const makati = cities.find((c) => c.name === 'Makati City')!;
    expect(cityRegion(makati.code)).toBe('13');
  });
});
