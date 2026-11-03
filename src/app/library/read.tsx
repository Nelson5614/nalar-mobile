import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { api } from '@/lib/session';
import { tokenStore } from '@/lib/token-store';

// A4 portrait, so the pages hold their place before each image arrives.
const PAGE_ASPECT = 1 / Math.SQRT2;

type Loaded = { pages: number; token: string } | { error: string };

/**
 * A purchased PDF as the server's watermarked page images, the same view-only
 * reader the web uses. The original file never reaches the phone here.
 */
export default function Reader() {
  const { product, asset, title } = useLocalSearchParams<{ product: string; asset: string; title: string }>();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Like protected video: a deterrent, not a lock (PIRACY-06).
  usePreventScreenCapture();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ pages: number }>(`/api/v1/shop/products/${product}/assets/${asset}/document`),
      tokenStore.get(),
    ])
      .then(([document, stored]) => {
        if (cancelled) return;
        setLoaded(
          stored?.token
            ? { pages: document.pages, token: stored.token }
            : { error: 'Please sign in again to read this.' },
        );
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            error: e instanceof ApiError ? e.message : 'This document could not be opened. Please try again.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [product, asset]);

  const pageWidth = width - Spacing.three * 2;

  return (
    <View style={[styles.fill, { backgroundColor: theme.backgroundElement }]}>
      <Stack.Screen options={{ headerShown: true, title: title ?? 'Reader', headerBackTitle: 'Library' }} />
      {!loaded ? (
        <ActivityIndicator style={styles.fill} />
      ) : 'error' in loaded ? (
        <View style={styles.padded}>
          <ErrorText>{loaded.error}</ErrorText>
        </View>
      ) : (
        <FlatList
          data={Array.from({ length: loaded.pages }, (_, i) => i + 1)}
          keyExtractor={(page) => String(page)}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.pages}
          initialNumToRender={2}
          renderItem={({ item: page }) => (
            <View style={styles.page}>
              <Image
                testID={`reader-page-${page}`}
                source={{
                  uri: `${API_URL}/api/v1/shop/products/${product}/assets/${asset}/pages/${page}`,
                  headers: { Authorization: `Bearer ${loaded.token}` },
                }}
                style={[styles.pageImage, { width: pageWidth, height: pageWidth / PAGE_ASPECT }]}
                contentFit="contain"
                cachePolicy="none"
              />
              <ThemedText type="small" themeColor="textSecondary">
                {`${page} of ${loaded.pages}`}
              </ThemedText>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  padded: { padding: Spacing.three },
  pages: { padding: Spacing.three, gap: Spacing.three },
  page: { alignItems: 'center', gap: Spacing.one },
  pageImage: { backgroundColor: '#fff', borderRadius: 4 },
});
