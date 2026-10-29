/* DEBUG SCREEN, TEST BUILDS ONLY: draws the golden pages and covers with this phone's
   own Skia and saves the pictures in the app's files folder, for the computer
   to compare with the website's (src/dev/goldenRun.ts, test/goldenPhone.check.ts).
   A build has the pages only when made with `build-android.ps1 -GoldenPages`;
   in every other build this screen says so and does nothing, and its link on
   the Shared code check screen is not shown. Open it from there, or with
   adb: am start -a android.intent.action.VIEW -d "megyprints-dev://golden-pages?run=1" */
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
// The phone's native Skia (JSI), without the rest of the library (views,
// animation): the page renderer needs only the Skia API object.
import '@shopify/react-native-skia/lib/commonjs/skia/NativeSetup';
import { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/Skia';
import { Button } from '../components/Button';
import { goldenBundle } from '../dev/goldenBundle';
import { runGoldenPages, type PhoneReport, type ToSrgb } from '../dev/goldenRun';
import { srgbCopy } from '../../modules/photo-files';
import { colors, space } from '../lib/theme';

declare const HermesInternal: unknown;

const OUT_DIR = 'golden-phone';

type State =
  | { step: 'idle' }
  | { step: 'running'; done: number; total: number; name: string }
  | { step: 'done'; report: PhoneReport; folder: string }
  | { step: 'failed'; text: string };

/** The phone's own sRGB conversion (modules/photo-files srgbCopy), through files. */
const phoneToSrgb: ToSrgb = async ({ file, bytes }) => {
  const dir = new Directory(Paths.cache, 'golden-srgb');
  dir.create({ intermediates: true, idempotent: true });
  const base = file.split('/').pop() ?? file;
  const src = new File(dir, base);
  const dst = new File(dir, `srgb-${base}`);
  await src.write(bytes);
  const r = await srgbCopy(src.uri, dst.uri);
  if (!r || !r.supported) return null;
  const out = await dst.bytes();
  src.delete();
  dst.delete();
  return { colorSpace: r.colorSpace, converted: r.converted, bytes: out };
};

export default function GoldenPages() {
  const { run } = useLocalSearchParams<{ run?: string }>();
  const [state, setState] = useState<State>({ step: 'idle' });
  const started = useRef(false);

  const start = async () => {
    if (!goldenBundle || started.current) return;
    started.current = true;
    try {
      const out = new Directory(Paths.document, OUT_DIR);
      if (out.exists) out.delete();
      out.create({ intermediates: true, idempotent: true });
      const writer = { write: async (name: string, content: Uint8Array | string) => new File(out, name).write(content) };
      const report = await runGoldenPages(Skia, goldenBundle, writer, {
        toSrgb: phoneToSrgb,
        device: {
          os: Platform.OS,
          version: Platform.Version,
          constants: Platform.constants,
          hermes: typeof HermesInternal !== 'undefined' && HermesInternal != null,
          dev: __DEV__,
        },
        onPage: (done, total, name) => {
          if (name) console.log(`[golden] ${Math.min(done + 1, total)}/${total} ${name}`);
          setState({ step: 'running', done, total, name });
        },
      });
      console.log(`[golden] done: ${report.pages.length} pictures in ${report.totalMs} ms -> ${out.uri}`);
      setState({ step: 'done', report, folder: out.uri });
    } catch (err) {
      const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.log(`[golden] failed: ${text}`);
      setState({ step: 'failed', text });
    } finally {
      started.current = false;
    }
  };

  useEffect(() => {
    if (run === '1') void start();
    // Only when opened with ?run=1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  if (!goldenBundle) {
    return (
      <View style={styles.page}>
        <Text style={styles.lead}>This build has no golden pages. Make a test build with build-android.ps1 -GoldenPages to use this screen.</Text>
      </View>
    );
  }

  const failedPages = state.step === 'done' ? state.report.pages.filter((p) => p.error) : [];
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Draws the {goldenBundle.cases.length} golden pages and {goldenBundle.covers?.length ?? 0} covers with this phone&apos;s own Skia, at print size, and saves them in the app&apos;s files folder. The computer compares them with the website&apos;s print files.
      </Text>
      <Text style={styles.small}>Website pictures made {goldenBundle.madeFrom.madeAt} (Chromium {goldenBundle.madeFrom.chromium}).</Text>

      {state.step === 'running' && (
        <View style={styles.box} testID="golden-progress">
          <Text style={styles.boxTitle}>Drawing page {Math.min(state.done + 1, state.total)} of {state.total}</Text>
          <Text style={styles.small}>{state.name}</Text>
        </View>
      )}
      {state.step === 'done' && (
        <View style={[styles.banner, failedPages.length ? styles.bad : styles.good]} testID="golden-done">
          <Text style={styles.bannerText}>
            {failedPages.length ? `${failedPages.length} pages could not be drawn.` : `Done: ${state.report.pages.length} pictures in ${(state.report.totalMs / 1000).toFixed(1)} s.`}
          </Text>
          <Text style={styles.bannerSmall} selectable>{state.folder}</Text>
          {failedPages.map((p) => <Text key={p.file} style={styles.bannerSmall}>{p.file}: {p.error}</Text>)}
        </View>
      )}
      {state.step === 'failed' && (
        <View style={[styles.banner, styles.bad]} testID="golden-failed">
          <Text style={styles.bannerText}>The run stopped: {state.text}</Text>
        </View>
      )}

      <Button
        label={state.step === 'running' ? 'Drawing the pages' : state.step === 'done' ? 'Draw them again' : 'Draw the golden pages'}
        busy={state.step === 'running'}
        onPress={() => void start()}
        style={styles.button}
        testID="golden-run"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, padding: space.md },
  content: { paddingBottom: space.xl },
  lead: { fontSize: 16, lineHeight: 22, color: colors.text },
  small: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  box: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md, marginTop: space.md },
  boxTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  banner: { borderRadius: 12, padding: space.md, marginTop: space.md },
  good: { backgroundColor: colors.good },
  bad: { backgroundColor: colors.bad },
  bannerText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  bannerSmall: { color: '#FFFFFF', fontSize: 13, marginTop: space.xs },
  button: { marginTop: space.lg },
});
