import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import NotificationsList from '@/components/notifications-list';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockRefreshUnread = jest.fn();
jest.mock('@/lib/unread', () => ({ refreshUnread: () => mockRefreshUnread() }));

const note = (id: string, message: string, extra: object = {}) => ({
  id,
  type: 'comment_reply',
  message,
  url: null,
  target: null,
  image_url: null,
  read: false,
  created_at: '2026-11-02T10:00:00+00:00',
  ...extra,
});

const feed = (data: object[], unread = data.length) => ({
  data,
  meta: { current_page: 1, last_page: 1, unread_count: unread },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue(undefined);
});

describe('<NotificationsList />', () => {
  test("each row leads with the person's photo, or a bell when there is no person", async () => {
    mockGet.mockResolvedValue(
      feed([
        note('a', 'Sarah replied to your comment', { image_url: 'https://nalar.test/sarah.jpg' }),
        note('b', 'You earned a badge'),
      ]),
    );

    await render(<NotificationsList />);
    await screen.findByText('Sarah replied to your comment');

    // expo-image hands its native view a list of sources.
    expect(screen.getByTestId('notification-photo-a').props.source).toEqual([
      expect.objectContaining({ uri: 'https://nalar.test/sarah.jpg' }),
    ]);
    expect(screen.queryByTestId('notification-photo-b')).toBeNull();
    expect(screen.getByTestId('notification-icon-b')).toBeTruthy();
  });

  test('lists notifications and marks the unread ones', async () => {
    mockGet.mockResolvedValue(
      feed([note('a', 'Sarah replied to your comment'), note('b', 'You earned a badge', { read: true })], 1),
    );

    await render(<NotificationsList />);

    expect(await screen.findByText('Sarah replied to your comment')).toBeTruthy();
    expect(screen.getByText('You earned a badge')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unread: Sarah replied to your comment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'You earned a badge' })).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/notifications');
  });

  test('a video notification is marked read, opens the video and refreshes the unread badge', async () => {
    mockGet.mockResolvedValue(feed([note('a', 'New video from Sarah', { target: { screen: 'watch', id: 'abc123' } })]));
    await render(<NotificationsList />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unread: New video from Sarah' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/notifications/a/read');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: 'abc123' } });
    expect(await screen.findByRole('button', { name: 'New video from Sarah' })).toBeTruthy();
    await waitFor(() => expect(mockRefreshUnread).toHaveBeenCalled());
  });

  test.each([
    [
      { screen: 'conversation', id: '12' },
      { pathname: '/conversation/[id]', params: { id: '12' } },
    ],
    [
      { screen: 'circle', id: '4' },
      { pathname: '/circle/[id]', params: { id: '4' } },
    ],
    [
      { screen: 'creator', id: 'c6' },
      { pathname: '/creator/[id]', params: { id: 'c6' } },
    ],
    [{ screen: 'consultations', id: null }, '/consultations/mine'],
    [{ screen: 'library', id: null }, '/library'],
  ])('a notification for %j opens that screen', async (target, route) => {
    mockGet.mockResolvedValue(feed([note('a', 'Open me', { target })]));
    await render(<NotificationsList />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unread: Open me' }));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  test('a screen this version of the app does not know opens nothing', async () => {
    mockGet.mockResolvedValue(feed([note('a', 'From the future', { target: { screen: 'studio', id: '1' } })]));
    await render(<NotificationsList />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unread: From the future' }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  test('each row says how long ago it arrived', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    mockGet.mockResolvedValue(feed([note('a', 'Sarah replied to your comment', { created_at: threeHoursAgo })]));

    await render(<NotificationsList />);

    expect(await screen.findByText('3 hours ago')).toBeTruthy();
  });

  test('scrolling down loads older notifications', async () => {
    mockGet
      .mockResolvedValueOnce({ data: [note('a', 'Newest')], meta: { current_page: 1, last_page: 2, unread_count: 2 } })
      .mockResolvedValueOnce({ data: [note('b', 'Older')], meta: { current_page: 2, last_page: 2, unread_count: 2 } });
    await render(<NotificationsList />);
    await screen.findByText('Newest');

    await fireEvent(screen.getByTestId('notifications'), 'onEndReached');

    expect(await screen.findByText('Older')).toBeTruthy();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/notifications?page=2');
  });

  test('a notification the app cannot open yet is only marked read', async () => {
    mockGet.mockResolvedValue(feed([note('a', 'You earned a badge', { url: '/badges/trusted' })]));
    await render(<NotificationsList />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unread: You earned a badge' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/notifications/a/read');
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('mark all as read clears every unread one', async () => {
    mockGet.mockResolvedValue(feed([note('a', 'One'), note('b', 'Two')]));
    await render(<NotificationsList />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Mark all as read' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/notifications/read-all');
    await waitFor(() => expect(mockRefreshUnread).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'One' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Two' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
  });

  test('no notifications yet says so', async () => {
    mockGet.mockResolvedValue(feed([]));

    await render(<NotificationsList />);

    expect(await screen.findByText(/No notifications yet/)).toBeTruthy();
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<NotificationsList />);

    expect(
      await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.'),
    ).toBeTruthy();
  });
});
