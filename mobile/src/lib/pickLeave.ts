/* ══════════════════════════════════════════════════════════════════════════
   BACK NEVER DROPS PICKED PHOTOS WITHOUT ASKING (beta testers 2026-11-04,
   Carlo: 50 photos picked by hand, one Back by habit, "Your photos: 0", and
   every pick had to be made again).

   Back (the phone's, or the arrow) with photos picked but not yet added
   asks first: "Add the 50 photos you picked?", with Leave them out and
   Add 50 photos. Tapping outside the question stays in the picker, the
   photos still picked. Nothing picked: Back just goes back.
   ══════════════════════════════════════════════════════════════════════════ */
import { Alert, type AlertButton } from 'react-native';
import { photoWord } from '@web/pages/builder/albumMinimum';
import { formatCount } from './photoDays';

export const LEAVE_THEM_OUT = 'Leave them out';

/** The picker's filled button, and the question's Add. */
export function addPhotosLabel(n: number): string {
  return `Add ${formatCount(n)} ${photoWord(n)}`;
}

export function leavePicksTitle(n: number): string {
  return `Add the ${formatCount(n)} ${photoWord(n)} you picked?`;
}

type Ask = (title: string, message: string | undefined, buttons: AlertButton[], options: { cancelable: boolean }) => void;

/** Back was pressed in the picker. True when it asked (Back held until an
 *  answer); false when nothing is picked and Back may go back. */
export function askBeforeLeavingPicks(picked: number, then: { leave: () => void; add: () => void }, ask: Ask = Alert.alert): boolean {
  if (picked <= 0) return false;
  ask(leavePicksTitle(picked), undefined, [
    { text: LEAVE_THEM_OUT, onPress: then.leave },
    { text: addPhotosLabel(picked), onPress: then.add },
  ], { cancelable: true });
  return true;
}
