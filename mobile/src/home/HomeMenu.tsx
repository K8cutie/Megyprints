/* The start screen's menu (the website's phone menu, src/components/
   Navbar.tsx: the cream page over everything, big Playfair links in the
   middle, a cross to close). The account's places when signed in; Sign in
   when not; Megyprints Events either way; under them, small, Privacy Policy
   and Terms of Service, as the website's menu has. A tap closes it and goes
   there. */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegalLinks } from '../components/LegalLinks';
import { useType } from './homeFonts';
import { Cross } from './homeIcons';
import { HOME } from './homeWords';
import { INK } from './HomeCards';

export interface MenuItem { label: string; onPress: () => void; testID: string }

export function HomeMenu({ items, note, close }: { items: MenuItem[]; note?: string; close: () => void }) {
  const t = useType();
  const inset = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.page, { paddingTop: inset.top, paddingBottom: inset.bottom }]} testID="home-menu-page">
        <View style={styles.top}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={HOME.closeMenu} hitSlop={8} style={styles.close} testID="home-menu-close">
            <Cross color={INK.dark} />
          </Pressable>
        </View>
        <View style={styles.list}>
          {note ? <Text style={[t.body, styles.note]}>{note}</Text> : null}
          {items.map((it) => (
            <Pressable key={it.testID} onPress={() => { close(); it.onPress(); }} accessibilityRole="button" testID={it.testID}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <Text style={[t.display, styles.itemText]}>{it.label}</Text>
            </Pressable>
          ))}
          <LegalLinks color={INK.soft} onOpen={close} style={styles.legal} testID="menu-legal" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FAF7F2' },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 56 },
  note: { fontSize: 14, color: INK.soft, marginBottom: 8 },
  item: { minHeight: 48, paddingHorizontal: 24, justifyContent: 'center' },
  itemText: { fontSize: 24, color: INK.dark, textAlign: 'center' },
  legal: { marginTop: 14 },
  pressed: { opacity: 0.6 },
});
