/* Megyprints Events are booked and run on the website (its /events page and
   the event pages; guests take part by scanning the event's QR). The app's
   start screen opens that page (test/eventsLink.test.tsx). */
import { sitePage } from './checkout/site';

/** The website's name for it (src/pages/homeCopy.ts EVENTS_CARD.label, its menu). */
export const EVENTS_LABEL = 'Megyprints Events';
/** The website's Events page (its hash route /events). */
export const EVENTS_PAGE = sitePage('events');
