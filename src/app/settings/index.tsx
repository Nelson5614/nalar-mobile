import { router, Stack, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/session';

/** Account settings: the web profile page's security sections, one screen each. */
export default function Settings() {
  const [twoStep, setTwoStep] = useState<boolean | null>(null);

  // Read again on return, so turning two-step sign-in on or off shows here.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .get<{ data: { enabled: boolean } }>('/api/v1/account/two-factor')
        .then((r) => !cancelled && setTwoStep(r.data.enabled))
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <Screen underHeader>
      <Stack.Screen options={{ headerShown: true, title: 'Account settings', headerBackTitle: 'Me' }} />
      <Row label="Change password" onPress={() => router.push('/settings/password')} />
      <Row
        label="Two-step sign-in"
        detail={twoStep === null ? undefined : twoStep ? 'On' : 'Off'}
        onPress={() => router.push('/settings/two-factor')}
      />
      <Row label="Signed-in devices" onPress={() => router.push('/settings/devices')} />
    </Screen>
  );
}

function Row({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.backgroundElement },
        pressed && { opacity: 0.6 },
      ]}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.end}>
        {detail ? <ThemedText themeColor="textSecondary">{detail}</ThemedText> : null}
        <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={14} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1 },
  end: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
