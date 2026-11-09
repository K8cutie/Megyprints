/* The Privacy Policy and Terms of Service links, and the agree line under
   Sign in and Place order (src/lib/legal.ts says why and whose words). Each
   opens the app's own screen (src/app/privacy.tsx, terms.tsx), never the
   browser. */
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { agreeWords, PRIVACY_LABEL, PRIVACY_SCREEN, TERMS_LABEL, TERMS_SCREEN } from '../lib/legal';
import { colors, space } from '../lib/theme';

const open = (screen: string) => { router.push(screen); };

/** "Privacy Policy   Terms of Service", side by side (the website's footer).
 *  onOpen runs first (a menu closes itself). */
export function LegalLinks({ color = colors.muted, onOpen, style, testID = 'legal' }: {
  color?: string;
  onOpen?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const link = (label: string, screen: string, id: string) => (
    <Pressable accessibilityRole="link" onPress={() => { onOpen?.(); open(screen); }} hitSlop={4}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]} testID={`${testID}-${id}`}>
      <Text style={[styles.linkText, { color }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.row, style]} testID={testID}>
      {link(PRIVACY_LABEL, PRIVACY_SCREEN, 'privacy')}
      {link(TERMS_LABEL, TERMS_SCREEN, 'terms')}
    </View>
  );
}

/** "By <by> you agree to our Terms of Service and confirm you're 18 or
 *  older." The whole line opens the Terms: a bigger place to tap than the
 *  two words on a phone. */
export function TermsAgreeLine({ by, style, testID = 'terms-agree' }: { by: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  const w = agreeWords(by);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${w.before}${w.link}${w.after}`} accessibilityHint={`Opens the ${TERMS_LABEL}`}
      onPress={() => open(TERMS_SCREEN)} style={({ pressed }) => [styles.agree, pressed && styles.pressed, style]} testID={testID}>
      <Text style={styles.agreeText}>
        {w.before}<Text style={styles.agreeLink}>{w.link}</Text>{w.after}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.lg },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  linkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  agree: { paddingVertical: space.sm, paddingHorizontal: space.xs },
  agreeText: { fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  agreeLink: { fontWeight: '700', color: colors.text, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
});
