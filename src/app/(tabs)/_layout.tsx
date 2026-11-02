import { Redirect, Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';

function TabIcon({ name, color }: { name: SymbolViewProps['name']; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color} size={24} />;
}

export default function TabsLayout() {
  const { launch } = useSession();
  const theme = useTheme();

  // The tabs are the signed-in app. Anyone else goes back through the launch gate.
  if (launch?.route !== 'home') return <Redirect href="/" />;

  const sparksOn = launch.config.features?.sparks !== false;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.primary }}>
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon name="house.fill" color={color} /> }}
      />
      <Tabs.Screen
        name="sparks"
        options={{
          title: 'Sparks',
          tabBarIcon: ({ color }) => <TabIcon name="bolt.fill" color={color} />,
          href: sparksOn ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <TabIcon name="bubble.left.and.bubble.right.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: 'Me', tabBarIcon: ({ color }) => <TabIcon name="person.crop.circle" color={color} /> }}
      />
    </Tabs>
  );
}
