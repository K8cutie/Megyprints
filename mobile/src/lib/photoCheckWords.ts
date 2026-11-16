/* The words of Megy's photo check on the Photos step: the website's own
   (src/assistant/PhotoCheckCard.tsx), held to them by
   test/photoCheckCard.test.tsx. */

export const CHECK_RUNNING = 'Megy is checking your photos for blur and repeats…';
/** "12 of 52", after CHECK_RUNNING. */
export const checkCount = (done: number, total: number) => `${done} of ${total}`;

export const CHECK_CLEAR = 'Megy checked your photos: all sharp, no repeats.';

/** "Megy found 2 blurry and 3 repeat shots". */
export function foundLine(blurry: number, repeats: number): string {
  const parts = [blurry ? `${blurry} blurry` : '', repeats ? `${repeats} repeat` : ''].filter(Boolean).join(' and ');
  return `Megy found ${parts} shot${blurry + repeats === 1 ? '' : 's'}`;
}

export const LEAVE_OUT_ASK = 'Leave them out? You can bring them back any time. Tap a photo to keep it.';
export const WHY_BLURRY = 'Blurry';
export const WHY_REPEAT = 'Repeat';
export const LEAVE_THEM_OUT = 'Leave them out';
export const KEEP_ALL = 'Keep all';

/** "3 photos left out", before BRING_BACK. */
export const leftOutLine = (n: number) => `${n} photo${n === 1 ? '' : 's'} left out`;
export const BRING_BACK = 'Bring them back';
