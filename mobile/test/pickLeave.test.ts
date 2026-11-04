/* Back in the photo picker never drops picked photos without asking (beta
   testers 2026-11-04, Carlo: 50 photos picked by hand, one Back, "Your
   photos: 0", every pick gone, no question). */
import fs from 'node:fs';
import path from 'node:path';
import type { AlertButton } from 'react-native';
import { addPhotosLabel, askBeforeLeavingPicks, LEAVE_THEM_OUT, leavePicksTitle } from '../src/lib/pickLeave';

type Asked = { title: string; message: string | undefined; buttons: AlertButton[]; options: { cancelable: boolean } };
function asker() {
  const asked: Asked[] = [];
  const ask = (title: string, message: string | undefined, buttons: AlertButton[], options: { cancelable: boolean }) => { asked.push({ title, message, buttons, options }); };
  return { asked, ask };
}

describe('Back with photos picked', () => {
  it('asks, in plain words, with the count: leave them out, or add them', () => {
    const { asked, ask } = asker();
    const leave = jest.fn();
    const add = jest.fn();
    expect(askBeforeLeavingPicks(50, { leave, add }, ask)).toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0].title).toBe('Add the 50 photos you picked?');
    // A line under the title, never none: Android draws an empty message as a
    // blank gap (beta round 2, Mother: 126 px of white between title and buttons).
    expect(asked[0].message).toBe('They are not in your album yet.');
    expect(asked[0].buttons.map((b) => b.text)).toEqual(['Leave them out', 'Add 50 photos']);
    // Tapping outside the question (or Back on it) stays in the picker, picks kept.
    expect(asked[0].options.cancelable).toBe(true);
    expect(leave).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    asked[0].buttons[0].onPress!();
    expect(leave).toHaveBeenCalledTimes(1);
    asked[0].buttons[1].onPress!();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('one photo, and big counts, read right', () => {
    expect(leavePicksTitle(1)).toBe('Add the 1 photo you picked?');
    expect(addPhotosLabel(1)).toBe('Add 1 photo');
    expect(leavePicksTitle(1250)).toBe('Add the 1,250 photos you picked?');
    expect(addPhotosLabel(1250)).toBe('Add 1,250 photos');
    expect(LEAVE_THEM_OUT).toBe('Leave them out');
  });

  it('nothing picked: Back just goes back, nothing asked', () => {
    const { asked, ask } = asker();
    expect(askBeforeLeavingPicks(0, { leave: jest.fn(), add: jest.fn() }, ask)).toBe(false);
    expect(asked).toHaveLength(0);
  });

  it('the picker asks on any way back (the phone\'s Back and the arrow), never while adding, and its Add button uses the same words', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '../src/app/pick-photos.tsx'), 'utf8');
    expect(SRC).toContain('const allowLeave = usePreventRemove(picked > 0 && !adding, ({ repeat }) => {');
    expect(SRC).toContain('askBeforeLeavingPicks(picked, { leave: repeat, add: () => { void addPicked(); } });');
    // Adding (or Files adding) goes back on its own: the question is not asked then.
    expect(SRC.match(/allowLeave\(\);\n\s*goBack\(\);/g)?.length).toBe(1);
    expect(SRC).toContain('if (result.added) { allowLeave(); goBack(); }');
    expect(SRC).toContain('label={addPhotosLabel(picked)}');
  });
});
