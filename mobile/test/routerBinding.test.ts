/* After Android rebuilds the screen, a new root starts before the old one
   stops, and the old root's cleanup unbinds expo-router's shared router.
   The app's shared router reads from the newest root still mounted
   (src/lib/routerBinding.ts), whatever order they come and go in. */
import { guardSharedRouter, resetRoots, rootMounted, rootUnmounted } from '../src/lib/routerBinding';

const thrower = () => { throw new Error('The imperative router is unavailable before the first render has finished.'); };
const unbound = { push: thrower, back: thrower };

describe('the shared router after the screen is rebuilt', () => {
  beforeEach(() => resetRoots());

  it('new root binds, then the old root goes and unbinds: the shared router still goes to the new root', () => {
    const shared = { ...unbound } as { push: () => string; back: () => string };
    const oldRoot = { push: () => 'old', back: () => 'old back' };
    const newRoot = { push: () => 'new', back: () => 'new back' };
    guardSharedRouter(shared);
    rootMounted(oldRoot); Object.assign(shared, oldRoot); // first launch
    expect(shared.push()).toBe('old');
    rootMounted(newRoot); Object.assign(shared, newRoot); // the new root binds first…
    Object.assign(shared, unbound); rootUnmounted(oldRoot); // …then the old root unbinds and goes
    expect(shared.push()).toBe('new'); // before: threw, and the app closed
    expect(shared.back()).toBe('new back');
  });

  it('the other order (old goes first, then the new one comes) works too', () => {
    const shared = { ...unbound } as { push: () => string; back: () => string };
    const oldRoot = { push: () => 'old', back: () => 'old back' };
    const newRoot = { push: () => 'new', back: () => 'new back' };
    guardSharedRouter(shared);
    rootMounted(oldRoot); Object.assign(shared, oldRoot);
    Object.assign(shared, unbound); rootUnmounted(oldRoot);
    rootMounted(newRoot); Object.assign(shared, newRoot);
    expect(shared.push()).toBe('new');
  });

  it('with no root mounted (before the first render) it is expo-router\'s own', () => {
    const shared = { ...unbound } as { push: () => string; back: () => string };
    guardSharedRouter(shared);
    expect(() => shared.push()).toThrow('before the first render');
    const only = { push: () => 'only', back: () => 'b' };
    rootMounted(only); Object.assign(shared, only);
    Object.assign(shared, unbound); rootUnmounted(only);
    expect(() => shared.push()).toThrow('before the first render');
  });
});
