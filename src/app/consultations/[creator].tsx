import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, ErrorText } from '@/components/ui';
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
type Menu = {
  creator: { id: number; name: string; profile_photo_url?: string | null };
  services: Service[];
  venue_area: string | null;
};
type Loaded = { menu: Menu } | { error: string };

// Same wording as the web's formatDuration: "30 min", "1 hr", "1 hr 30 min".
const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;

  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

async function load(creator: string): Promise<Loaded> {
  try {
    return {
      menu: (await api.get<{ data: Menu }>(`/api/v1/creators/${encodeURIComponent(creator)}/consultations`)).data,
    };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.' };
  }
}

/** Follows the web page (Pages/Consultations/Index.vue): one card per session, each with its own Book button. */
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
      <Stack.Screen options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
      {!loaded ? (
        <ActivityIndicator style={styles.fill} />
      ) : 'error' in loaded ? (
        <View style={styles.content}>
          <ErrorText>{loaded.error}</ErrorText>
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <View style={styles.heading}>
            <Avatar uri={loaded.menu.creator.profile_photo_url} name={loaded.menu.creator.name} size={48} />
            <View style={styles.headingText}>
              <ThemedText type="subtitle">Consultations</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Book a session with {loaded.menu.creator.name}
              </ThemedText>
            </View>
          </View>

          {loaded.menu.services.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {loaded.menu.creator.name} isn’t taking bookings right now.
              </ThemedText>
            </View>
          ) : (
            loaded.menu.services.map((service) => <ServiceCard key={service.id} service={service} menu={loaded.menu} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ServiceCard({ service, menu }: { service: Service; menu: Menu }) {
  const theme = useTheme();
  const inPerson = service.mode === 'in_person';
  const mode = inPerson ? (menu.venue_area ? `In person, ${menu.venue_area}` : 'In person') : 'Online video call';
  const tint = inPerson ? '#b45309' : '#0369a1';

  return (
    <View style={[styles.card, { borderColor: theme.backgroundElement }]}>
      <ThemedText style={styles.title}>{service.title}</ThemedText>
      <View style={[styles.chip, { backgroundColor: inPerson ? '#fef3c7' : '#e0f2fe' }]}>
        <SymbolView name={inPerson ? 'mappin.and.ellipse' : 'video.fill'} size={12} tintColor={tint} />
        <ThemedText type="smallBold" style={{ color: tint }}>
          {mode}
        </ThemedText>
      </View>
      {service.description ? (
        <ThemedText type="small" themeColor="textSecondary">
          {service.description}
        </ThemedText>
      ) : null}

      <View style={[styles.facts, { borderTopColor: theme.backgroundElement }]}>
        <Fact icon="creditcard" label="Price" value={`${service.price_credits} credits`} />
        <Fact icon="clock" label="Length" value={formatDuration(service.duration_minutes)} />
      </View>

      <Button
        label="Book a time"
        accessibilityLabel={`Book a time for ${service.title}`}
        onPress={() =>
          router.push({
            pathname: '/consultations/book',
            params: {
              offering: String(service.id),
              title: service.title,
              price: String(service.price_credits),
              creator: menu.creator.name,
            },
          })
        }
      />
    </View>
  );
}

function Fact({ icon, label, value }: { icon: 'creditcard' | 'clock'; label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={styles.fact}>
      <SymbolView name={icon} size={18} tintColor={theme.textSecondary} />
      <View>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="smallBold">{value}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  headingText: { flex: 1, gap: Spacing.half },
  card: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  facts: {
    flexDirection: 'row',
    gap: Spacing.five,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    marginTop: Spacing.one,
    marginBottom: Spacing.one,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: Spacing.four },
  center: { textAlign: 'center' },
});
