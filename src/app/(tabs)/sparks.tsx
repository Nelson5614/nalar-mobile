import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { streamUrl } from '@/lib/playback';
import { api } from '@/lib/session';
import type { Spark, SparksPage } from '@/lib/types';

const VIEWABILITY = { itemVisiblePercentThreshold: 80 };
const withStream = (sparks: Spark[]) => sparks.filter((spark) => spark.mux_playback_id);
const fetchSparks = (cursor?: string | null) =>
  api.get<SparksPage>(cursor ? `/api/v1/sparks?cursor=${encodeURIComponent(cursor)}` : '/api/v1/sparks');

export default function Sparks() {
  const window = useWindowDimensions();
  const [height, setHeight] = useState(window.height);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSparks()
      .then((page) => {
        if (cancelled) return;
        setSparks(withStream(page.data));
        setCursor(page.next_cursor);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the tab pauses whatever was playing.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // FlatList refuses a new callback or config after mount, so both stay stable.
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }, []);

  async function loadMore() {
    if (!cursor) return;
    const page = await fetchSparks(cursor).catch(() => null);
    if (!page) return;
    setSparks((current) => [...current, ...withStream(page.data)]);
    setCursor(page.next_cursor);
  }

  if (loading || error || sparks.length === 0) {
    return (
      <View style={[styles.fill, styles.centered]}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <ThemedText style={styles.light}>No Sparks yet. Short videos from creators will show up here.</ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={styles.fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <FlatList
        data={sparks}
        keyExtractor={(spark) => String(spark.id)}
        renderItem={({ item, index }) => (
          <SparkItem spark={item} height={height} active={focused && index === activeIndex} />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        onEndReached={loadMore}
        onEndReachedThreshold={1}
      />
    </View>
  );
}

function SparkItem({ spark, height, active }: { spark: Spark; height: number; active: boolean }) {
  const player = useVideoPlayer(streamUrl(spark.mux_playback_id!), (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <View style={{ height }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <View style={styles.caption}>
        {spark.creator?.name ? (
          <ThemedText type="smallBold" style={styles.light}>
            {spark.creator.name}
          </ThemedText>
        ) : null}
        {spark.caption ? <ThemedText style={styles.light}>{spark.caption}</ThemedText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  caption: { position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.four, gap: Spacing.one },
  light: { color: '#fff' },
});
