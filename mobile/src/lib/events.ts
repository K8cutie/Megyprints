/* Megyprints Events are booked and run on the website (its /events page and
   the event pages; guests take part by scanning the event's QR). The app's
   start screen opens that page (test/eventsLink.test.tsx). */
import { sitePage } from './checkout/site';

/** Events on or off, the website's switch (src/lib/eventsSwitch.ts). Owner,
 *  2026-11-16: "for now events is disabled as a feature until we work
 *  something out" (it may come back for affiliates such as event planners
 *  and travel agencies). Off: the start screen has no Events card and the
 *  menu no Events link. Nothing is deleted: checkout still takes an event's
 *  album for a booking that is already booked, as the website does.
 *  Turning Events back on is this line. */
export const EVENTS_ON = false;

/** The website's name for it (src/pages/homeCopy.ts EVENTS_CARD.label, its menu). */
export const EVENTS_LABEL = 'Megyprints Events';
/** The website's Events page (its hash route /events). */
export const EVENTS_PAGE = sitePage('events');
