import { disableAppSwitcherProtectionAsync, enableAppSwitcherProtectionAsync, usePreventScreenCapture } from 'expo-screen-capture';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { watermarkSpot } from '@/lib/watermark';

type Props = { url: string; protect: boolean; watermark?: string };

/**
 * The app's version of the web ProtectedPlayer (FEATURE_PLAN.md §10). Paid
 * video gets a moving watermark of the viewer's tag, is covered whenever the
 * app is not in front, blocks screen capture, and stays inline so the
 * watermark cannot be lost in native fullscreen. This deters recording; it
 * does not prevent it (PIRACY-06).
 */
export default function ProtectedVideo({ url, protect, watermark }: Props) {
  const player = useVideoPlayer(url, (p) => p.play());
  const [inFront, setInFront] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setInFront(state === 'active');
      if (state !== 'active') player.pause();
    });

    return () => subscription.remove();
  }, [player]);

  return (
    <View style={styles.frame}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture={!protect}
        fullscreenOptions={{ enable: !protect }}
      />
      {protect ? <Protection watermark={watermark} /> : null}
      {protect && !inFront ? <View style={[StyleSheet.absoluteFill, styles.cover]} /> : null}
    </View>
  );
}

function Protection({ watermark }: { watermark?: string }) {
  const [step, setStep] = useState(0);
  usePreventScreenCapture();

  useEffect(() => {
    enableAppSwitcherProtectionAsync().catch(() => {});

    return () => {
      disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => s + 1), 4000);

    return () => clearInterval(timer);
  }, []);

  if (!watermark) return null;

  return (
    <ThemedText type="smallBold" pointerEvents="none" style={[styles.mark, watermarkSpot(step)]}>
      {watermark}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  cover: { backgroundColor: '#000' },
  mark: { position: 'absolute', color: 'rgba(255,255,255,0.55)' },
});
