import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { refreshUnread, useUnreadCount } from '@/lib/unread';

const mockGet = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

function Badge() {
  return <Text>{`unread ${useUnreadCount()}`}</Text>;
}

const counts = (notifications: number, messages: number) =>
  mockGet.mockImplementation((path: string) =>
    Promise.resolve({ count: path.includes('notifications') ? notifications : messages }),
  );

beforeEach(() => jest.clearAllMocks());

describe('useUnreadCount', () => {
  test('adds unread notifications and unread messages', async () => {
    counts(3, 2);

    await render(<Badge />);

    expect(await screen.findByText('unread 5')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/notifications/unread-count');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/conversations/unread-count');
  });

  test('reading something elsewhere in the app updates the count straight away', async () => {
    counts(3, 2);
    await render(<Badge />);
    await screen.findByText('unread 5');

    counts(0, 2);
    await act(async () => refreshUnread());

    expect(await screen.findByText('unread 2')).toBeTruthy();
  });

  test('a failed check keeps the count it had', async () => {
    counts(1, 0);
    await render(<Badge />);
    await screen.findByText('unread 1');

    mockGet.mockRejectedValue(new Error('offline'));
    await act(async () => refreshUnread());

    expect(screen.getByText('unread 1')).toBeTruthy();
  });
});
