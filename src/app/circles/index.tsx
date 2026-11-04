import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { CircleCard, MyCircleRow } from '@/components/circles';
import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { CircleSummary, MyCircle } from '@/lib/types';

type Loaded = { mine: MyCircle[]; discover: CircleSummary[] } | { error: string };

async function load(): Promise<Loaded> {
  try {
    const [mine, all] = await Promise.all([
      api.get<{ data: MyCircle[] }>('/api/v1/circles/mine'),
      api.get<{ data: CircleSummary[] }>('/api/v1/circles'),
    ]);
    const joined = new Set(mine.data.map((m) => m.circle.id));

    return { mine: mine.data, discover: all.data.filter((circle) => !joined.has(circle.id)) };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

/**
 * The circles I belong to, then ones I could join, opened from Me. Circles stay
 * off the tab bar; a creator's live on their profile. Reloads on return, so a
 * join shows at once.
 */
export default function Circles() {
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load().then((result) => !cancelled && setLoaded(result));

      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function refresh() {
    setRefreshing(true);
    setLoaded(await load());
    setRefreshing(false);
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'My circles', headerBackTitle: 'Back' }} />
      {!loaded ? (
        <ActivityIndicator style={styles.fill} />
      ) : 'error' in loaded ? (
        <View style={styles.padded}>
          <ErrorText>{loaded.error}</ErrorText>
        </View>
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Your circles
          </ThemedText>
          {loaded.mine.length ? (
            loaded.mine.map((membership) => <MyCircleRow key={membership.id} membership={membership} />)
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              You haven’t joined any circles yet.
            </ThemedText>
          )}

          {loaded.discover.length ? (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
                Discover
              </ThemedText>
              {loaded.discover.map((circle) => (
                <CircleCard key={circle.id} circle={circle} />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { padding: Spacing.three },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  section: { marginTop: Spacing.three },
});
