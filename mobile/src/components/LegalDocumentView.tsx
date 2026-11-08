/* A Privacy Policy or Terms of Service screen: the website's words
   (src/lib/legalPages.ts, shared) drawn the way the website's page draws them
   (src/components/LegalPage.tsx): "Last updated", then each part's heading in
   Playfair and its words in DM Sans, bold where the website is bold, links in
   terracotta, underlined. The screen's header carries the page's name. A link
   opens the app's own screen, or the phone's email app (src/lib/legal.ts
   legalTarget). */
import { router } from 'expo-router';
import { Fragment } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LegalDocument, LegalLinkTo, LegalRun } from '@web/lib/legalPages';
import { useHomeType, type HomeType } from '../home/homeFonts';
import { legalTarget } from '../lib/legal';
import { colors, space } from '../lib/theme';

/** The website's words colour (LegalPage.tsx text-[#5B534C]). */
const WORDS = '#5B534C';

function follow(to: LegalLinkTo) {
  const target = legalTarget(to);
  if ('screen' in target) router.push(target.screen);
  else void Linking.openURL(target.url);
}

function Runs({ runs, t }: { runs: LegalRun[]; t: HomeType }) {
  return (
    <>
      {runs.map((run, i) => {
        if (typeof run === 'string') return <Fragment key={i}>{run}</Fragment>;
        if ('bold' in run) return <Text key={i} style={t.bodyBold}>{run.bold}</Text>;
        return (
          <Text key={i} accessibilityRole="link" onPress={() => follow(run.link)} style={styles.link} testID={`legal-link-${run.link}`}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

export function LegalDocumentView({ doc, testID }: { doc: LegalDocument; testID: string }) {
  const t = useHomeType();
  const inset = useSafeAreaInsets();
  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingBottom: space.xl + inset.bottom }]} testID={testID}>
      <Text style={[t.body, styles.updated]} testID={`${testID}-updated`}>Last updated: {doc.updated}</Text>
      {doc.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={[t.display, styles.heading]}>{section.title}</Text>
          {section.blocks.map((block, i) => block.kind === 'paragraph'
            ? (
              <Text key={i} style={[t.body, styles.words]} testID={block.testId}>
                <Runs runs={block.runs} t={t} />
              </Text>
            )
            : (
              <View key={i} style={styles.list}>
                {block.items.map((item, j) => (
                  <View key={j} style={styles.item}>
                    <Text style={[t.body, styles.words, styles.bullet]}>{'•'}</Text>
                    <Text style={[t.body, styles.words, styles.itemWords]}><Runs runs={item} t={t} /></Text>
                  </View>
                ))}
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  updated: { fontSize: 14, color: colors.muted, marginBottom: space.lg },
  section: { marginBottom: space.lg, gap: space.sm },
  heading: { fontSize: 20, lineHeight: 28, color: colors.text },
  words: { fontSize: 15, lineHeight: 24, color: WORDS },
  list: { gap: space.xs },
  item: { flexDirection: 'row' },
  bullet: { width: 18 },
  itemWords: { flex: 1 },
  link: { color: colors.accent, textDecorationLine: 'underline' },
});
