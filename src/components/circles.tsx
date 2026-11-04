import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { circleMeta, circleRoute, membershipLine } from '@/lib/circles';
import type { CircleSummary, MyCircle } from '@/lib/types';

/** The circle's cover, or its first letter on the brand colour, as the web draws a circle with none. */
export function CircleCover({ circle, style }: { circle: CircleSummary; style?: object }) {
  const theme = useTheme();

  return (
    <View style={[styles.cover, { backgroundColor: theme.primary }, style]}>
      {circle.cover_image_url ? (
        <Image source={circle.cover_image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <ThemedText style={styles.letter}>{circle.title.charAt(0).toUpperCase()}</ThemedText>
      )}
    </View>
  );
}

/** The web's circle card: cover, title, two lines of description, members and price. */
export function CircleCard({ circle }: { circle: CircleSummary }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={circle.title}
      onPress={() => router.push(circleRoute(circle))}
      style={({ pressed }) => [styles.card, { borderColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      <CircleCover circle={circle} style={styles.cardCover} />
      <View style={styles.cardBody}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {circle.title}
        </ThemedText>
        {circle.description ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {circle.description}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor={circle.is_free ? 'textSecondary' : 'primary'}>
          {circleMeta(circle)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** A circle I belong to: compact, with where the membership stands. */
export function MyCircleRow({ membership }: { membership: MyCircle }) {
  const theme = useTheme();
  const { circle } = membership;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={circle.title}
      onPress={() => router.push(circleRoute(circle))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <CircleCover circle={circle} style={styles.rowCover} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {circle.title}
        </ThemedText>
        {circle.creator ? (
          <View style={styles.by}>
            <Avatar uri={circle.creator.profile_photo_url} name={circle.creator.name} size={18} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {circle.creator.name}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText type="small" themeColor={membership.status === 'paused' ? 'primary' : 'textSecondary'}>
          {membershipLine(membership)}
        </ThemedText>
      </View>
      <View style={[styles.chevron, { borderColor: theme.textSecondary }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  letter: { color: '#fff', fontSize: 34, lineHeight: 40, fontWeight: '700', opacity: 0.6 },
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  cardCover: { width: '100%', aspectRatio: 16 / 9 },
  cardBody: { padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowCover: { width: 64, height: 64, borderRadius: 12 },
  rowText: { flex: 1, gap: 2 },
  by: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { width: 9, height: 9, borderTopWidth: 2, borderRightWidth: 2, transform: [{ rotate: '45deg' }] },
});
