/* ══════════════════════════════════════════════════════════════════════════
   PageTurnLayer — draws one page turn over the preview's book (pageTurn.ts
   says what turns). The leaf is hinged at the spine and turns in 3D; it
   darkens as it stands up, and throws a shadow on the page it uncovers. The
   old page on the side the leaf hasn't reached yet stays on show (`patch`)
   until the leaf lands on it. Nothing here can take a tap.
   ══════════════════════════════════════════════════════════════════════════ */

import type { CSSProperties, ReactNode } from 'react';
import { BOOK } from './bookFeel';
import type { TurnFace, TurnPlan } from './pageTurn';

const EASE = 'cubic-bezier(.45,.05,.25,1)';
const KEYFRAMES = '@keyframes megy-leaf-shade { 0% { opacity: 0 } 50% { opacity: 1 } 100% { opacity: 0 } }';

export default function PageTurnLayer({ plan, go, W, H, spineX, face }: {
  plan: TurnPlan;
  /** False for the first frame (the leaf laid down at its start), then true. */
  go: boolean;
  /** One page's size on screen. */
  W: number;
  H: number;
  /** Where the spine is, from the layer's left edge. */
  spineX: number;
  /** Draws a page, the cover or a blank page at W × H. */
  face: (f: TurnFace) => ReactNode;
}) {
  const { leaf, patch, cast, ms } = plan;
  const fade: CSSProperties = go ? { animation: `megy-leaf-shade ${ms}ms ease-in-out` } : { opacity: 0 };
  const sideLeft = (side: 'left' | 'right') => (side === 'left' ? spineX - W : spineX);
  // Each face is its own plane (a transform + isolation), so everything on it,
  // grain and gutter included, hides with it once it faces away.
  const faceBox: CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', background: '#FFFFFF', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', isolation: 'isolate', transform: 'rotateY(0deg)' };
  return (
    <div
      aria-hidden="true"
      data-testid="preview-page-turn"
      data-turn-layout={plan.layout}
      style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none', perspective: Math.round(W * 6), perspectiveOrigin: `${spineX}px 50%` }}
    >
      <style>{KEYFRAMES}</style>
      {patch && (
        // Its own layer (isolation), so the photos and captions on it can never
        // stack above the leaf that lands on it.
        <div style={{ position: 'absolute', top: 0, left: sideLeft(patch.side), width: W, height: H, overflow: 'hidden', background: '#FFFFFF', isolation: 'isolate' }} data-turn-part="patch">
          {face(patch.face)}
          <div style={BOOK.grain} />
          <div style={BOOK.spine(patch.side === 'left' ? 'right' : 'left')} />
        </div>
      )}
      {cast && (
        <div
          data-turn-part="cast"
          style={{
            position: 'absolute', top: 0, left: sideLeft(cast), width: W, height: H,
            background: `linear-gradient(to ${cast === 'left' ? 'left' : 'right'}, rgba(45,28,16,0.30), rgba(45,28,16,0.08) 30%, rgba(45,28,16,0) 55%)`,
            ...fade,
          }}
        />
      )}
      <div
        data-turn-part="leaf"
        data-turn-angle={go ? leaf.to : leaf.from}
        style={{
          position: 'absolute', top: 0, left: spineX, width: W, height: H,
          transformOrigin: 'left center', transformStyle: 'preserve-3d',
          transform: `rotateY(${go ? leaf.to : leaf.from}deg)`,
          transition: go ? `transform ${ms}ms ${EASE}` : 'none',
        }}
      >
        <div style={faceBox}>
          {face(leaf.front)}
          <div style={BOOK.grain} />
          <div style={BOOK.spine('left')} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to left, rgba(0,0,0,0.26), rgba(0,0,0,0.05) 55%, rgba(0,0,0,0))', zIndex: 43, ...fade }} />
        </div>
        {leaf.back && (
          <div style={{ ...faceBox, transform: 'rotateY(180deg)' }}>
            {face(leaf.back)}
            <div style={BOOK.grain} />
            <div style={BOOK.spine('right')} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.26), rgba(0,0,0,0.05) 55%, rgba(0,0,0,0))', zIndex: 43, ...fade }} />
          </div>
        )}
      </div>
    </div>
  );
}
