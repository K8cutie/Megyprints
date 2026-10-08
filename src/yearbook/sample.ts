/* ── The sample class ────────────────────────────────────────────────────────
   A made-up section (Grade 12 · St. Joseph, 30 students + adviser) with DRAWN
   portraits, so anyone can click through the whole yearbook maker without
   real students' photos. Each portrait is drawn the way photographers differ —
   heads a little bigger or smaller, a little off centre — and the face
   position is known exactly, so the same-head-size step has real work to do.
   Real photos skip all of this and go through the on-device face AI. */
import type { FaceGeom } from './types';

export interface SampleStudent { first: string; last: string; middle?: string; fem: boolean }

export const SAMPLE_SECTION = 'Grade 12 · St. Joseph';
export const SAMPLE_ADVISER = { title: 'Ms.', first: 'Ana', last: 'Reyes', fem: true };

export const SAMPLE_STUDENTS: SampleStudent[] = [
  { first: 'Andrea', last: 'Abad', middle: 'L.', fem: true }, { first: 'Paolo', last: 'Aquino', fem: false },
  { first: 'Bea', last: 'Bautista', middle: 'M.', fem: true }, { first: 'Carlo', last: 'Bernardo', fem: false },
  { first: 'Danica', last: 'Castillo', fem: true }, { first: 'Miguel', last: 'Cruz', middle: 'A.', fem: false },
  { first: 'Juan Miguel', last: 'Dela Cruz', middle: 'P.', fem: false }, { first: 'Erika', last: 'De los Santos', fem: true },
  { first: 'Gabriel', last: 'Diaz', fem: false }, { first: 'Hannah', last: 'Escobar', fem: true },
  { first: 'Isaac', last: 'Estrada', fem: false }, { first: 'Jasmine', last: 'Flores', middle: 'R.', fem: true },
  { first: 'Kevin', last: 'Garcia', fem: false }, { first: 'Lorraine', last: 'Hernandez', fem: true },
  { first: 'Marco', last: 'Ignacio', fem: false }, { first: 'Nicole', last: 'Jimenez', fem: true },
  { first: 'Oliver', last: 'Katigbak', fem: false }, { first: 'Patricia', last: 'Lim', fem: true },
  { first: 'Rafael', last: 'Mendoza', middle: 'S.', fem: false }, { first: 'Sofia', last: 'Navarro', fem: true },
  { first: 'Tristan', last: 'Ocampo', fem: false }, { first: 'Ma. Theresa', last: 'Pascual', fem: true },
  { first: 'Vincent', last: 'Quiambao', fem: false }, { first: 'Wendy', last: 'Ramos', fem: true },
  { first: 'Xavier', last: 'Santos', fem: false }, { first: 'Ysabel', last: 'Tolentino', fem: true },
  { first: 'Zack', last: 'Uy', fem: false }, { first: 'Alyssa', last: 'Villanueva', fem: true },
  { first: 'Bryan', last: 'Yap', fem: false }, { first: 'Camille', last: 'Zamora', middle: 'D.', fem: true },
];

/** The class list as an adviser would paste it (capitals, numbered). */
export function sampleClassListText(): string {
  return [
    `Adviser: ${SAMPLE_ADVISER.title} ${SAMPLE_ADVISER.first} ${SAMPLE_ADVISER.last}`,
    ...SAMPLE_STUDENTS.map((s, i) => `${i + 1}. ${s.last.toUpperCase()}, ${s.first.toUpperCase()}${s.middle ? ' ' + s.middle : ''}`),
  ].join('\n');
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = ['#efcfae', '#e3b893', '#d6a47c', '#c98f66', '#b97d55', '#a46a45'];
const HAIR = ['#17120f', '#211913', '#2d2119', '#3b2a1e', '#1a1512'];
const LIPS = ['#b5655a', '#a9574e', '#c06f62', '#9b5148'];

export type SampleLook = 'toga' | 'formal' | 'creative' | 'adviser';

interface Drawn { blob: Blob; width: number; height: number; face: FaceGeom }

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

/** Draw one person (head + shoulders) centred at (cx, cy) with face half-width rx. */
function drawPerson(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, fem: boolean, look: SampleLook, r: () => number, W: number, H: number) {
  const ry = rx * 1.27;
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const lips = LIPS[Math.floor(r() * LIPS.length)];
  const glasses = r() < 0.18;
  const hairStyle = fem ? (r() < 0.5 ? 'long' : r() < 0.6 ? 'bob' : 'pony') : r() < 0.5 ? 'short' : 'side';

  // Long hair falls behind the shoulders.
  if (fem && hairStyle === 'long') {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.75, rx * 1.28, ry * 1.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shoulders and outfit.
  const shoulderY = cy + ry * 1.35;
  const sw = rx * 3.1;
  const outfit = look === 'toga' ? '#17181c' : look === 'formal' ? (fem ? '#f4efe6' : '#efe7d4') : look === 'adviser' ? '#3d4a63' : ['#c0533a', '#2f6f8f', '#6b8f3f', '#8a4f9e'][Math.floor(r() * 4)];
  ctx.fillStyle = outfit;
  ctx.beginPath();
  ctx.moveTo(cx - sw, H + 10);
  ctx.bezierCurveTo(cx - sw, shoulderY + rx * 0.35, cx - rx * 1.25, shoulderY - rx * 0.05, cx - rx * 0.55, shoulderY - rx * 0.1);
  ctx.lineTo(cx + rx * 0.55, shoulderY - rx * 0.1);
  ctx.bezierCurveTo(cx + rx * 1.25, shoulderY - rx * 0.05, cx + sw, shoulderY + rx * 0.35, cx + sw, H + 10);
  ctx.closePath();
  ctx.fill();
  // Neck.
  ctx.fillStyle = shade(skin, 0.9);
  ctx.fillRect(cx - rx * 0.42, cy + ry * 0.6, rx * 0.84, ry * 0.85);
  // Collar / hood / sleeves details.
  if (look === 'toga') {
    ctx.fillStyle = '#7a1f2b'; // hood in the school colour
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.2, shoulderY + rx * 0.05);
    ctx.quadraticCurveTo(cx, shoulderY + rx * 1.4, cx + rx * 1.2, shoulderY + rx * 0.05);
    ctx.lineTo(cx + rx * 0.9, shoulderY + rx * 0.05);
    ctx.quadraticCurveTo(cx, shoulderY + rx * 0.95, cx - rx * 0.9, shoulderY + rx * 0.05);
    ctx.fill();
    ctx.fillStyle = '#d9a93c';
    ctx.fillRect(cx - rx * 1.2, shoulderY + rx * 0.02, rx * 2.4, rx * 0.07);
  } else if (look === 'formal') {
    ctx.strokeStyle = 'rgba(160,140,100,0.35)';
    ctx.lineWidth = Math.max(1, rx * 0.025);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * rx * 0.35, shoulderY + rx * 0.4);
      ctx.lineTo(cx + i * rx * 0.42, H);
      ctx.stroke();
    }
    if (fem) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * rx * 1.9, shoulderY + rx * 0.05, rx * 0.75, rx * 0.5, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.fillStyle = shade(outfit === '#3d4a63' ? '#3d4a63' : outfit, 1.25);
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.55, shoulderY - rx * 0.1);
    ctx.lineTo(cx, shoulderY + rx * 0.55);
    ctx.lineTo(cx + rx * 0.55, shoulderY - rx * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  // Ears, face.
  ctx.fillStyle = shade(skin, 0.95);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * rx * 0.98, cy + ry * 0.02, rx * 0.16, ry * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, rx * 0.2, cx, cy, ry * 1.1);
  g.addColorStop(0, shade(skin, 1.06));
  g.addColorStop(1, shade(skin, 0.9));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair on top.
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (hairStyle === 'short' || hairStyle === 'side') {
    ctx.ellipse(cx, cy - ry * 0.45, rx * 1.06, ry * 0.68, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.05, cy - ry * 0.4);
    ctx.quadraticCurveTo(cx - rx * 0.2, cy - ry * (hairStyle === 'side' ? 0.62 : 0.5), cx + rx * 1.05, cy - ry * (hairStyle === 'side' ? 0.3 : 0.4));
    ctx.lineTo(cx + rx * 1.05, cy - ry * 0.5);
    ctx.lineTo(cx - rx * 1.05, cy - ry * 0.5);
    ctx.fill();
  } else {
    ctx.ellipse(cx, cy - ry * 0.38, rx * 1.12, ry * 0.75, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - rx * 1.12, cy - ry * 0.4, rx * 0.28, ry * (hairStyle === 'bob' ? 0.95 : 0.7));
    ctx.fillRect(cx + rx * 0.84, cy - ry * 0.4, rx * 0.28, ry * (hairStyle === 'bob' ? 0.95 : 0.7));
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.0, cy - ry * 0.35);
    ctx.quadraticCurveTo(cx - rx * 0.1, cy - ry * 0.62, cx + rx * 1.0, cy - ry * 0.35);
    ctx.lineTo(cx + rx * 1.0, cy - ry * 0.5);
    ctx.lineTo(cx - rx * 1.0, cy - ry * 0.5);
    ctx.fill();
  }

  // Brows, eyes, nose, mouth.
  const ey = cy - ry * 0.08, gap = rx * 0.42;
  ctx.strokeStyle = shade(hair, 1.2);
  ctx.lineWidth = Math.max(1.5, rx * 0.07);
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * gap - rx * 0.2, ey - ry * 0.16);
    ctx.quadraticCurveTo(cx + s * gap, ey - ry * 0.22, cx + s * gap + rx * 0.2, ey - ry * 0.15);
    ctx.stroke();
    ctx.fillStyle = '#fbfaf7';
    ctx.beginPath();
    ctx.ellipse(cx + s * gap, ey, rx * 0.16, ry * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1c14';
    ctx.beginPath();
    ctx.arc(cx + s * gap, ey, rx * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx + s * gap - rx * 0.025, ey - rx * 0.025, rx * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  if (glasses) {
    ctx.strokeStyle = '#2b2b2f';
    ctx.lineWidth = Math.max(1.5, rx * 0.04);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * gap, ey, rx * 0.26, ry * 0.15, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - gap + rx * 0.26, ey);
    ctx.lineTo(cx + gap - rx * 0.26, ey);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(skin, 0.75);
  ctx.lineWidth = Math.max(1, rx * 0.04);
  ctx.beginPath();
  ctx.moveTo(cx, ey + ry * 0.05);
  ctx.quadraticCurveTo(cx - rx * 0.1, ey + ry * 0.3, cx + rx * 0.02, ey + ry * 0.33);
  ctx.stroke();
  ctx.strokeStyle = lips;
  ctx.lineWidth = Math.max(1.5, rx * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.28, ey + ry * 0.48);
  ctx.quadraticCurveTo(cx, ey + ry * 0.62, cx + rx * 0.28, ey + ry * 0.48);
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,110,100,0.12)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * rx * 0.55, ey + ry * 0.3, rx * 0.2, ry * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (fem && hairStyle === 'pony') {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx + rx * 1.05, cy - ry * 0.55, rx * 0.25, ry * 0.3, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const boxTop = ey - ry * 0.25, boxBottom = cy + ry;
  return {
    box: { x: (cx - rx) / W, y: boxTop / H, w: (2 * rx) / W, h: (boxBottom - boxTop) / H },
    leftEye: { x: (cx - gap) / W, y: ey / H },
    rightEye: { x: (cx + gap) / W, y: ey / H },
    source: 'sample' as const,
  };
}

function backdrop(ctx: CanvasRenderingContext2D, W: number, H: number, look: SampleLook) {
  const [c0, c1] = look === 'creative' ? ['#f2d7b6', '#c98e62'] : look === 'formal' ? ['#d9dde3', '#8c96a3'] : ['#9fb3c9', '#3f5671'];
  const g = ctx.createRadialGradient(W * 0.5, H * 0.38, W * 0.05, W * 0.5, H * 0.5, W * 0.85);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the sample portrait'))), 'image/jpeg', 0.9));
}

/** One studio portrait. Photographers' crops vary, so head size and position vary too. */
export async function drawSamplePortrait(index: number, fem: boolean, look: SampleLook): Promise<Drawn> {
  const r = rng(1000 + index * 7 + (look === 'formal' ? 1 : look === 'creative' ? 2 : 0));
  const W = 1200, H = 1500;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  backdrop(ctx, W, H, look);
  const scale = 0.82 + r() * 0.42; // tight and loose crops
  const rx = W * 0.15 * scale;
  const cx = W * (0.5 + (r() - 0.5) * 0.14);
  const cy = H * (0.4 + (r() - 0.5) * 0.12);
  const face = drawPerson(ctx, cx, cy, rx, fem, look, rng(5000 + index), W, H);
  return { blob: await toBlob(canvas), width: W, height: H, face };
}

/** The class photo: three rows, the adviser front and centre. The back row
 *  is shorter so the upper-right corner is clear for the class QR. */
export async function drawSampleGroup(count: number): Promise<{ blob: Blob; width: number; height: number; faces: FaceGeom[] }> {
  const W = 3000, H = 2000;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#c7d3df'); g.addColorStop(0.62, '#93a7bb'); g.addColorStop(0.62, '#7d6b58'); g.addColorStop(1, '#5c4e40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W * 0.06, H * 0.08, W * 0.6, H * 0.06); // a banner on the wall
  const faces: FaceGeom[] = [];
  const rows = [
    { n: Math.ceil(count * 0.36), y: 0.33, x0: 0.1, x1: 0.68, rx: 62 },
    { n: Math.ceil(count * 0.34), y: 0.5, x0: 0.07, x1: 0.93, rx: 66 },
  ];
  const front = count + 1 - rows[0].n - rows[1].n;
  rows.push({ n: Math.max(1, front), y: 0.68, x0: 0.09, x1: 0.91, rx: 70 });
  let k = 0;
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const cx = W * (row.x0 + (row.n === 1 ? 0.5 : i / (row.n - 1)) * (row.x1 - row.x0));
      const isAdviser = row === rows[2] && i === Math.floor(row.n / 2);
      faces.push(drawPerson(ctx, cx, H * row.y, row.rx, (k + i) % 2 === 0, isAdviser ? 'adviser' : 'toga', rng(9000 + k * 31 + i), W, H));
    }
    k += row.n;
  }
  return { blob: await toBlob(canvas), width: W, height: H, faces };
}
