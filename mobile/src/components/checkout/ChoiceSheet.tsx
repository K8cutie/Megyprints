import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { filterChoices, type PsgcItem } from '../../lib/checkout/psgc';
import { colors, space } from '../../lib/theme';

interface Props<T extends PsgcItem> {
  visible: boolean;
  title: string;
  items: readonly T[];
  selected: string;
  onPick: (code: string) => void;
  onClose: () => void;
}

/** A long list to pick one from (provinces, cities, barangays), with a box
 *  to find a name by typing part of it. The phone's own select would show
 *  900 barangays with no way to search. */
export function ChoiceSheet<T extends PsgcItem>({ visible, title, items, selected, onPick, onClose }: Props<T>) {
  const [typed, setTyped] = useState('');
  const shown = useMemo(() => filterChoices(items, typed), [items, typed]);
  const close = () => { setTyped(''); onClose(); };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.page}>
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={close} style={styles.close} testID="choice-close">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.search}
          value={typed}
          onChangeText={setTyped}
          placeholder="Type to find"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          testID="choice-search"
        />
        <FlatList
          data={shown}
          keyExtractor={(it) => it.code}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={30}
          ListEmptyComponent={typed.trim() ? <Text style={styles.empty}>No name has those letters. Check the spelling.</Text> : undefined}
          renderItem={({ item }) => {
            const on = item.code === selected;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => { setTyped(''); onPick(item.code); }}
                style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
              >
                <Text style={[styles.rowText, on && styles.rowTextOn]}>{item.name}</Text>
                {on && <Text style={styles.tick}>✓</Text>}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingTop: space.sm },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, flex: 1 },
  close: { padding: space.sm },
  closeText: { fontSize: 16, fontWeight: '700', color: colors.accent },
  search: { margin: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, minHeight: 48, fontSize: 17, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.card },
  rowOn: { backgroundColor: '#F6E7DF' },
  pressed: { opacity: 0.7 },
  rowText: { fontSize: 17, color: colors.text, flex: 1 },
  rowTextOn: { fontWeight: '700' },
  tick: { fontSize: 18, color: colors.accent, fontWeight: '800' },
  empty: { padding: space.lg, fontSize: 16, color: colors.muted, textAlign: 'center' },
});
