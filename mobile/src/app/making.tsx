/* "MAKING YOUR ALBUM" (the website's GeneratingOverlay, its words): shown
   while the builder lays out every page (generateAlbum, shared code), then
   on to the Preview. A whole album takes a few seconds, and a silent wait
   reads as a hang (owner, 2026-09-12).
   Android's back button does nothing while the album is being made (leaving
   mid-way left the making running, and its end then replaced whatever screen
   was on top); once it fails, back works again. */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useBuilder } from '../builder/BuilderProvider';
import { GENERATING_COPY, makeAlbum } from '../builder/albumFlow';
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

  const stage = builder.generating ? GENERATING_COPY[builder.generating] : GENERATING_COPY.measuring;
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
          <Text style={styles.stage} testID="generating-stage">{stage}</Text>
          <Text style={styles.note}>Please stand by while Megy does the magic. This takes a few seconds.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  stage: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  note: { fontSize: 14, color: colors.muted, textAlign: 'center', maxWidth: 300 },
  button: { alignSelf: 'stretch' },
});
