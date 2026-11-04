import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import CircleChat from '@/app/circle/chat';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockPickPhoto = jest.fn();
const mockJoin = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  useSession: () => mockSession,
}));

const mockSession = {
  launch: {
    route: 'home',
    config: { realtime: { key: 'k', host: 'nalar.test', port: 8080, scheme: 'http' } },
    me: { id: 2, name: 'John Fan' },
  },
};

jest.mock('@/lib/realtime', () => ({ joinCircleThread: (...args: unknown[]) => mockJoin(...args) }));

jest.mock('@/lib/chat-media', () => ({
  ...jest.requireActual('@/lib/chat-media'),
  pickPhoto: () => mockPickPhoto(),
  takePhoto: jest.fn(),
  pickDocument: jest.fn(),
  freshLink: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: class extends Blob {
    constructor() {
      super(['file contents']);
    }
  },
}));

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: () => ({ prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }),
  useAudioRecorderState: () => ({ durationMillis: 0 }),
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), replace: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0, didJustFinish: false }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '11', title: 'Lighting club' }),
  Stack: { Screen: () => null },
}));

const sarah = { id: 6, name: 'Sarah Creator', profile_photo_url: null };
const amy = { id: 8, name: 'Amy Member', profile_photo_url: null };
const john = { id: 2, name: 'John Fan', profile_photo_url: null };

const message = (id: number, body: string, from = sarah, extra: object = {}) => ({
  id,
  body,
  is_mine: from.id === john.id,
  created_at: '2026-11-04T10:00:00+00:00',
  attachment_type: null,
  reply_to: null,
  reactions: [],
  user: from,
  ...extra,
});

const page = (messages: object[], current = 1, last = 1) => ({
  data: { id: 11, title: 'Lighting club' },
  messages,
  meta: { current_page: current, last_page: last },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockJoin.mockReturnValue({ typing: jest.fn(), leave: jest.fn() });
});

async function openChat(messages: object[]) {
  mockGet.mockResolvedValue(page(messages));
  await render(<CircleChat />);
}

describe('the circle chat', () => {
  test('shows text, photos, voice notes, files, edits and reactions, with who said each', async () => {
    await openChat([
      message(1, 'Welcome in.', sarah, { edited: true, reactions: [{ emoji: '🔥', count: 3, mine: false }] }),
      message(2, 'Thanks!', amy),
      message(3, '', amy, { attachment_type: 'image', attachment_url: 'https://nalar.test/f?signature=a' }),
      message(4, '', sarah, { attachment_type: 'voice', attachment_duration: 9 }),
      message(5, '', john, { attachment_type: 'file', attachment_name: 'notes.pdf' }),
    ]);

    expect(await screen.findByText('Welcome in.')).toBeTruthy();
    expect(screen.getByText('edited')).toBeTruthy();
    expect(screen.getByText('🔥 3')).toBeTruthy();
    expect(screen.getByRole('imagebutton', { name: 'Photo' })).toBeTruthy();
    expect(screen.getByText('Voice message · 0:09')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open notes.pdf' })).toBeTruthy();
    // A group chat names the sender at the start of each run of theirs, never me.
    expect(screen.getAllByText('Sarah Creator')).toHaveLength(2);
    expect(screen.getAllByText('Amy Member')).toHaveLength(1);
    expect(screen.queryByText('John Fan')).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/circles/11/thread');
  });

  test('sending posts to the circle and shows the message', async () => {
    await openChat([message(1, 'Welcome in.')]);
    mockPost.mockResolvedValue({ data: message(9, 'Hello all', john) });

    await fireEvent.changeText(await screen.findByPlaceholderText('Message the circle'), 'Hello all');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/circles/11/thread/messages', {
      body: 'Hello all',
      reply_to_id: null,
    });
    expect(await screen.findByText('Hello all')).toBeTruthy();
  });

  test('a paused member reads but is told why they cannot post', async () => {
    await openChat([message(1, 'Welcome in.')]);
    mockPost.mockRejectedValue(new ApiError(403, 'Your membership is paused. Top up credits to post in this chat.'));

    await fireEvent.changeText(await screen.findByLabelText('Message'), 'Hi');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Your membership is paused. Top up credits to post in this chat.')).toBeTruthy();
  });

  test('a long press replies to someone, and the reply is sent with it', async () => {
    await openChat([message(1, 'Who is coming Friday?', amy)]);
    mockPost.mockResolvedValue({ data: message(9, 'Me', john) });

    await fireEvent(await screen.findByText('Who is coming Friday?'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Amy Member: Who is coming Friday?')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Message'), 'Me');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/circles/11/thread/messages', { body: 'Me', reply_to_id: 1 });
  });

  test('reacting goes to the circle message', async () => {
    await openChat([message(1, 'Welcome in.')]);
    mockPut.mockResolvedValue({ data: { reactions: [{ emoji: '❤️', count: 1, mine: true }] } });

    await fireEvent(await screen.findByText('Welcome in.'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'React ❤️' }));

    expect(mockPut).toHaveBeenCalledWith('/api/v1/circle-messages/1/reaction', { emoji: '❤️' });
    expect(await screen.findByText('❤️')).toBeTruthy();
  });

  test('editing my message saves it and marks it edited', async () => {
    await openChat([message(1, 'See you at 5', john)]);
    mockPut.mockResolvedValue({ data: { id: 1, body: 'See you at 6' } });

    await fireEvent(await screen.findByText('See you at 5'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(screen.getByLabelText('Message'), 'See you at 6');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockPut).toHaveBeenCalledWith('/api/v1/circle-messages/1', { body: 'See you at 6' });
    expect(await screen.findByText('See you at 6')).toBeTruthy();
    expect(screen.getByText('edited')).toBeTruthy();
  });

  test('unsending says it goes for everyone in the circle, then removes it', async () => {
    await openChat([message(1, 'oops', john)]);
    mockDelete.mockResolvedValue({ message: 'Message deleted.' });
    const alert = jest.spyOn(Alert, 'alert');

    await fireEvent(await screen.findByText('oops'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Unsend' }));
    expect(alert.mock.calls[0][1]).toBe('It will be removed for everyone in the circle.');
    await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === 'Unsend')!.onPress!());

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/circle-messages/1');
    expect(screen.queryByText('oops')).toBeNull();
  });

  test('a photo is uploaded to the circle', async () => {
    await openChat([]);
    mockPickPhoto.mockResolvedValue({ file: { uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg' } });
    mockPost.mockResolvedValue({ data: message(9, '', john, { attachment_type: 'image', attachment_url: 'x' }) });

    await fireEvent.press(await screen.findByRole('button', { name: 'Attach' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Photo library' }));

    expect(await screen.findByRole('imagebutton', { name: 'Photo' })).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/circles/11/thread/attachments', expect.any(FormData));
  });

  test('live: who is typing shows by name, and changes and unsends arrive', async () => {
    await openChat([message(1, 'Welcome in.')]);
    await screen.findByText('Welcome in.');
    const [, circleId, myName, events] = mockJoin.mock.calls[0];
    expect([circleId, myName]).toEqual(['11', 'John Fan']);

    await act(async () => events.onTyping('Amy Member'));
    expect(screen.getByText('Amy Member is typing…')).toBeTruthy();

    mockGet.mockResolvedValue(page([message(1, 'Welcome in.'), message(2, 'New one', amy)]));
    await act(async () => events.onChange());
    expect(await screen.findByText('New one')).toBeTruthy();

    await act(async () => events.onDeleted(1));
    expect(screen.queryByText('Welcome in.')).toBeNull();
  });

  test('scrolling back loads older messages', async () => {
    mockGet
      .mockResolvedValueOnce(page([message(21, 'newer')], 1, 2))
      .mockResolvedValueOnce(page([message(1, 'older')], 2, 2));
    await render(<CircleChat />);
    await screen.findByText('newer');

    await fireEvent(screen.getByTestId('thread'), 'onEndReached');

    expect(await screen.findByText('older')).toBeTruthy();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/circles/11/thread?page=2');
  });

  test('an empty chat invites the first message', async () => {
    await openChat([]);

    expect(await screen.findByText('No messages yet. Say hello.')).toBeTruthy();
  });
});
