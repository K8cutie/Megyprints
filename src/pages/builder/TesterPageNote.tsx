import type { SampleAlbumNote } from '../../lib/samplePhotos';
import { splitBold } from '../../assistant/boldText';

/* A sample album's card over a page (lib/samplePhotos): "Welcome to the Megy
   Prints app!" on page 1, "You finished today's lesson!" on the last page in
   Preview (2026-10-29: the daily test reads as a daily lesson). Drawn OVER the page on screen, low on it (faces are mostly
   higher up), just above the tester stamp, sized to the page, like the stamp:
   taps go through it and the print pipeline never sees it.

   On "You finished today's lesson!", after Today's lesson (lib/dailyTest),
   one more short line names both of today's tasks, so the screenshot proves
   them ("Today you tried: title font Dancing Script · new layout on page 5"), with a swatch or a small
   picture when the answer is a colour or a photo. Smaller words than the
   rest of the card, so it adds as little height as it can.

   2026-10-29, the daily lesson: the line got longer ("Today you tried: "),
   so it wraps to two lines more often. The card's spacing is tighter, so
   even then it is no taller than #229's card (measured on the walk: the
   faces under it are covered no more than before). */
export default function TesterPageNote({ note, pageW }: {
  note: SampleAlbumNote;
  /** The page's width on screen, in px. */
  pageW: number;
}) {
  const font = Math.max(11, Math.min(17, Math.round(pageW * 0.042)));
  const inset = Math.max(8, Math.round(pageW * 0.05));
  // Above the tester stamp in the bottom corner (about 11% of the page).
  const bottom = Math.max(inset * 3, Math.round(pageW * 0.15));
  const proof = note.proof;
  const small = Math.max(10, Math.round(font * 0.86));
  const icon = Math.round(small * 1.45);
  return (
    <div
      role="note"
      data-testid="tester-page-note"
      className="font-sans print:hidden"
      style={{
        position: 'absolute',
        bottom,
        left: inset,
        right: inset,
        zIndex: 50,
        pointerEvents: 'none',
        userSelect: 'none',
        padding: `${Math.round(font * 0.55)}px ${Math.round(font * 0.9)}px`,
        borderRadius: Math.round(font * 0.8),
        background: 'rgba(255, 255, 255, 0.94)',
        boxShadow: '0 4px 18px rgba(42, 33, 28, 0.18)',
        color: '#2A211C',
        fontSize: font,
        lineHeight: 1.25,
        textAlign: 'center',
      }}
    >
      <div style={{ fontWeight: 700, color: '#B85C38', fontSize: Math.round(font * 1.12), lineHeight: 1.2 }} data-testid="tester-page-note-title">{note.title}</div>
      <div style={{ marginTop: Math.round(font * 0.15) }} data-testid="tester-page-note-body">
        {splitBold(note.body).map((run, i) => (run.bold ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>))}
      </div>
      {proof && (
        <div data-testid="tester-page-note-proof"
          style={{
            marginTop: Math.round(font * 0.3), display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: Math.round(small * 0.4), fontSize: small, lineHeight: 1.15, fontWeight: 600, color: '#5C4033',
          }}>
          {proof.hex && (
            <span data-testid="tester-page-note-swatch" aria-hidden="true"
              style={{ width: icon, height: icon, borderRadius: '50%', background: proof.hex, border: '1px solid rgba(42, 33, 28, 0.25)', flexShrink: 0 }} />
          )}
          {proof.photo && (
            <img data-testid="tester-page-note-photo" src={proof.photo} alt=""
              style={{ width: icon, height: icon, borderRadius: Math.round(icon * 0.2), objectFit: 'cover', border: '1px solid rgba(42, 33, 28, 0.25)', flexShrink: 0 }} />
          )}
          <span data-testid="tester-page-note-proof-text">{proof.text}</span>
        </div>
      )}
    </div>
  );
}
