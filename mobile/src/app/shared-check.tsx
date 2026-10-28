import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { priceOf, type PriceSchedule } from '@web/lib/pricing';
import { Button } from '../components/Button';
import { goldenBundle } from '../dev/goldenBundle';
import { compareWithExpected, runSharedChecks, type SharedCheckReport } from '../lib/sharedCheck';
import { SHARED_CHECK_EXPECTED } from '../lib/sharedCheckExpected';
import { supabase, supabaseConfigured, supabaseHost } from '../lib/supabase';
import { colors, space } from '../lib/theme';

declare const HermesInternal: unknown;
const engine = typeof HermesInternal !== 'undefined' && HermesInternal != null ? 'Hermes' : 'not Hermes';

type Live = { state: 'idle' } | { state: 'busy' } | { state: 'done'; soft: number; hard: number } | { state: 'failed'; text: string };

/** Runs the website's album code here on the phone and shows the answers,
 *  next to the answers the same code gives on a computer. */
export default function SharedCheck() {
  const [report, setReport] = useState<SharedCheckReport | null>(null);
  const [crash, setCrash] = useState<string | null>(null);
  const [live, setLive] = useState<Live>({ state: 'idle' });

  useEffect(() => {
    // After the first paint, so the screen shows while the album is made.
    const t = setTimeout(() => {
      try {
        setReport(runSharedChecks());
      } catch (err) {
        setCrash(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const loadPrices = async () => {
    if (!supabaseConfigured) {
      setLive({ state: 'failed', text: 'This test build was made without the Megy Prints server address.' });
      return;
    }
    setLive({ state: 'busy' });
    try {
      const { data, error } = await supabase.rpc('public_price_schedule');
      if (error || !data) throw new Error(error?.message ?? 'No prices came back.');
      const schedule = data as PriceSchedule;
      setLive({ state: 'done', soft: priceOf(schedule, '8x8', 'soft', 40), hard: priceOf(schedule, '8x8', 'hard', 40) });
    } catch (err) {
      setLive({ state: 'failed', text: `Could not load the prices. ${err instanceof Error ? err.message : ''}`.trim() });
    }
  };

  const compared = report ? compareWithExpected(report.lines, SHARED_CHECK_EXPECTED) : [];
  const same = compared.filter((c) => c.same).length;
  const allSame = !!report && same === compared.length && compared.length === Object.keys(SHARED_CHECK_EXPECTED).length;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        This screen runs the website&apos;s own album code (layouts, prices, the 40-photo minimum, the album maker) on this phone.
      </Text>
      <Text style={styles.small}>JavaScript engine: {engine}</Text>

      {crash && (
        <View style={[styles.banner, styles.bad]} testID="check-crash">
          <Text style={styles.bannerText}>The album code stopped with an error:</Text>
          <Text style={styles.bannerText}>{crash}</Text>
        </View>
      )}

      {!report && !crash && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.small}>Making a test album</Text>
        </View>
      )}

      {report && (
        <>
          <View style={[styles.banner, allSame ? styles.good : styles.bad]} testID="check-summary">
            <Text style={styles.bannerText}>
              {allSame ? `Same as on a computer: all ${same} answers match.` : `Different from a computer: ${same} of ${Object.keys(SHARED_CHECK_EXPECTED).length} answers match.`}
            </Text>
          </View>
          <Text style={styles.small}>Album made here in {report.albumMs} ms.</Text>

          {compared.map(({ line, same: ok, expected }) => (
            <View key={line.id} style={styles.line}>
              <Text style={styles.lineLabel}>{ok ? '✓' : '✗'} {line.label}</Text>
              <Text style={styles.lineValue} selectable>{line.value}</Text>
              {!ok && <Text style={styles.expected}>On a computer: {expected ?? '(no answer)'}</Text>}
            </View>
          ))}
        </>
      )}

      <View style={styles.liveBox}>
        <Text style={styles.lineLabel}>Today&apos;s prices from the server</Text>
        <Text style={styles.small}>Server: {supabaseHost || 'not set in this build'}</Text>
        {live.state === 'done' && (
          <Text style={styles.lineValue} testID="live-prices">8×8, 40 pages: softcover ₱{live.soft}, hardbound ₱{live.hard}</Text>
        )}
        {live.state === 'failed' && <Text style={styles.expected}>{live.text}</Text>}
        <Button
          label={live.state === 'busy' ? 'Loading prices' : "Load today's prices"}
          kind="plain"
          busy={live.state === 'busy'}
          onPress={loadPrices}
          style={styles.liveButton}
          testID="load-prices"
        />
      </View>

      {goldenBundle && (
        // Test builds made with -GoldenPages only (goldenPages.js): never in a customer build.
        <View style={styles.liveBox}>
          <Text style={styles.lineLabel}>Golden pages (test build)</Text>
          <Text style={styles.small}>Draw the {goldenBundle.cases.length} test pages with this phone&apos;s Skia, for the computer to compare with the website&apos;s print files.</Text>
          <Button label="Open golden pages" kind="plain" onPress={() => router.push('/golden-pages')} style={styles.liveButton} testID="open-golden" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl },
  lead: { fontSize: 16, lineHeight: 22, color: colors.text },
  small: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  center: { alignItems: 'center', padding: space.xl, gap: space.sm },
  banner: { borderRadius: 12, padding: space.md, marginTop: space.md },
  good: { backgroundColor: colors.good },
  bad: { backgroundColor: colors.bad },
  bannerText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  line: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md, marginTop: space.sm },
  lineLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  lineValue: { fontSize: 15, color: colors.text, marginTop: space.xs },
  expected: { fontSize: 14, color: colors.bad, marginTop: space.xs },
  liveBox: { marginTop: space.lg, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  liveButton: { marginTop: space.md },
});
