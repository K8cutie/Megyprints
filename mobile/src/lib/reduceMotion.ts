/* The phone's "reduce motion" setting (Settings › Accessibility), kept up to
   date. With it on, the app's moving parts hold still, as the website does
   under prefers-reduced-motion: the gold button (editor/core/GoldButton.tsx)
   and the start screen's slides and pictures (src/home). */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setReduce(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}
