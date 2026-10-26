import { isNativeShell } from '../lib/nativeAuth';

/* The Android app's photo step: how to pick MANY photos (tester, 2026-10-27:
   "I can't send more than 1 photo"). The app opens Android's Files picker
   (MegyWebChromeClient: no ~100-photo cap), where one tap picks one photo
   and closes it; many takes a press and hold, or ⋮ → Select all in a
   folder. The old tip said so in small grey type at the foot of the card.
   Phone browsers get Google's photo picker, where tapping picks many, so
   this shows in the app only. */
export default function PickManyHint() {
  if (!isNativeShell()) return null;
  return (
    <div className="mt-3 p-3 rounded-xl bg-blush border border-peach/30" data-testid="pick-many-hint">
      <p className="text-sm text-cocoa leading-relaxed">
        <b>To pick many photos at once:</b> press and hold the first photo, then tap the others.
        Or open a folder, tap <b>⋮</b> and choose <b>Select all</b>.
      </p>
    </div>
  );
}
