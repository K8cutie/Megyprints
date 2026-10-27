import type { SampleAlbumNote } from '../../lib/samplePhotos';
import { splitBold } from '../../assistant/boldText';

/* A sample album's card over a page (lib/samplePhotos): "Welcome to the Megy
   Prints app test!" on page 1, "You're done with today's test!" on the last
   page in Preview. Drawn OVER the page on screen, low on it (faces are mostly
   higher up), just above the tester stamp, sized to the page, like the stamp:
   taps go through it and the print pipeline never sees it. */
export default function TesterPageNote({ note, pageW }: {
  note: SampleAlbumNote;
  /** The page's width on screen, in px. */
  pageW: number;
}) {
  const font = Math.max(11, Math.min(17, Math.round(pageW * 0.042)));
  const inset = Math.max(8, Math.round(pageW * 0.05));
  // Above the tester stamp in the bottom corner (about 11% of the page).
  const bottom = Math.max(inset * 3, Math.round(pageW * 0.15));
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
        padding: `${Math.round(font * 0.75)}px ${Math.round(font * 0.9)}px`,
        borderRadius: Math.round(font * 0.8),
        background: 'rgba(255, 255, 255, 0.94)',
        boxShadow: '0 4px 18px rgba(42, 33, 28, 0.18)',
        color: '#2A211C',
        fontSize: font,
        lineHeight: 1.35,
        textAlign: 'center',
      }}
    >
      <div style={{ fontWeight: 700, color: '#B85C38', fontSize: Math.round(font * 1.12) }} data-testid="tester-page-note-title">{note.title}</div>
      <div style={{ marginTop: Math.round(font * 0.35) }} data-testid="tester-page-note-body">
        {splitBold(note.body).map((run, i) => (run.bold ? <strong key={i}>{run.text}</strong> : <span key={i}>{run.text}</span>))}
      </div>
    </div>
  );
}
