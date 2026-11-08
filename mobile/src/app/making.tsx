/* "MAKING YOUR ALBUM" (the website's GeneratingOverlay, its words): shown
   while the builder checks the photos and lays out every page (generateAlbum,
   shared code), then on to the Preview. A silent wait reads as a hang (owner,
   2026-09-12); a wait that says what the phone is doing, with a real count,
   is fine (owner, 2026-11-09: "as long as the user knows what's happening").
   So each step is named ("Checking photos for blur. 37 of 200") and the bar
   moves with the count; nothing is padded.
   Android's back button does nothing while the album is being made (leaving
   mid-way left the making running, and its end then replaced whatever screen
   was on top); once it fails, back works again. */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { GENERATING_COPY, makeAlbum, photosLine, stageLine } from '../builder/albumFlow';
import { useGoToPreview } from '../builder/useGoToPreview';
import { colors, space } from '../lib/theme';

export default function Making() {
  const { builder } = useBuilder();
  const started = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);
  const goToPreview = useGoToPreview();
  const here = useRef(true);
  useEffect(() => () => { here.current = false; }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => !failed);
    return () => sub.remove();
  }, [failed]);

  const start = () => {
    setFailed(null);
    void makeAlbum(builder)
      .then((made) => {
        if (!here.current) return;
        if (made) goToPreview('replace');
        else setFailed('The album could not be made. Go back and try again.');
      })
      .catch(() => { if (here.current) setFailed('The album could not be made. Try again.'); });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = builder.generating ?? 'measuring';
  const count = builder.generatingCount;
  const stage = builder.generating ? stageLine(phase, count) : GENERATING_COPY.measuring;
  const photos = builder.uploadedPhotos.filter((p) => !p.leftOut).length;
  return (
    <View style={styles.page} accessibilityRole="progressbar" accessibilityLabel="Making your album">
      {failed ? (
        <>
          <Text style={styles.title}>Your album was not made</Text>
          <Text style={styles.stage}>{failed}</Text>
          <Button label="Try again" onPress={start} style={styles.button} testID="making-again" />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.title}>Making your album</Text>
          <Text style={styles.photos} testID="generating-photos">{photosLine(photos)}</Text>
          <Text style={styles.stage} testID="generating-stage">{stage}</Text>
          {count && count.total > 0 ? (
            <View style={styles.track} accessibilityElementsHidden>
              <View style={[styles.fill, { width: `${Math.round((count.done / count.total) * 100)}%` }]} />
            </View>
          ) : null}
          <Text style={styles.note}>Your photos stay on your phone.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  photos: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: -space.sm },
  stage: { fontSize: 16, color: colors.text, textAlign: 'center' },
  track: { width: 192, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  note: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 300 },
  button: { alignSelf: 'stretch' },
});
