import { Star } from 'lucide-react';
import { PLAY_LISTING_URL, showPlayFeedback } from '../lib/playFeedback';

/* ══════════════════════════════════════════════════════════════════════════
   LEAVE FEEDBACK ON GOOGLE PLAY — testing phase, Android app only (owner,
   2026-10-28: "as long as it leads testers where to find the feedback area").
   Google turned down production partly for not "gathering and acting on user
   feedback"; a tester's Play page has "Private feedback to developer" (only
   the owner sees it, Play Console → Ratings and reviews → Testing feedback),
   but nobody could find that page. Google has no link straight to the stars,
   so the button opens the app's Play page and three steps say where to go.

   Shown where a tester has just finished something: under the sample album's
   "You're done with today's test!" page (BuilderPreview) and under a test
   order's thank-you (Order). In the app a link to another site leaves the
   WebView: Capacitor hands it to Android (Bridge.launchIntent, ACTION_VIEW),
   which opens play.google.com links in the Play Store app.
   ══════════════════════════════════════════════════════════════════════════ */

export default function PlayFeedbackCard() {
  if (!showPlayFeedback()) return null;
  return (
    <div className="rounded-xl border border-peach/30 bg-blush p-3 text-left" data-testid="play-feedback">
      <a href={PLAY_LISTING_URL} data-testid="play-feedback-open"
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-peach py-2.5 text-sm font-semibold text-white hover:brightness-105">
        <Star size={16} className="shrink-0" /> Leave feedback on Google Play
      </a>
      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-cocoa" data-testid="play-feedback-steps">
        <li>Tap the button. Megy Prints opens on Google Play.</li>
        <li>Scroll down to <b>Private feedback to developer</b>.</li>
        <li>Tap the stars, then <b>Write feedback</b>. Only we can see it.</li>
      </ol>
    </div>
  );
}
