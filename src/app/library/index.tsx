import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';
import type { LibraryAsset, LibraryOrder } from '@/lib/types';

const fetchLibrary = () => api.get<{ data: LibraryOrder[] }>('/api/v1/shop/library');
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  shipped: 'Shipped',
  delivered: 'Delivered',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export default function Library() {
  const theme = useTheme();
  const [orders, setOrders] = useState<LibraryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchLibrary()
      .then((library) => !cancelled && setOrders(library.data))
      .catch((e) => !cancelled && setError(messageOf(e)))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      setOrders((await fetchLibrary()).data);
      setError('');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'My library', headerBackTitle: 'Back' }} />
      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => <OrderCard order={item} onError={setError} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={error && orders.length ? <ErrorText>{error}</ErrorText> : undefined}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator />
          ) : error ? (
            <ErrorText>{error}</ErrorText>
          ) : (
            <ThemedText themeColor="textSecondary">
              Nothing here yet. Things you buy from creators’ shops will show up here.
            </ThemedText>
          )
        }
      />
    </View>
  );
}

function OrderCard({ order, onError }: { order: LibraryOrder; onError: (text: string) => void }) {
  const theme = useTheme();
  const product = order.product;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cover, { backgroundColor: theme.background }]}>
          {product?.cover_image_url ? (
            <Image source={product.cover_image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <SymbolView
              name={product?.type === 'physical' ? 'shippingbox' : 'doc.richtext'}
              tintColor={theme.textSecondary}
              size={26}
            />
          )}
        </View>
        <View style={styles.cardText}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {product?.title ?? 'Removed product'}
          </ThemedText>
          {order.seller ? (
            <ThemedText type="small" themeColor="textSecondary">{`From ${order.seller.name}`}</ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {STATUS_LABELS[order.status] ?? order.status}
          </ThemedText>
        </View>
      </View>
      {order.assets.map((asset) => (
        <AssetRow key={asset.id} order={order} asset={asset} onError={onError} />
      ))}
    </View>
  );
}

function AssetRow({
  order,
  asset,
  onError,
}: {
  order: LibraryOrder;
  asset: LibraryAsset;
  onError: (text: string) => void;
}) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);
  const name = asset.filename ?? (asset.kind === 'pdf' ? 'Document' : 'File');
  const productId = order.product?.id;

  // The link is signed for 15 minutes, so it is asked for at the moment of use.
  async function download() {
    if (!productId) return;
    setOpening(true);
    try {
      const link = await api.get<{ data: { url: string } }>(
        `/api/v1/shop/products/${productId}/assets/${asset.id}/download-link`,
      );
      await WebBrowser.openBrowserAsync(link.data.url);
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={[styles.assetRow, { borderTopColor: theme.background }]}>
      <SymbolView name={asset.kind === 'audio' ? 'music.note' : 'doc.fill'} tintColor={theme.textSecondary} size={18} />
      <ThemedText type="small" numberOfLines={1} style={styles.assetName}>
        {name}
      </ThemedText>
      {asset.readable && productId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Read ${name}`}
          onPress={() =>
            router.push({
              pathname: '/library/read',
              params: { product: productId, asset: asset.id, title: order.product?.title ?? name },
            })
          }
          style={styles.action}>
          <ThemedText type="smallBold" themeColor="primary">
            Read
          </ThemedText>
        </Pressable>
      ) : null}
      {asset.downloadable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Download ${name}`}
          accessibilityState={{ busy: opening }}
          disabled={opening}
          onPress={download}
          style={styles.action}>
          {opening ? (
            <ActivityIndicator />
          ) : (
            <ThemedText type="smallBold" themeColor="primary">
              Download
            </ThemedText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardTop: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  cover: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: Spacing.half },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    minHeight: 44,
  },
  assetName: { flex: 1 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: Spacing.two },
});
