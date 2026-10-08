/* ── The sample class ────────────────────────────────────────────────────────
   A made-up class (Grade 12 · St. Joseph, St. Joseph Academy) built from free
   Unsplash photos of adults (public/yearbook-samples, credits in CREDITS.md).
   The names and the school are invented; they are not the people in the
   photos. The files are named the way a photographer delivers them
   ("ABAD_Andrea.jpg") so the sample also shows the name matching.

   Face positions were found by the app's own face AI and saved in the
   manifest, so the sample opens in seconds. The same photos are the
   pictures in the landing page and the guide's examples. */
import { importPhoto } from './importPhotos';
import type { FaceGeom, PhotoMeta } from './types';

export const SAMPLE_BASE = '/yearbook-samples';

export interface SamplePerson {
  file: string;
  first: string;
  last: string;
  middle?: string;
  role: 'student' | 'class_adviser';
  width: number;
  height: number;
  faces: Omit<FaceGeom, 'source'>[];
  credit: { photographer: string; unsplash: string };
}

export interface SampleManifest {
  school: string;
  section: string;
  batch: string;
  adviserTitle: string;
  people: SamplePerson[];
  classPhoto: { file: string; width: number; height: number; faces: Omit<FaceGeom, 'source'>[]; credit: { photographer: string; unsplash: string } };
}

export const samplePortraitUrl = (file: string): string => `${SAMPLE_BASE}/portraits/${file}`;
export const sampleThumbUrl = (file: string): string => `${SAMPLE_BASE}/thumbs/${file}`;

let manifestPromise: Promise<SampleManifest> | null = null;

export function fetchSampleManifest(): Promise<SampleManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${SAMPLE_BASE}/manifest.json`)
      .then((r) => { if (!r.ok) throw new Error(`The sample class didn't load (${r.status})`); return r.json() as Promise<SampleManifest>; })
      .catch((e) => { manifestPromise = null; throw e; });
  }
  return manifestPromise;
}

/** The class list as an adviser would paste it (capitals, numbered). */
export function sampleClassListText(m: SampleManifest): string {
  const adviser = m.people.find((p) => p.role === 'class_adviser');
  const students = m.people.filter((p) => p.role === 'student');
  return [
    ...(adviser ? [`Adviser: ${m.adviserTitle} ${adviser.first} ${adviser.last}`] : []),
    ...students.map((s, i) => `${i + 1}. ${s.last.toUpperCase()}, ${s.first.toUpperCase()}${s.middle ? ' ' + s.middle : ''}`),
  ].join('\n');
}

async function fetchBlob(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`A sample photo didn't load (${r.status})`);
  return r.blob();
}

/** Bring the sample photos in exactly like a photographer's folder. */
export async function loadSamplePhotos(m: SampleManifest, onProgress?: (done: number, total: number, name: string) => void): Promise<{ portraits: PhotoMeta[]; classPhoto: PhotoMeta }> {
  const total = m.people.length + 1;
  const portraits: PhotoMeta[] = [];
  for (let i = 0; i < m.people.length; i++) {
    const p = m.people[i];
    const blob = await fetchBlob(samplePortraitUrl(p.file));
    portraits.push(await importPhoto(blob, p.file, 'portrait', i, { faces: p.faces.map((f) => ({ ...f, source: 'ai' as const })) }));
    onProgress?.(i + 1, total, `${p.first} ${p.last}`);
  }
  const g = m.classPhoto;
  const classPhoto = await importPhoto(await fetchBlob(`${SAMPLE_BASE}/${g.file}`), g.file, 'group', 0, { faces: g.faces.map((f) => ({ ...f, source: 'ai' as const })) });
  onProgress?.(total, total, 'the class photo');
  return { portraits, classPhoto };
}
