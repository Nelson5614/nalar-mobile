import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';

/**
 * The launch gate. Every screen that changes who is signed in comes back here
 * and lets resolveLaunch decide where to go, so that decision lives in one place.
 */
export default function Index() {
  const { launch, reload } = useSession();
  const [retrying, setRetrying] = useState(false);

  if (!launch) {
    return (
      <Screen centered>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (launch.route === 'offline') {
    return (
      <Screen centered>
        <ThemedText type="subtitle">Can’t connect</ThemedText>
        <ThemedText themeColor="textSecondary">{launch.message}</ThemedText>
        <Button
          label="Try again"
          busy={retrying}
          onPress={async () => {
            setRetrying(true);
            await reload();
            setRetrying(false);
          }}
        />
      </Screen>
    );
  }

  return <Redirect href={`/${launch.route}`} />;
}
