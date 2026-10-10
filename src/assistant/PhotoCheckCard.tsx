/* ══════════════════════════════════════════════════════════════════════════
   PhotoCheckCard — Megy's free photo check on the upload step (owner,
   2026-10-04: "Suggest, one tap"). Megy shows the blurry shots and the
   repeats it found; one tap leaves them all out, one tap keeps everything,
   and tapping a single photo keeps just that one. Left-out photos can be
   brought back any time. The check runs on the phone (lib/photoCheck): no
   upload, no AI bill.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import type { UploadedPhoto } from '../pages/builder/types';
import type { LeaveOutSuggestion } from '../lib/photoCheck';

const SHOW_MAX = 12;
const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E8C98A] text-[#8A5A12] hover:bg-[#FFF0D1] transition-colors';

export default function PhotoCheckCard({ photos, check, onLeaveOut, onKeep, onBringBack }: {
  photos: UploadedPhoto[];
  check: { ready: boolean; progress: { done: number; total: number }; suggestion: LeaveOutSuggestion };
  onLeaveOut: (ids: string[]) => void;
  onKeep: (ids: string[]) => void;
  onBringBack: () => void;
}) {
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const leftOut = photos.filter((p) => p.leftOut).length;
  const { blurry, repeats } = check.suggestion;
  const flagged = [...blurry.map((id) => ({ id, why: 'Blurry' })), ...repeats.map((id) => ({ id, why: 'Repeat' }))]
    .filter((f) => byId.has(f.id));

  if (!check.ready) {
    const { done, total } = check.progress;
    return (
      <div className="mb-3" data-testid="photo-check-running">
        <p className="text-xs text-ink-mid">🔎 Megy is checking your photos for blur and repeats… <b>{done}</b> of {total}</p>
        <div className="mt-1.5 h-1 rounded-full bg-line overflow-hidden">
          <div className="h-full bg-peach transition-all" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
      </div>
    );
  }

  const bringBack = leftOut > 0 && (
    <p className="text-xs text-ink-mid mt-2">
      {leftOut} photo{leftOut === 1 ? '' : 's'} left out ·{' '}
      <button type="button" onClick={onBringBack} className="font-semibold text-[#C56B4E] underline" data-testid="photo-check-bring-back">Bring them back</button>
    </p>
  );

  if (flagged.length === 0) {
    return (
      <div className="mb-3" data-testid="photo-check-clear">
        {leftOut === 0 && <p className="text-xs text-success">✓ Megy checked your photos: all sharp, no repeats.</p>}
        {bringBack}
      </div>
    );
  }

  const parts = [
    blurry.length ? `${blurry.length} blurry` : '',
    repeats.length ? `${repeats.length} repeat` : '',
  ].filter(Boolean).join(' and ');
  return (
    <div className="mb-3 p-3 rounded-xl bg-[#FFF6E5] border border-[#F0D9A8]" data-testid="photo-check-suggest">
      <p className="text-sm font-semibold text-[#8A5A12]">Megy found {parts} shot{flagged.length === 1 ? '' : 's'}</p>
      <p className="text-xs text-[#8A5A12] mt-0.5">Leave them out? You can bring them back any time. Tap a photo to keep it.</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {flagged.slice(0, SHOW_MAX).map(({ id, why }) => {
          const p = byId.get(id)!;
          return (
            <button
              key={id} type="button" onClick={() => onKeep([id])} title={`Keep ${p.name}`}
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#E8C98A] bg-white"
              data-testid="photo-check-thumb"
            >
              {p.previewUrl && <img src={p.previewUrl} alt={p.name} draggable={false} className="w-full h-full object-cover" />}
              <span className="absolute bottom-0 inset-x-0 text-[9px] font-semibold text-white bg-black/55 leading-4">{why}</span>
            </button>
          );
        })}
        {flagged.length > SHOW_MAX && (
          <span className="w-14 h-14 rounded-lg border border-dashed border-[#E8C98A] text-[11px] text-[#8A5A12] flex items-center justify-center">+{flagged.length - SHOW_MAX}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-2.5">
        <button type="button" className={btn} onClick={() => onLeaveOut(flagged.map((f) => f.id))} data-testid="photo-check-leave-out">Leave them out</button>
        <button type="button" className={btn} onClick={() => onKeep(flagged.map((f) => f.id))} data-testid="photo-check-keep-all">Keep all</button>
      </div>
      {bringBack}
    </div>
  );
}
