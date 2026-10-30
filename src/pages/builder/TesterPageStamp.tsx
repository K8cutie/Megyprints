/* Drawn OVER a page on screen (testingPhase), in its bottom corner away from
   the binding, sized to the page. Taps go through it. It is never part of the
   album: the print pipeline draws pages itself and never sees this. */
export default function TesterPageStamp({ lines, side, pageW }: {
  lines: readonly [string, string];
  /** The page's outer edge: the corner away from the binding. */
  side: 'left' | 'right';
  /** The page's width on screen, in px. */
  pageW: number;
}) {
  const font = Math.max(8, Math.min(12, Math.round(pageW * 0.03)));
  const inset = Math.max(4, Math.round(pageW * 0.025));
  return (
    <div
      aria-hidden="true"
      data-testid="tester-page-stamp"
      data-side={side}
      className="font-sans print:hidden"
      style={{
        position: 'absolute',
        bottom: inset,
        [side]: inset,
        zIndex: 50,
        pointerEvents: 'none',
        userSelect: 'none',
        padding: `${Math.round(font * 0.25)}px ${Math.round(font * 0.6)}px`,
        borderRadius: Math.round(font * 0.5),
        background: 'rgba(255, 255, 255, 0.72)',
        color: 'rgba(42, 33, 28, 0.9)',
        fontSize: font,
        lineHeight: 1.25,
        textAlign: side,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={{ fontWeight: 600 }}>{lines[0]}</div>
      <div>{lines[1]}</div>
    </div>
  );
}
