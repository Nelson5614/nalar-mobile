import { fireEvent, render, screen } from '@testing-library/react-native';

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

const note = (id: string, message: string, extra: object = {}) => ({
  id,
  type: 'comment_reply',
  message,
  url: null,
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

  test('a video notification is marked read and opens the video', async () => {
    mockGet.mockResolvedValue(feed([note('a', 'New video from Sarah', { url: '/watch/abc123?comment=9' })]));
    await render(<NotificationsList />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unread: New video from Sarah' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/notifications/a/read');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: 'abc123' } });
    expect(await screen.findByRole('button', { name: 'New video from Sarah' })).toBeTruthy();
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
