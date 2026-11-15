/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN'S LITTLE MOVEMENTS: the website's home animations
   (src/index.css .home-float, .home-twinkle, .home-scan, .home-fly,
   .home-rise, .home-pop, .home-drive and the photo's slow .animate-ken-burns),
   same timings. One clock each, shared by every picture that uses it, run on
   the native side (Animated, native driver), and only while the start screen
   is on top. With the phone's "reduce motion" on they hold still, in the
   pose the website holds them in (prefers-reduced-motion).
   ══════════════════════════════════════════════════════════════════════════ */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

/** Each clock's length, from src/index.css. */
export const MOTION_MS = { float: 3200, twinkle: 1800, scan: 1400, fly: 2200, rise: 1500, pop: 2600, drive: 1600, kenBurns: 20000 } as const;
type Clock = keyof typeof MOTION_MS;
/** These go there and back, easing each way: `alternate` in the CSS (each
 *  way the whole length), or a 0% = 100% keyframe (each way half of it).
 *  The rest start over. */
const THERE_AND_BACK: Partial<Record<Clock, number>> = {
  scan: MOTION_MS.scan, drive: MOTION_MS.drive, kenBurns: MOTION_MS.kenBurns,
  float: MOTION_MS.float / 2, twinkle: MOTION_MS.twinkle / 2,
};

type AnimatedStyle = Animated.WithAnimatedValue<Record<string, unknown>>;

export interface HomeMotion {
  still: boolean;
  /** Up 5 px and back (the floating pictures). */
  float: AnimatedStyle;
  /** Swells and fades (the sparkles). */
  twinkle: AnimatedStyle;
  /** The scan line, 18% to 76% of the phone's 100 px screen. */
  scan: AnimatedStyle;
  /** A photo flies into the album. */
  fly: AnimatedStyle;
  /** The upload arrow rises. */
  rise: AnimatedStyle;
  /** The QR / tick pops in. */
  pop: AnimatedStyle;
  /** The truck rolls back and forth. */
  drive: AnimatedStyle;
  /** The background photo's slow zoom. */
  kenBurns: AnimatedStyle;
}

function poses(v: Record<Clock, Animated.Value>): Omit<HomeMotion, 'still'> {
  return {
    float: { transform: [{ translateY: v.float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] },
    twinkle: {
      opacity: v.twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      transform: [{ scale: v.twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.1] }) }],
    },
    scan: { transform: [{ translateY: v.scan.interpolate({ inputRange: [0, 1], outputRange: [18, 76] }) }] },
    fly: {
      opacity: v.fly.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: [0, 1, 1, 0] }),
      transform: [
        { translateX: v.fly.interpolate({ inputRange: [0, 0.75, 1], outputRange: [-58, 0, 0] }) },
        { translateY: v.fly.interpolate({ inputRange: [0, 0.75, 1], outputRange: [22, 0, 0] }) },
        { scale: v.fly.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.45, 0.75, 0.75] }) },
        { rotate: v.fly.interpolate({ inputRange: [0, 0.75, 1], outputRange: ['-14deg', '6deg', '6deg'] }) },
      ],
    },
    rise: {
      opacity: v.rise.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] }),
      transform: [{ translateY: v.rise.interpolate({ inputRange: [0, 1], outputRange: [10, -12] }) }],
    },
    pop: { transform: [{ scale: v.pop.interpolate({ inputRange: [0, 0.12, 0.26, 0.36, 1], outputRange: [0, 0, 1.2, 1, 1] }) }] },
    drive: { transform: [{ translateX: v.drive.interpolate({ inputRange: [0, 1], outputRange: [-3, 5] }) }] },
    kenBurns: { transform: [{ scale: v.kenBurns.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] },
  };
}

/** Held still: the website's prefers-reduced-motion poses. */
const STILL: Omit<HomeMotion, 'still'> = {
  float: {},
  twinkle: {},
  scan: { transform: [{ translateY: 46 }] },
  fly: { transform: [{ scale: 0.75 }, { rotate: '6deg' }] },
  rise: {},
  pop: {},
  drive: {},
  kenBurns: {},
};

const Motion = createContext<HomeMotion>({ still: true, ...STILL });

export function useHomeMotion(): HomeMotion {
  return useContext(Motion);
}

/** Runs the clocks while `running`; holds still when `still`. */
export function HomeMotionProvider({ running, still, children }: { running: boolean; still: boolean; children: ReactNode }) {
  const values = useRef<Record<Clock, Animated.Value> | null>(null);
  if (!values.current) {
    values.current = Object.fromEntries(Object.keys(MOTION_MS).map((k) => [k, new Animated.Value(0)])) as Record<Clock, Animated.Value>;
  }
  const v = values.current;

  useEffect(() => {
    if (still || !running) return undefined;
    const loops = (Object.keys(MOTION_MS) as Clock[]).map((k) => {
      const leg = THERE_AND_BACK[k];
      const ease = Easing.inOut(Easing.ease);
      const loop = leg
        ? Animated.loop(Animated.sequence([
          Animated.timing(v[k], { toValue: 1, duration: leg, easing: ease, useNativeDriver: true }),
          Animated.timing(v[k], { toValue: 0, duration: leg, easing: ease, useNativeDriver: true }),
        ]))
        : Animated.loop(Animated.timing(v[k], { toValue: 1, duration: MOTION_MS[k], easing: k === 'rise' ? Easing.out(Easing.ease) : Easing.linear, useNativeDriver: true }));
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [still, running, v]);

  const value = useMemo<HomeMotion>(() => (still ? { still, ...STILL } : { still, ...poses(v) }), [still, v]);
  return <Motion.Provider value={value}>{children}</Motion.Provider>;
}
