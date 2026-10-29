/* ══════════════════════════════════════════════════════════════════════════
   THE FONT LIST (the website's FontList): all 74 fonts, grouped by mood with
   a heading per group, each name written IN ITS OWN FONT, so you see what
   you're picking; the chosen one ticked, and the list opened on it.

   A font that comes from the internet (fontSources 'google') shows its name
   in its face from a tiny copy holding just those letters, fetched as the
   row comes into view (the website's rows download their face the same
   way). Picking one fetches the whole font first (the row says "Getting
   the font…"); without the internet the words keep their font and the
   editor says so.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { FONTS, FONT_GROUPS, fontFace, fontName, isSameFont } from '@web/pages/builder/fontCatalog';
import { colors, space } from '../../lib/theme';
import { EditorSheet } from '../core/EditorSheet';
import { fontStore as appFontStore } from './fonts/appFonts';
import type { FontStore } from './fonts/fontStore';
import { catalogFace, genericOf } from './fonts/fontSources';
import { fontOffline, FONTS_LABEL, GETTING_FONT } from './words';

export const ROW_H = 48;
const HEAD_H = 30;
/** Rows fetched ahead of the visible ones. */
const AHEAD = 4;

export function useFontStoreVersion(store: FontStore): number {
  return useSyncExternalStore(store.subscribe, store.version);
}

/** Picking a font, the same way wherever the list is (the text editor, the
 *  cover title): a font from the internet is fetched first, its row saying
 *  "Getting the font…"; once it is on the phone `onReady` gets it, so the
 *  page and print use the exact font. Without the internet the words keep
 *  `current` and `offline` says so. */
export function useFontPick(store: FontStore, onReady: (family: string) => void): {
  fetching: string | null;
  offline: string | null;
  pick: (family: string, current: string) => void;
} {
  const [fetching, setFetching] = useState<string | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  // Only the LAST pick counts, and only while the list is still there: a slow
  // font from the internet that arrives after the customer picked another one
  // (or closed the list) changes nothing.
  const seq = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const pick = (family: string, current: string) => {
    const id = ++seq.current;
    setOffline(null);
    const face = catalogFace(family);
    setFetching(face && store.status(face) === 'missing' ? family : null);
    void store.ensure(family)
      .catch(() => ({ ok: false as const, reason: 'failed' as const }))
      .then((r) => {
        if (!live.current || id !== seq.current) return;
        setFetching(null);
        if (r.ok) ready.current(family);
        else setOffline(fontOffline(fontName(family), fontName(current), r.reason));
      });
  };
  return { fetching, offline, pick };
}

/** The font list in a sheet of its own (the cover title's "Font"): the
 *  list, fetched fonts and the no-internet line exactly as in the text
 *  editor; closes once the picked font is ready. */
export function FontListSheet({ value, onPick, onClose, store = appFontStore, testID = 'font-sheet' }: {
  value: string;
  onPick: (family: string) => void;
  onClose: () => void;
  /** Tests hand in their own font store (no network, no files). */
  store?: FontStore;
  testID?: string;
}) {
  const { fetching, offline, pick } = useFontPick(store, (family) => { onPick(family); onClose(); });
  return (
    <EditorSheet title={FONTS_LABEL} onClose={onClose} testID={testID}>
      {offline && <Text style={styles.offline} accessibilityRole="alert" testID={`${testID}-offline`}>{offline}</Text>}
      <FontPicker store={store} value={value} loading={fetching} onPick={(family) => pick(family, value)} maxHeight={420} />
    </EditorSheet>
  );
}

export function FontPicker({ store, value, loading, onPick, maxHeight = 288 }: {
  store: FontStore;
  value: string;
  /** The family being fetched (its row shows "Getting the font…"). */
  loading: string | null;
  onPick: (family: string) => void;
  maxHeight?: number;
}) {
  useFontStoreVersion(store);
  const scroll = useRef<ScrollViewInstance>(null);
  const rowY = useRef(new Map<string, number>());
  const viewH = useRef(maxHeight);
  const opened = useRef(false);

  // The faces of the rows in view (and a few ahead), fetched as tiny copies.
  const fetchVisible = (top: number) => {
    for (const [face, y] of rowY.current) {
      if (y + ROW_H >= top - AHEAD * ROW_H && y <= top + viewH.current + AHEAD * ROW_H) void store.ensurePreview(face);
    }
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => fetchVisible(e.nativeEvent.contentOffset.y);

  // Open on the current font, not at the top of a 74-name list.
  const onContent = () => {
    if (opened.current) return;
    const hit = FONTS.find((f) => isSameFont(f.family, value));
    const y = hit ? rowY.current.get(fontFace(hit.family)) : undefined;
    if (y == null) return;
    opened.current = true;
    const top = Math.max(0, y - HEAD_H);
    scroll.current?.scrollTo({ y: top, animated: false });
    fetchVisible(top);
  };
  useEffect(() => { fetchVisible(0); /* first rows */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let y = 0;
  return (
    <ScrollView ref={scroll} style={{ maxHeight }} onScroll={onScroll} scrollEventThrottle={64} onContentSizeChange={onContent}
      onLayout={(e: LayoutChangeEvent) => { viewH.current = e.nativeEvent.layout.height; }}
      accessibilityRole="list" accessibilityLabel={FONTS_LABEL} testID="font-list" keyboardShouldPersistTaps="handled">
      {FONT_GROUPS.map((g) => {
        y += HEAD_H;
        return (
          <View key={g.id} accessibilityLabel={g.label}>
            <Text style={styles.head} accessibilityRole="header">{g.label}</Text>
            {FONTS.filter((f) => f.group === g.id).map((f) => {
              const face = fontFace(f.family);
              const at = y;
              y += ROW_H;
              rowY.current.set(face, at);
              const on = isSameFont(f.family, value);
              const busy = !!loading && isSameFont(loading, f.family);
              const shown = store.previewFont(face) ?? store.uiFont(f.family).fontFamily;
              return (
                <Pressable key={f.name} accessibilityRole="button" accessibilityLabel={f.name} accessibilityState={{ selected: on, busy }}
                  onPress={() => onPick(f.family)} testID={`font-${f.name}`}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}>
                  <Text numberOfLines={1} style={[styles.name, { fontFamily: shown || genericOf(f.family) }]}>{f.name}</Text>
                  {busy ? (
                    <View style={styles.busy}>
                      <ActivityIndicator color={colors.accent} size="small" />
                      <Text style={styles.busyText}>{GETTING_FONT}</Text>
                    </View>
                  ) : on ? <Text style={styles.tick}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { height: HEAD_H, paddingHorizontal: space.md, paddingTop: 10, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: colors.muted, backgroundColor: colors.card },
  row: { height: ROW_H, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowOn: { backgroundColor: '#FBEDE6' },
  pressed: { backgroundColor: '#F5EEE6' },
  name: { flex: 1, fontSize: 18, color: colors.text },
  tick: { fontSize: 16, fontWeight: '800', color: colors.accent, marginLeft: space.sm },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: space.sm },
  busyText: { fontSize: 12, color: colors.muted },
  offline: { fontSize: 13, lineHeight: 18, color: '#8A5A12', backgroundColor: '#FFF6E5', borderWidth: 1, borderColor: '#F0D9A8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: space.sm },
});
