/* ══════════════════════════════════════════════════════════════════════════
   ResizeAlbumAsk — "Change to 6×8?" when a new album size would take video
   memories off. A memory is the customer's video and its printed QR; a size
   change dropped every one without a word (2026-10-08). Now they come along,
   each on its own photo as a full page, and this asks only about the ones
   whose photos can't fill a page of the new shape. Keeping the size is the
   way on; changing without them is a choice, and says how many.
   Opened by any size tap (actionEngine change_size), so it lives in Builder.
   ══════════════════════════════════════════════════════════════════════════ */

import { X } from 'lucide-react';
import { useModalDialog } from '../lib/useModalDialog';
import { resizeMemoriesLine } from './rebuildQuestion';
import type { AlbumSizePreset } from '../pages/builder/types';
import type { ResizeAsk } from '../pages/builder/useBuilderState';

const label = (s: string) => s.replace('x', '×');

export default function ResizeAlbumAsk({ ask, from, onKeep, onChange }: {
  ask: ResizeAsk;
  /** The album's size now. */
  from: AlbumSizePreset;
  onKeep: () => void;
  onChange: () => void;
}) {
  // Keyboard (KB-2): focus on "Keep", Tab kept inside, Escape keeps.
  const panelRef = useModalDialog<HTMLDivElement>(true, onKeep);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-4" onClick={onKeep} data-testid="resize-ask">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="resize-ask-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <button onClick={onKeep} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-light hover:text-medium hover:bg-line-soft transition-colors">
          <X size={16} />
        </button>
        <h2 id="resize-ask-title" className="font-display text-xl font-semibold text-dark mb-2">Change to {label(ask.size)}?</h2>
        {ask.reason === 'size_hidden' && (
          <p className="text-sm text-medium mb-2" data-testid="resize-ask-why">{label(from)} albums aren't offered any more.</p>
        )}
        <p className="text-sm text-medium mb-5" data-testid="resize-ask-loses">
          {resizeMemoriesLine(ask.memories, ask.lost, ask.size)} Every page is laid out again for the new shape.
        </p>
        <div className="space-y-2">
          <button onClick={onKeep} data-testid="resize-keep" data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            Keep {label(from)}
          </button>
          <button onClick={onChange} data-testid="resize-confirm"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors">
            Change to {label(ask.size)} without {ask.lost === 1 ? 'it' : 'them'}
          </button>
        </div>
      </div>
    </div>
  );
}
