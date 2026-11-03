/* A video played in the sheet (expo-video), muted, with the phone's
   controls: the picked video before it is placed, or the one that plays
   when the printed QR is scanned. */
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';

export function VideoPreview({ uri, autoPlay = false, testID }: { uri: string; autoPlay?: boolean; testID?: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    if (autoPlay) p.play();
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" testID={testID} />;
}

const styles = StyleSheet.create({
  video: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#000' },
});
