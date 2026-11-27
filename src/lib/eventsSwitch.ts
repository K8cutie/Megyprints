/* ══════════════════════════════════════════════════════════════════════════
   MEGYPRINTS EVENTS, ON OR OFF (owner, 2026-11-16: "for now events is
   disabled as a feature until we work something out"; it may come back as a
   feature for affiliates such as event planners and travel agencies).

   Off:
     • the home page shows the Albums card only, and the menu and the footer
       have no Events link;
     • /events says Events is paused, and still shows a signed-in host the
       requests they already sent (to see where they are, or cancel one);
     • /events/book takes no new request (it opens /events).
   Nothing is deleted: the database, the admin Bookings tab, and the pages of
   an event that is already booked (the guest camera, the venue screen, the
   table cards, the album) keep working. Turning Events back on is this line.

   Its own module, with nothing else in it, so the menu and the footer can
   read it without loading the Events code.
   ══════════════════════════════════════════════════════════════════════════ */
export const EVENTS_ON = false;

/** What /events says while Events is off. */
export const EVENTS_PAUSED = {
  title: 'Megyprints Events is paused for now',
  body: 'We’re reworking how events are booked, so we’re not taking new event bookings at the moment. You can still turn your own photos into a printed album.',
  cta: 'Make your album',
} as const;
