import { fireEvent, render, screen } from '@testing-library/react-native';

import Inbox from '@/app/(tabs)/inbox';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));

const thread = (id: number, name: string, last: object | null, unread = 0) => ({
  id,
  other_user: { id: id + 100, name, profile_photo_url: null },
  last_message: last,
  unread_count: unread,
  last_message_at: '2026-11-02T10:00:00+00:00',
});

beforeEach(() => jest.clearAllMocks());

describe('<Inbox />', () => {
  test('lists each thread with the other person, the last message and unread count', async () => {
    mockGet.mockResolvedValue({
      data: [
        thread(1, 'Sarah Creator', { body: 'See you at 6', is_mine: false, attachment_type: null }, 2),
        thread(2, 'Una', { body: 'Thanks!', is_mine: true, attachment_type: null }),
        thread(3, 'Thabo', { body: '', is_mine: false, attachment_type: 'voice' }),
      ],
      meta: { current_page: 1, last_page: 1 },
    });

    await render(<Inbox />);

    expect(await screen.findByText('Sarah Creator')).toBeTruthy();
    expect(screen.getByText('See you at 6')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('You: Thanks!')).toBeTruthy();
    expect(screen.getByText('Voice message')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/conversations');
  });

  test('opening a thread goes to the conversation', async () => {
    mockGet.mockResolvedValue({ data: [thread(7, 'Sarah Creator', null)], meta: { current_page: 1, last_page: 1 } });
    await render(<Inbox />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Sarah Creator' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation/[id]', params: { id: '7' } });
  });

  test('no threads yet says so', async () => {
    mockGet.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1 } });

    await render(<Inbox />);

    expect(await screen.findByText(/No messages yet/)).toBeTruthy();
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<Inbox />);

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
