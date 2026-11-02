import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';

export default function Welcome() {
  return (
    <Screen centered>
      <ThemedText type="title" themeColor="primary">
        Nalar
      </ThemedText>
      <ThemedText themeColor="textSecondary">
        Videos, sparks, circles and consultations from the creators you follow.
      </ThemedText>
      <Button label="Sign in" onPress={() => router.push('/sign-in')} />
    </Screen>
  );
}
