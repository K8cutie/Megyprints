/* The video memory sheet's words: the website's (src/pages/builder/
   AddQrModal.tsx ClipModal, VideoMemoryButton.tsx), held to its source by
   test/memorySheet.test.tsx. */
import type { QrCorner } from '@web/pages/builder/pageTemplates';
import { MAX_CLIP_SECONDS, QUALITY_TARGETS, type ClipQuality } from '../../lib/memories/clips';

export const ADD_BUTTON = 'Add a video memory';
export const TITLE_ADD = 'Add a video memory';
export const TITLE_CHANGE = 'Change this memory';
export const INVITE = 'Pick a video of this moment 🎬';
export const INVITE_BODY = `It plays the instant anyone scans the QR printed on this page — no app, no account. Up to ${Math.round(MAX_CLIP_SECONDS / 60)} minutes — we shrink it for you, so any phone video works.`;
/** "7 memories included · ₱20 each after · live for 5 years, longer at checkout". */
export const included = (free: number, rate: number, years: number | null) =>
  `${free} memories included · ₱${rate} each after${years ? ` · live for ${years} years, longer at checkout` : ''}`;
export const PLAYS_THIS = 'This is what plays when someone scans this page.';
export const legacyLink = (host: string) =>
  `This memory currently points to a link on ${host}. Replace it with a video and it will play right on the page — same QR, no reprint.`;
export const QUALITY_LABEL = 'Video quality for this album';
export const qualityName = (q: ClipQuality) => `${q === 'hd' ? 'HD' : 'Standard'} ${QUALITY_TARGETS[q].label}`;
export const qualityPrice = (q: ClipQuality, hdPrice: number) => (q === 'hd' ? `+PHP ${hdPrice} once` : 'Included');
export const QUALITY_NOTE = 'Applies to every memory in this album, for its whole hosting term.';
export const qualityLocked = (q: ClipQuality) =>
  `Quality: ${q === 'hd' ? `HD ${QUALITY_TARGETS.hd.label}` : `Standard ${QUALITY_TARGETS.standard.label}`} - set with your first memory.`;
export const CHECKING = 'Checking your video…';
export const pickLabel = (hasFile: boolean, editing: boolean) =>
  (hasFile ? 'Choose a different video' : editing ? 'Replace with a new video' : 'Choose a video');
export const CHOOSE_FIRST = 'Choose a video first.';
export const SAVE_FAILED = 'Could not save the video. Please try again.';
export const pickedLine = (name: string, size: number, durationSec: number | null) =>
  `${name} · ${(size / 1024 / 1024).toFixed(1)} MB${durationSec != null ? ` · ${Math.round(durationSec)} s` : ''}`;
export const CORNER_QUESTION = 'Which corner should the QR sit in?';
export const AUTO = '✨ Auto';
export const CORNER_LABELS: Record<QrCorner, string> = { tl: 'Top-left', tr: 'Top-right', bl: 'Bottom-left', br: 'Bottom-right' };
export const cornerNote = (corner: QrCorner | null) =>
  (corner == null ? 'Auto places it away from the face.' : `Placed in the ${CORNER_LABELS[corner].toLowerCase()} corner.`);
/** The app's own line (the website offers all 4 corners): why only 2. */
export const OUTER_EDGE_NOTE = 'The QR goes on the outer edge of the page, away from the binding, so it is easy to scan.';
export const REMOVE = 'Remove';
export const SAVING = 'Saving…';
export const saveLabel = (editing: boolean) => (editing ? 'Use this video' : 'Place QR');

