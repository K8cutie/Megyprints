/* ── MEGYearbooks data model (client side, Phase 1: local project) ── */
import type { Density, LooksPerPage } from './geometry';

export type PersonRole = 'student' | 'class_adviser';

export interface Person {
  id: string;
  last: string;
  first: string;
  middle?: string;
  suffix?: string;
  /** "Ms.", "Mr.", "Sr." — advisers. */
  title?: string;
  role: PersonRole;
  /** Position in the pasted class list. */
  rosterOrder: number;
  /** Printed QR code (memory code) — minted once, never changes. */
  memoryCode: string;
}

/** Face geometry in the photo's own normalised coordinates (0–1). */
export interface FaceGeom {
  box: { x: number; y: number; w: number; h: number };
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  /** Where it came from: the on-device face AI, or a drawn sample portrait. */
  source: 'ai' | 'sample';
}

export type PhotoFlag = 'no_face' | 'many_faces' | 'eyes_closed' | 'low_res' | 'tight_crop';

export interface PhotoMeta {
  id: string;
  fileName: string;
  width: number;
  height: number;
  /** Capture time from EXIF when present (ms), else file order. */
  order: number;
  faces: FaceGeom[];
  flags: PhotoFlag[];
  /** Whether the face scan has run on this photo. */
  scanned: boolean;
}

export type SectionLayout = 'portraits' | 'looks3';

export interface Section {
  id: string;
  /** e.g. "Grade 12 · St. Joseph" */
  title: string;
  people: Person[];
  /** person id → photo ids; [0] is the main photo (toga in 3-looks). */
  assignments: Record<string, string[]>;
  /** Matching confidence per person (0–1), for the check screen. */
  confidence: Record<string, number>;
  /** People the adviser has confirmed on the name check. */
  checked: Record<string, boolean>;
  groupPhotoId?: string;
  classMemoryCode: string;
  layout: SectionLayout;
  density: Density;
  looksPerPage: LooksPerPage;
  /** Every portrait photo brought in for this class (matched or not). */
  pool?: string[];
  /** The adviser picked a portrait size (the guide's step 5). */
  sizeChosen?: boolean;
  /** The adviser said there's no class photo for this section. */
  groupSkipped?: boolean;
}

export interface YearbookProject {
  id: string;
  school: string;
  schoolYear: string;
  sections: Section[];
  binding: 'soft' | 'hard';
  copies: number;
  /** Fixed pages outside the class sections (cover pages, messages, events, sponsors). */
  otherPages: number;
  createdAt: number;
  updatedAt: number;
  /** Print files downloaded at least once. */
  printed?: boolean;
}
