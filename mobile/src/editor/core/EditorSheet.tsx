/* A sheet from the bottom of the screen, the way the website's phone editor
   opens its choices (SlotChooser, "Add a photo", RemoveGraphicModal on a
   phone): a title, a close button, and what it offers. Every part's sheet
   can use it, so the editor's sheets look and close alike. Tapping the dim
   page above it or Android's back closes it.

   With the phone on its side (Edit pages says so: SheetPlacement 'side') it
   is a panel down the right instead, where the editor's buttons are, and
   the page on the left stays in full view: a filter or a mask shows on the
   photo as it is picked (owner, 2026-11-03). A tap on the page closes it. */
import { createContext, useContext, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../../lib/theme';
import { CLOSE } from '../editorWords';

/** Where the editor's sheets open: from the bottom (upright), or as a panel
 *  down the right (on its side). */
export type Placement = 'bottom' | 'side';
export const SheetPlacement = createContext<Placement>('bottom');
/** The side panel's width: as wide as the editor's own panel on its side. */
export const SIDE_PANEL_W = 372;
/** The side panel on a narrower screen: never more than this much of it. */
export const sidePanelWidth = (screenW: number) => Math.min(SIDE_PANEL_W, Math.round(screenW * 0.46));

export function EditorSheet({ title, onClose, children, testID, scroll = false }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
  /** A long list (a photo grid): the sheet's body scrolls. */
  scroll?: boolean;
}) {
  const placement = useContext(SheetPlacement);
  const { width: screenW } = useWindowDimensions();
  const head = (
    <View style={styles.head}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={CLOSE} style={styles.close} testID={testID ? `${testID}-close` : undefined}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
  if (placement === 'side') {
    return (
      <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['landscape', 'portrait']}>
        <View style={styles.sideRow}>
          <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={CLOSE} testID={testID ? `${testID}-dim` : undefined} />
          <SafeAreaView edges={['top', 'right', 'bottom']} style={[styles.side, { width: sidePanelWidth(screenW) }]} testID={testID}>
            {head}
            <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    );
  }
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.dim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={CLOSE} testID={testID ? `${testID}-dim` : undefined} />
        <SafeAreaView edges={['bottom']} style={styles.sheet} testID={testID}>
          {head}
          {scroll ? <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView> : <View style={styles.body}>{children}</View>}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** One choice in a sheet: what you get, in a line, and a line under it. */
export function SheetChoice({ label, desc, onPress, danger = false, testID }: { label: string; desc?: string; onPress: () => void; danger?: boolean; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
      <Text style={[styles.choiceLabel, danger && { color: colors.bad }]}>{label}</Text>
      {desc ? <Text style={styles.choiceDesc}>{desc}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sideRow: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  side: { backgroundColor: colors.card, borderLeftWidth: 1, borderLeftColor: colors.border },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: colors.muted },
  body: { padding: space.md, gap: space.sm },
  choice: { minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: space.md, paddingVertical: 10, justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  choiceLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  choiceDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
