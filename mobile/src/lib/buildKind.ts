/* ══════════════════════════════════════════════════════════════════════════
   Which build of 2.0 this is: 'play' (the real app on Google Play,
   app.config.js with MEGY_PLAY=1, which sets extra.build) or 'dev' (the test
   build, com.megyprints.app.dev). Screens hide what is only for testing in
   the Play build (the start screen's test buttons and "Test version" note).
   ══════════════════════════════════════════════════════════════════════════ */
import Constants from 'expo-constants';

type ConfigLike = { extra?: { build?: unknown } | null } | null | undefined;

/** 'play' only when the build says so; anything else is a test build. */
export function buildKind(config: ConfigLike = Constants.expoConfig as ConfigLike): 'play' | 'dev' {
  return config?.extra?.build === 'play' ? 'play' : 'dev';
}
