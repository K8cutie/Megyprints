/* ══════════════════════════════════════════════════════════════════════════
   STEP 1: THE ALBUM'S NAME AND ITS OCCASION (the website's AlbumThemeStep,
   wizard step 'pick_theme': unskippable, its words).

   The name becomes the album's title and its cover title (the builder's
   setAlbumTitle); the occasion is kept where the builder reads it. "Next" is
   never greyed: tapped too early, it says what is missing (the website's
   nudge, 2026-10-04: a greyed Next that ate the tap left a tester stuck).
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cleanAlbumName, isAlbumNameReady, MAX_ALBUM_NAME_LENGTH } from '@web/lib/albumName';
import { COMMON_THEMES, isAlbumThemeReady, isCommonTheme, MAX_THEME_LENGTH } from '@web/lib/albumThemeRules';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { nameAlbum, occasionOf, saveStep } from '../builder/albumFlow';
import { colors, space } from '../lib/theme';

export default function AlbumName() {
  const { builder, platform } = useBuilder();
  const [name, setName] = useState(builder.albumTitle);
  const [occasion, setOccasion] = useState(() => occasionOf(platform.deviceStore));
  const [otherOpen, setOtherOpen] = useState(() => occasion !== '' && !isCommonTheme(occasion));
  const [nudge, setNudge] = useState(0);
  // An album opened from the account brings its own occasion.
  useEffect(() => platform.occasion.listen((o) => setOccasion(o)), [platform]);

  const nameReady = isAlbumNameReady(name);
  const themeReady = isAlbumThemeReady(occasion);
  const ready = nameReady && themeReady;
  const nudged = nudge > 0 && !ready;

  const next = () => {
    if (!ready) { setNudge((n) => n + 1); return; }
    nameAlbum(builder, platform.deviceStore, name, occasion, platform.occasionChanged);
    saveStep(platform.deviceStore, 'size');
    router.push('/album-size');
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior="height">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Give your album a name. Then pick the occasion: Megy writes the quotes on your pages to match it.</Text>

        <Text style={styles.label}>Album name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={MAX_ALBUM_NAME_LENGTH}
          placeholder="e.g. Maria's Debut, Our Boracay Trip"
          placeholderTextColor="#9A948C"
          style={[styles.input, nudged && !nameReady && styles.inputMissing]}
          returnKeyType="done"
          testID="album-name"
        />
        <Text style={styles.hint}>It's how you'll find this album again in My albums when you are signed in.</Text>

        <Text style={styles.question}>Pick the occasion. Megy writes the quotes on your pages to match it. You can change it later, but not skip it.</Text>
        <View style={[styles.chips, nudged && !themeReady && styles.chipsMissing]} accessibilityRole="radiogroup">
          {COMMON_THEMES.map((t) => {
            const on = !otherOpen && occasion === t;
            return (
              <Pressable key={t} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => { setOtherOpen(false); setOccasion(t); }}
                style={[styles.chip, on && styles.chipOn]} testID={`occasion-${t}`}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{t}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: otherOpen }} onPress={() => { setOtherOpen(true); if (isCommonTheme(occasion)) setOccasion(''); }}
            style={[styles.chip, otherOpen && styles.chipOn]} testID="occasion-other">
            <Text style={[styles.chipText, otherOpen && styles.chipTextOn]}>Something else</Text>
          </Pressable>
        </View>
        {otherOpen && (
          <View>
            <Text style={styles.label}>What is it about?</Text>
            <TextInput value={occasion} onChangeText={setOccasion} maxLength={MAX_THEME_LENGTH} autoFocus
              placeholder="e.g. Beach trip, Debut, Reunion, Lola's 80th" placeholderTextColor="#9A948C" style={styles.input} testID="occasion-text" />
            <Text style={styles.hint}>A few words is plenty. The quotes take their cue from this.</Text>
          </View>
        )}

        <Text style={[styles.status, ready ? styles.statusReady : nudged && styles.statusNudged]} testID="step-one-status">
          {ready
            ? `${cleanAlbumName(name)} · ${occasion.trim()}. Tap Next.`
            : !nameReady && !themeReady ? 'Name your album and choose an occasion to continue.'
              : !nameReady ? 'Name your album to continue.'
                : 'Choose an occasion to continue.'}
        </Text>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <Button label="Next" onPress={next} testID="name-next" />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, gap: space.sm },
  lead: { fontSize: 17, lineHeight: 24, color: colors.text, marginBottom: space.sm },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: space.sm },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 17, color: colors.text },
  inputMissing: { borderColor: colors.accent },
  hint: { fontSize: 14, color: colors.muted },
  question: { fontSize: 16, lineHeight: 23, color: colors.text, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, borderRadius: 14, padding: 2 },
  chipsMissing: { backgroundColor: '#FBEDE6', padding: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 16, fontWeight: '600', color: colors.text },
  chipTextOn: { color: colors.accentText },
  status: { fontSize: 15, color: colors.muted, marginTop: space.md },
  statusReady: { color: colors.good, fontWeight: '600' },
  statusNudged: { color: colors.accent, fontWeight: '700' },
  bar: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card, padding: space.md },
});
