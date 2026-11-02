import { fireEvent, render, screen } from '@testing-library/react-native';

import Conversation from '@/app/conversation/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  Stack: { Screen: () => null },
}));

const message = (id: number, body: string, isMine = false, extra: object = {}) => ({
  id,
  body,
  is_mine: isMine,
  created_at: '2026-11-02T10:00:00+00:00',
  attachment_type: null,
  reply_to: null,
  user: { id: isMine ? 1 : 2, name: isMine ? 'John Fan' : 'Sarah Creator' },
  ...extra,
});

const page = (messages: object[], current = 1, last = 1) => ({
  data: { id: 7, other_user: { id: 2, name: 'Sarah Creator' } },
  messages,
  meta: { current_page: current, last_page: last },
});

beforeEach(() => jest.clearAllMocks());

describe('<Conversation />', () => {
  test('shows the thread, with voice notes labelled', async () => {
    mockGet.mockResolvedValue(
      page([message(1, 'Hello'), message(2, 'Hi Sarah', true), message(3, '', false, { attachment_type: 'voice' })]),
    );

    await render(<Conversation />);

    expect(await screen.findByText('Hello')).toBeTruthy();
    expect(screen.getByText('Hi Sarah')).toBeTruthy();
    expect(screen.getByText('Voice message')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/conversations/7');
  });

  test('sending posts the text, shows the message and clears the box', async () => {
    mockGet.mockResolvedValue(page([message(1, 'Hello')]));
    mockPost.mockResolvedValue({ data: message(9, 'See you at 6', true) });
    await render(<Conversation />);
    await screen.findByText('Hello');

    await fireEvent.changeText(screen.getByLabelText('Message'), '  See you at 6  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('See you at 6')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/7/messages', { body: 'See you at 6' });
    expect(screen.getByLabelText('Message').props.value).toBe('');
  });

  test('a message the recipient blocks keeps the text and says why', async () => {
    mockGet.mockResolvedValue(page([]));
    mockPost.mockRejectedValue(
      new ApiError(422, 'That message could not be sent. Please reword it and try again.', {
        body: 'That message could not be sent. Please reword it and try again.',
      }),
    );
    await render(<Conversation />);

    await fireEvent.changeText(await screen.findByLabelText('Message'), 'click scamlink');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('That message could not be sent. Please reword it and try again.')).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('click scamlink');
  });

  test('scrolling back loads older messages', async () => {
    mockGet
      .mockResolvedValueOnce(page([message(21, 'newer')], 1, 2))
      .mockResolvedValueOnce(page([message(1, 'older')], 2, 2));
    await render(<Conversation />);
    await screen.findByText('newer');

    await fireEvent(screen.getByTestId('thread'), 'onEndReached');

    expect(await screen.findByText('older')).toBeTruthy();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/conversations/7?page=2');
  });
});
