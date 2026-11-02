import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';

export default function UpdateRequired() {
  return (
    <Screen centered>
      <ThemedText type="subtitle">Update Nalar</ThemedText>
      <ThemedText themeColor="textSecondary">
        This version of the app is no longer supported. Update to the latest version from the store to keep watching.
      </ThemedText>
    </Screen>
  );
}
