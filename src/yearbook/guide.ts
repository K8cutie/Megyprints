/* ── The step guide ──────────────────────────────────────────────────────────
   Walks the yearbook adviser through the book, Megy-style: one plain sentence
   per step and ONE labelled button that does the next thing (no greyed
   buttons — a tap always does something). "Show me" points at the real
   control on screen via its data-guide name. Progress is read from the
   project, so the guide can never disagree with the book. */
import { uncheckedCount } from './project';
import type { Section, YearbookProject } from './types';

export type StepId = 'name' | 'section' | 'photos' | 'check' | 'size' | 'group' | 'print';
export type GuideAction = 'edit-name' | 'add-section' | 'add-photos' | 'open-check' | 'pick-size' | 'add-group' | 'download';

export interface GuideStep {
  id: StepId;
  title: string;
  /** One plain sentence: what to do now. */
  say: string;
  done: boolean;
  /** Live progress line, e.g. "28 of 30 photos matched". */
  progress?: string;
  action: { label: string; do: GuideAction };
  /** data-guide name of the control "Show me" points at. */
  showMe: string;
  optional?: boolean;
}

export function guideSteps(project: YearbookProject | null, section: Section | null): GuideStep[] {
  const students = section ? section.people.filter((p) => p.role === 'student') : [];
  const matched = section ? students.filter((p) => section.assignments[p.id]?.length).length : 0;
  const unchecked = section ? uncheckedCount(section) : 0;
  return [
    { id: 'name', title: 'Name your yearbook', say: 'Type the school name and the batch year. They go on the pages.', done: !!project?.school.trim(), action: { label: 'Type the school name', do: 'edit-name' }, showMe: 'school-name' },
    { id: 'section', title: 'Add a class', say: 'Paste the class list from Excel, Google Sheets or the SF1. The adviser line is optional.', done: !!project?.sections.length, progress: project?.sections.length ? `${project.sections.length} class${project.sections.length === 1 ? '' : 'es'}` : undefined, action: { label: 'Add a class', do: 'add-section' }, showMe: 'add-section' },
    { id: 'photos', title: 'Add the photographer’s photos', say: 'Drop the whole folder for this class. Megy matches each photo to a name and lines up the faces.', done: matched > 0, progress: section ? `${matched} of ${students.length} photos matched` : undefined, action: { label: 'Add photos', do: 'add-photos' }, showMe: 'add-photos' },
    { id: 'check', title: 'Check every name', say: 'Look at each face and name once. A wrong name is the one mistake parents never forgive.', done: !!section && matched > 0 && unchecked === 0, progress: section ? `${section.people.length - unchecked} of ${section.people.length} checked` : undefined, action: { label: 'Check names', do: 'open-check' }, showMe: 'open-check' },
    { id: 'size', title: 'Pick the portrait size', say: 'Bigger portraits take more pages, so the price per copy goes up. Each choice shows its pages and price.', done: !!section?.sizeChosen, action: { label: 'Pick a size', do: 'pick-size' }, showMe: 'portrait-size' },
    { id: 'group', title: 'Add the class photo', say: 'The class photo gets its own page and the class video QR. Skip this if there isn’t one.', done: !!section && (!!section.groupPhotoId || !!section.groupSkipped), action: { label: 'Add the class photo', do: 'add-group' }, showMe: 'add-group', optional: true },
    { id: 'print', title: 'Download the print files', say: 'Each class downloads as its own print-ready PDF, 300 dpi with bleed.', done: !!project?.printed, action: { label: 'Download print files', do: 'download' }, showMe: 'download' },
  ];
}

/** The step the guide is on: the first one not done. */
export function currentStep(steps: GuideStep[]): GuideStep | null {
  return steps.find((s) => !s.done) ?? null;
}
