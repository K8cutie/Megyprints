/* ══════════════════════════════════════════════════════════════════════════
   PHOTO CHECK TEST SCREEN (for the comparison tool, tools/photo-check; not
   for customers: no button leads here). Opened with
     adb shell am start -a android.intent.action.VIEW -d megyprints-dev://photo-check-lab
   while tools/photo-check/phoneServer.mjs runs on the PC (adb reverse
   tcp:8095 tcp:8095). It asks the PC which test pictures to look for, finds
   them in the phone's gallery (pushed there by the tool), and runs the
   app's real photo check and face centring on them (phonePhotoCheck.ts), the
   way the album builder does: one photo at a time, blur first, then faces,
   then face centring from scratch. It sends every answer and how long each
   step took back to the PC, which compares them with the website's. When it
   is done it shows the phone's own verdicts, worked out with the website's
   album rules (src/lib/photoCheck.ts): the blurry photos, the sets of
   repeats, the photos with eyes shut and what Megy would suggest leaving
   out, as small pictures (for the comparison's screenshots).
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { findRepeats, isBlurry, medianSharpness, suggestLeaveOut, type CheckablePhoto, type PhotoCheck } from '@web/lib/photoCheck';
import { Button } from '../components/Button';
import { Thumb } from '../components/Thumb';
import { checkPhotoAccess, loadGalleryPage, NEXT_PAGE, photosForAlbum, type GalleryPhoto } from '../lib/gallery';
import { createPhoneChecks, nativeDevice, type PhoneCheckDevice } from '../lib/phonePhotoCheck';
import { FACE_COPY_SCALE, FACE_MODEL, faceModelAvailable } from '../lib/faceModel';
import { EYE_SHUT_BELOW, MIN_EYE_FACE_PX, type PhoneFace } from '../lib/phoneFaces';
import { colors, space } from '../lib/theme';

const PC = 'http://localhost:8095';
const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

interface Wanted { file: string; capturedAt?: number | null }
interface Steps { pixels?: number; find?: number; size?: number }

/** The phone's own verdicts, by the website's album rules. */
interface Verdicts {
  photos: number;
  median: number;
  blurry: string[];
  repeatSets: string[][];
  eyesShut: string[];
  withFaces: number;
  leaveOut: { blurry: string[]; repeats: string[]; keeperOf: Record<string, string> };
}

/** The album as the builder would hold it: each picture with its check
 *  (blur pass, then the face pass's faces and eyes) and its taken time. */
function verdictsOf(rows: Record<string, unknown>[], wanted: Map<string, Wanted>): Verdicts {
  const album: CheckablePhoto[] = rows.filter((r) => r.basic).map((r) => {
    const basic = r.basic as PhotoCheck;
    const f = r.faces as { faces: number | null; eyesClosed: boolean } | undefined;
    return {
      id: r.file as string, width: r.width as number, height: r.height as number,
      capturedAt: wanted.get(r.file as string)?.capturedAt ?? null,
      check: { ...basic, faces: f?.faces ?? null, eyesClosed: f?.eyesClosed ?? false, facesTried: true },
    };
  });
  const median = medianSharpness(album);
  const s = suggestLeaveOut(album);
  return {
    photos: album.length,
    median,
    blurry: album.filter((p) => isBlurry(p, median)).map((p) => p.id).sort(),
    repeatSets: findRepeats(album).map((set) => [...set].sort()).sort((a, b) => a[0].localeCompare(b[0])),
    eyesShut: album.filter((p) => p.check?.eyesClosed).map((p) => p.id).sort(),
    withFaces: album.filter((p) => (p.check?.faces ?? 0) > 0).length,
    leaveOut: { blurry: [...s.blurry].sort(), repeats: [...s.repeats].sort(), keeperOf: s.keeperOf },
  };
}

const THUMB = 64;
const short = (file: string) => file.replace(/\.jpg$/, '').replace(/^megy-sample-/, 'sample-').replace(/^pc-/, '');

/** A row of small pictures, each with its short name. */
function Pictures({ files, uriOf }: { files: string[]; uriOf: Map<string, string> }) {
  return (
    <View style={styles.pictures}>
      {files.map((f) => (
        <View key={f} style={styles.picture}>
          <Thumb uri={uriOf.get(f) ?? ''} size={THUMB} recyclingKey={f} />
          <Text style={styles.pictureName} numberOfLines={1}>{short(f)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Watches how late the JavaScript thread runs a 50 ms timer: how long the
 *  screen would wait for a tap while the check works. */
function lagWatch() {
  const lags: number[] = [];
  let last = now();
  const id = setInterval(() => { const t = now(); lags.push(Math.max(0, t - last - 50)); last = t; }, 50);
  return () => {
    clearInterval(id);
    const s = [...lags].sort((a, b) => a - b);
    return { samples: s.length, p50: s[Math.floor(s.length * 0.5)] ?? 0, p95: s[Math.floor(s.length * 0.95)] ?? 0, max: s[s.length - 1] ?? 0 };
  };
}

/** Reads a page of the gallery (what the photo grid does while you scroll)
 *  every 300 ms, one read at a time, and times each read: does the check
 *  make the grid wait? */
function galleryWatch() {
  const times: number[] = [];
  let on = true;
  const loop = (async () => {
    while (on) {
      const t = now();
      try { await loadGalleryPage(0, 60); } catch { /* timed anyway */ }
      times.push(now() - t);
      await new Promise((r) => setTimeout(r, 300));
    }
  })();
  return async () => {
    on = false;
    await loop;
    const s = [...times].sort((a, b) => a - b);
    return { reads: s.length, p50: s[Math.floor(s.length * 0.5)] ?? 0, p95: s[Math.floor(s.length * 0.95)] ?? 0, max: s[s.length - 1] ?? 0 };
  };
}

export default function PhotoCheckLab() {
  const [status, setStatus] = useState('Ready.');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ verdicts: Verdicts; uriOf: Map<string, string> } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setStatus('Asking the PC which pictures to check…');
      const wanted: Wanted[] = await (await fetch(`${PC}/manifest`)).json();
      const names = new Set(wanted.map((w) => w.file));
      const access = await checkPhotoAccess();
      if (access.state !== 'all') throw new Error('Photo access is not "Allow all" (adb shell pm grant … READ_MEDIA_IMAGES).');
      const found: GalleryPhoto[] = [];
      let seen = 0;
      const someNames: string[] = [];
      for (let offset = 0; ; offset += NEXT_PAGE) {
        const page = await loadGalleryPage(offset, NEXT_PAGE);
        seen += page.length;
        someNames.push(...page.slice(0, 5 - someNames.length).map((p) => p.name));
        found.push(...page.filter((p) => names.has(p.name)));
        if (page.length < NEXT_PAGE) break;
      }
      if (found.length === 0) {
        throw new Error(`None of the test pictures is in the gallery (it has ${seen} photos, such as ${someNames.join(', ') || 'none'}).`);
      }
      const byName = new Map(found.map((p) => [p.name, p]));
      const picked = wanted.map((w) => byName.get(w.file)).filter((p): p is GalleryPhoto => !!p);
      const photos = await photosForAlbum(picked);
      setStatus(`Found ${photos.length} of ${wanted.length} pictures. Checking…`);

      // The real device, with each step timed and the faces ML Kit found kept.
      let steps: Steps = {};
      let lastFaces: PhoneFace[] | null = null;
      const timed = <A extends unknown[], R>(name: keyof Steps, fn: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
        const t = now();
        try { return await fn(...a); } finally { steps[name] = now() - t; }
      };
      const device: PhoneCheckDevice = {
        ...nativeDevice,
        size: timed('size', nativeDevice.size),
        pixels: timed('pixels', nativeDevice.pixels),
        faces: nativeDevice.faces && {
          init: nativeDevice.faces.init,
          find: timed('find', async (uri: string, w: number, h: number, scale: number) => { const f = await nativeDevice.faces!.find(uri, w, h, scale); lastFaces = f; return f; }),
        },
      };
      const stored = (p: (typeof photos)[number]) => ({ id: p.key, name: p.name, type: 'image/jpeg', size: 0, width: p.width, height: p.height, url: p.uri });
      const rows: Record<string, unknown>[] = photos.map((p) => ({ file: p.name, uri: p.uri, width: p.width, height: p.height }));

      const warm = createPhoneChecks(device);
      await warm.faces.init();
      setStatus('Timing the gallery with nothing else running…');
      const stopIdle = galleryWatch();
      await new Promise((r) => setTimeout(r, 4000));
      const galleryIdle = await stopIdle();
      const t0 = now();
      const stopLagA = lagWatch();
      const stopGalleryA = galleryWatch();
      for (let i = 0; i < photos.length; i++) {
        steps = {};
        const t = now();
        try {
          const c: PhotoCheck = await warm.photoCheck.check(stored(photos[i]), photos[i].width, photos[i].height, { faces: false });
          Object.assign(rows[i], { basic: c, basicMs: now() - t, basicSteps: steps });
        } catch (e) {
          Object.assign(rows[i], { basicError: String(e) });
        }
        if (i % 10 === 0) setStatus(`Blur and repeats: ${i + 1} of ${photos.length}`);
        await new Promise((r) => setTimeout(r, 0));
      }
      const lagA = stopLagA();
      const tA = now() - t0;
      const galleryA = await stopGalleryA();

      const stopLagB = lagWatch();
      const stopGalleryB = galleryWatch();
      const t1 = now();
      for (let i = 0; i < photos.length; i++) {
        steps = {}; lastFaces = null;
        const t = now();
        try {
          const c = await warm.photoCheck.check(stored(photos[i]), photos[i].width, photos[i].height, { faces: true });
          Object.assign(rows[i], { faces: { faces: c.faces, eyesClosed: c.eyesClosed }, facesMs: now() - t, facesSteps: steps, mlFaces: lastFaces });
        } catch (e) {
          Object.assign(rows[i], { facesError: String(e) });
        }
        if (i % 10 === 0) setStatus(`Faces and eyes: ${i + 1} of ${photos.length}`);
        await new Promise((r) => setTimeout(r, 0));
      }
      const lagB = stopLagB();
      const tB = now() - t1;
      const galleryB = await stopGalleryB();

      // Face centring from scratch (a fresh finder: nothing kept from the check).
      const cold = createPhoneChecks(device);
      const t2 = now();
      for (let i = 0; i < photos.length; i++) {
        steps = {};
        const t = now();
        const c = await cold.faces.detectFaceCenter(photos[i].uri);
        Object.assign(rows[i], { centre: c, centreMs: now() - t, centreSteps: steps });
        // And again: the second time is answered from what the finder kept.
        const t3 = now();
        const again = await cold.faces.detectFaceCenter(photos[i].uri);
        Object.assign(rows[i], { centreAgainMs: now() - t3, centreAgainSame: JSON.stringify(again) === JSON.stringify(c) });
        if (i % 10 === 0) setStatus(`Face centring: ${i + 1} of ${photos.length}`);
      }
      const tC = now() - t2;

      const verdicts = verdictsOf(rows, new Map(wanted.map((w) => [w.file, w])));
      const report = {
        when: new Date().toISOString(),
        faceModel: faceModelAvailable ? FACE_MODEL : null,
        eyeRule: { faceCopyScale: FACE_COPY_SCALE, minEyeFacePx: MIN_EYE_FACE_PX, eyeShutBelow: EYE_SHUT_BELOW },
        engine: typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !== 'undefined' ? 'Hermes' : 'other',
        dev: __DEV__,
        totals: { basicMs: tA, facesMs: tB, centreMs: tC, photos: photos.length },
        lag: { basic: lagA, faces: lagB },
        gallery: { idle: galleryIdle, basic: galleryA, faces: galleryB },
        verdicts,
        rows,
      };
      setStatus('Sending the answers to the PC…');
      const res = await fetch(`${PC}/results`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
      setResult({ verdicts, uriOf: new Map(photos.map((p) => [p.name, p.uri])) });
      setStatus(res.ok
        ? `Done: ${photos.length} pictures. Blur and repeats ${Math.round(tA / photos.length)} ms a photo, faces ${Math.round(tB / photos.length)} ms, centring ${Math.round(tC / photos.length)} ms.`
        : `The PC did not take the answers (${res.status}).`);
    } catch (e) {
      setStatus(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Starts on its own when opened (the PC tool is waiting). A remount
  // before it starts (React's dev double-mount) just starts it once, later.
  useEffect(() => {
    if (!__DEV__) return;
    const t = setTimeout(() => { void run(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A test tool for the dev app only: a store build has nothing here.
  if (!__DEV__) {
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Text style={styles.lead}>Nothing here.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>Photo check test: the app checks the test pictures and sends the answers to the PC.</Text>
      <Text style={styles.status} testID="lab-status">{status}</Text>
      {result && (
        <View testID="lab-results">
          <Text style={styles.heading}>
            What the phone found ({result.verdicts.photos} pictures, faces on {result.verdicts.withFaces})
          </Text>
          <Text style={styles.heading}>Blurry: {result.verdicts.blurry.length}</Text>
          <Pictures files={result.verdicts.blurry} uriOf={result.uriOf} />
          <Text style={styles.heading}>Sets of repeats: {result.verdicts.repeatSets.length}</Text>
          {result.verdicts.repeatSets.map((set) => (
            <View key={set.join('+')} style={styles.set}>
              <Pictures files={set} uriOf={result.uriOf} />
            </View>
          ))}
          <Text style={styles.heading}>Eyes shut: {result.verdicts.eyesShut.length}</Text>
          <Pictures files={result.verdicts.eyesShut} uriOf={result.uriOf} />
          <Text style={styles.heading}>
            Megy would suggest leaving out: {result.verdicts.leaveOut.blurry.length} blurry, {result.verdicts.leaveOut.repeats.length} repeats
          </Text>
          <Pictures files={[...result.verdicts.leaveOut.blurry, ...result.verdicts.leaveOut.repeats]} uriOf={result.uriOf} />
        </View>
      )}
      <Button label={busy ? 'Checking' : 'Check again'} busy={busy} onPress={() => { void run(); }} style={styles.button} testID="lab-run" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md },
  lead: { fontSize: 16, lineHeight: 22, color: colors.text },
  status: { fontSize: 16, lineHeight: 22, color: colors.text, marginTop: space.md },
  heading: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text, marginTop: space.md, marginBottom: space.xs },
  pictures: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  picture: { width: THUMB },
  pictureName: { fontSize: 9, color: colors.muted },
  set: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: space.xs, marginBottom: space.xs, alignSelf: 'flex-start' },
  button: { marginTop: space.lg },
});
