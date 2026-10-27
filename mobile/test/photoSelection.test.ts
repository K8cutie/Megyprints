import {
  allPicked,
  countSelected,
  everythingSelected,
  groupState,
  isSelected,
  keepOnly,
  nothingSelected,
  photosToAdd,
  selectedIds,
  setMany,
  toggle,
} from '../src/lib/photoSelection';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('picking photos in the grid', () => {
  it('tap picks a photo, a second tap un-picks it', () => {
    let s = nothingSelected();
    s = toggle(s, 'b');
    expect(isSelected(s, 'b')).toBe(true);
    expect(countSelected(s, ids)).toBe(1);
    s = toggle(s, 'b');
    expect(isSelected(s, 'b')).toBe(false);
    expect(countSelected(s, ids)).toBe(0);
  });

  it('never changes the selection it was given (React sees a new one)', () => {
    const s = nothingSelected();
    const t = toggle(s, 'a');
    expect(t).not.toBe(s);
    expect(isSelected(s, 'a')).toBe(false);
  });

  it('a day\'s "Select" picks the whole day, "Unselect" drops it, other photos stay', () => {
    let s = toggle(nothingSelected(), 'e');
    s = setMany(s, ['a', 'b', 'c'], true);
    expect(selectedIds(s, ids)).toEqual(['a', 'b', 'c', 'e']);
    expect(groupState(s, ['a', 'b', 'c'])).toBe('all');
    s = toggle(s, 'b');
    expect(groupState(s, ['a', 'b', 'c'])).toBe('some');
    s = setMany(s, ['a', 'b', 'c'], false);
    expect(groupState(s, ['a', 'b', 'c'])).toBe('none');
    expect(selectedIds(s, ids)).toEqual(['e']);
  });

  it('"Select all" picks everything, including photos that load later', () => {
    let s = everythingSelected();
    expect(countSelected(s, ids)).toBe(5);
    expect(allPicked(s, ids)).toBe(true);
    // More photos arrive while the grid is still loading: they are picked too.
    const more = [...ids, 'f', 'g'];
    expect(countSelected(s, more)).toBe(7);
    // Tapping one off after Select all.
    s = toggle(s, 'c');
    expect(isSelected(s, 'c')).toBe(false);
    expect(countSelected(s, more)).toBe(6);
    expect(allPicked(s, more)).toBe(false);
    expect(selectedIds(s, more)).toEqual(['a', 'b', 'd', 'e', 'f', 'g']);
    s = setMany(s, ['c'], true);
    expect(allPicked(s, more)).toBe(true);
  });

  it('photos already in the album are never picked, by tap, day or Select all', () => {
    const blocked = new Set(['b', 'd']);
    let s = toggle(nothingSelected(), 'b', blocked);
    expect(countSelected(s, ids, blocked)).toBe(0);
    s = setMany(s, ids, true, blocked);
    expect(selectedIds(s, ids, blocked)).toEqual(['a', 'c', 'e']);
    const all = everythingSelected();
    expect(countSelected(all, ids, blocked)).toBe(3);
    expect(selectedIds(all, ids, blocked)).toEqual(['a', 'c', 'e']);
    expect(allPicked(all, ids, blocked)).toBe(true);
    // A day that is all in the album has nothing to pick.
    expect(groupState(all, ['b', 'd'], blocked)).toBe('none');
    expect(allPicked(nothingSelected(), ['b', 'd'], blocked)).toBe(false);
  });

  it('a photo that left the phone leaves the selection (the count stays honest)', () => {
    const s = setMany(nothingSelected(), ['a', 'b', 'c'], true);
    const present = new Set(['a', 'c', 'd']);
    const kept = keepOnly(s, present);
    expect(countSelected(kept, [...present])).toBe(2);
    expect(keepOnly(kept, present)).toBe(kept); // nothing more to drop: same object
    const all = toggle(everythingSelected(), 'b');
    expect(keepOnly(all, present)).toEqual({ mode: 'all', except: new Set() });
  });

  it('stays fast with 20,000 photos', () => {
    const many = Array.from({ length: 20_000 }, (_, i) => `content://media/external/images/media/${i}`);
    const blocked = new Set(many.slice(0, 500));
    const t0 = Date.now();
    let s = everythingSelected();
    for (let i = 600; i < 700; i++) s = toggle(s, many[i], blocked);
    const n = countSelected(s, many, blocked);
    const picked = selectedIds(s, many, blocked);
    const day = setMany(nothingSelected(), many.slice(1000, 1400), true, blocked);
    expect(n).toBe(20_000 - 500 - 100);
    expect(picked).toHaveLength(n);
    expect(countSelected(day, many, blocked)).toBe(400);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('"Add" after Select all, while photos are still loading', () => {
  const phone = Array.from({ length: 2517 }, (_, i) => ({ id: `content://media/external/images/media/${i + 1}` }));
  const firstPage = phone.slice(0, 120);
  const none = () => new Set<string>();

  it('adds every photo on the phone, not only the ones loaded when Add was tapped', async () => {
    let finish: (list: typeof phone) => void = () => {};
    const loading = new Promise<typeof phone>((r) => { finish = r; });
    const result = photosToAdd(everythingSelected(), firstPage, () => loading, none);
    finish(phone); // the other pages arrive after the tap
    const added = await result;
    expect(added).toHaveLength(2517);
    expect(added[2516].id).toBe(phone[2516].id);
  });

  it('still leaves out the photos tapped off, and the ones already in the album', async () => {
    const sel = setMany(everythingSelected(), [phone[0].id, phone[5].id], false);
    const inAlbum = (list: readonly string[]) => new Set(list.filter((id) => id.endsWith('/2000') || id.endsWith('/2001')));
    const added = await photosToAdd(sel, firstPage, async () => phone, inAlbum);
    expect(added).toHaveLength(2517 - 4);
    expect(added.map((p) => p.id)).not.toContain(phone[1999].id);
  });

  it('picked one by one: adds exactly those, without waiting for loading', async () => {
    const sel = setMany(nothingSelected(), [phone[3].id, phone[7].id], true);
    const never = () => new Promise<typeof phone>(() => {});
    expect((await photosToAdd(sel, firstPage, never, none)).map((p) => p.id)).toEqual([phone[3].id, phone[7].id]);
  });
});
