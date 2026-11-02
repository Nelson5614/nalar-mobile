import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { api } from '@/lib/session';

type Service = {
  id: number;
  title: string;
  description: string | null;
  mode: string;
  price_credits: number;
  duration_minutes: number;
};
type Menu = { creator: { id: number; name: string }; services: Service[]; venue_area: string | null };
type Loaded = { menu: Menu } | { error: string };

async function load(creator: string): Promise<Loaded> {
  try {
    return { menu: (await api.get<{ data: Menu }>(`/api/v1/creators/${encodeURIComponent(creator)}/consultations`)).data };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

export default function ConsultationMenu() {
  const { creator } = useLocalSearchParams<{ creator: string }>();
  const theme = useTheme();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    load(creator).then((result) => !cancelled && setLoaded(result));

    return () => {
      cancelled = true;
    };
  }, [creator]);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Consultations', headerBackTitle: 'Back' }} />
      {!loaded ? (
        <ActivityIndicator style={styles.fill} />
      ) : 'error' in loaded ? (
        <View style={styles.content}>
          <ErrorText>{loaded.error}</ErrorText>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Book {loaded.menu.creator.name}</ThemedText>
          {loaded.menu.venue_area ? (
            <ThemedText themeColor="textSecondary">In-person sessions are in {loaded.menu.venue_area}.</ThemedText>
          ) : null}
          {loaded.menu.services.length === 0 ? (
            <ThemedText themeColor="textSecondary">No sessions are open for booking right now.</ThemedText>
          ) : (
            loaded.menu.services.map((service) => (
              <Pressable
                key={service.id}
                accessibilityRole="button"
                accessibilityLabel={service.title}
                onPress={() =>
                  router.push({
                    pathname: '/consultations/book',
                    params: {
                      offering: String(service.id),
                      title: service.title,
                      price: String(service.price_credits),
                      creator: loaded.menu.creator.name,
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.service,
                  { backgroundColor: theme.backgroundElement },
                  pressed && { opacity: 0.7 },
                ]}>
                <ThemedText type="smallBold">{service.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`${service.duration_minutes} minutes · ${service.price_credits} credits · ${service.mode === 'in_person' ? 'In person' : 'Online'}`}
                </ThemedText>
                {service.description ? (
                  <ThemedText type="small" numberOfLines={3}>
                    {service.description}
                  </ThemedText>
                ) : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  service: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
});
