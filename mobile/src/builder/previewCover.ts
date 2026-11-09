/* THE PREVIEW OPENS ON THE ALBUM'S COVER (owner, 2026-11-04: "the beginning of
   preview my album is the last page shouldn't it be the first page").

   The Preview shows the builder's current page, the one last seen or edited,
   and it stays alive under the editor and the steps. So "Done — Preview my
   album", on the album's last page, came back on the last page. Whoever sends
   the customer to look at their album asks here, and the Preview answers the
   next time it comes on top (app/preview.tsx).

   "Back to preview" doesn't ask: it goes back to the page being worked on. */
let asked = false;

export function askPreviewAtCover(): void {
  asked = true;
}

/** Was it asked? Once: the next time the Preview comes on top it stays put. */
export function takePreviewAtCover(): boolean {
  const was = asked;
  asked = false;
  return was;
}
