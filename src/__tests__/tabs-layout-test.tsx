import { render } from '@testing-library/react-native';

import TabsLayout from '@/app/(tabs)/_layout';

let mockUnread = 0;
const mockScreens: Record<string, { tabBarBadge?: string | number }> = {};

jest.mock('@/lib/unread', () => ({ useUnreadCount: () => mockUnread }));

jest.mock('@/lib/session', () => ({
  useSession: () => ({ launch: { route: 'home', config: { features: {} } } }),
}));

jest.mock('expo-router', () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => children;
  Tabs.Screen = function Screen({ name, options }: { name: string; options: object }) {
    mockScreens[name] = options;
    return null;
  };
  return { Tabs, Redirect: () => null };
});

describe('the tab bar', () => {
  test.each([
    [0, undefined],
    [4, 4],
    [150, '99+'],
  ])('with %i unread, the Inbox badge shows %p', async (unread, badge) => {
    mockUnread = unread;

    await render(<TabsLayout />);

    expect(mockScreens.inbox.tabBarBadge).toBe(badge);
    expect(mockScreens.home.tabBarBadge).toBeUndefined();
  });
});
