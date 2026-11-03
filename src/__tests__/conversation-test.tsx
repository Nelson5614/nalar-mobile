import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Conversation, { mergeLatest } from '@/app/conversation/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockPickPhoto = jest.fn();
const mockJoinThread = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  // Stable like the real session, so the screen's effect does not re-run each render.
  useSession: () => mockSession,
}));

const mockSession = {
  launch: { route: 'home', config: { realtime: { key: 'k', host: 'nalar.test', port: 8080, scheme: 'http' } } },
};

jest.mock('@/lib/realtime', () => ({ joinThread: (...args: unknown[]) => mockJoinThread(...args) }));

jest.mock('@/lib/chat-media', () => ({
  ...jest.requireActual('@/lib/chat-media'),
  pickPhoto: () => mockPickPhoto(),
  takePhoto: jest.fn(),
  pickDocument: jest.fn(),
  freshLink: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  // The real File is a Blob read from disk; any Blob satisfies FormData here.
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
  reactions: [],
  user: { id: isMine ? 1 : 2, name: isMine ? 'John Fan' : 'Sarah Creator' },
  ...extra,
});

const page = (messages: object[], current = 1, last = 1) => ({
  data: { id: 7, other_user: { id: 2, name: 'Sarah Creator' } },
  messages,
  meta: { current_page: current, last_page: last },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockJoinThread.mockReturnValue({ typing: jest.fn(), leave: jest.fn() });
});

async function openThread(messages: object[]) {
  mockGet.mockResolvedValue(page(messages));
  await render(<Conversation />);
}

describe('<Conversation />', () => {
  test('shows text, photos, voice notes, files, edits and reactions', async () => {
    await openThread([
      message(1, 'Hello', false, { edited: true, reactions: [{ emoji: '❤️', count: 2, mine: true }] }),
      message(2, '', false, { attachment_type: 'image', attachment_url: 'https://nalar.test/f?signature=a' }),
      message(3, '', false, { attachment_type: 'voice', attachment_duration: 7 }),
      message(4, '', true, { attachment_type: 'file', attachment_name: 'invoice.pdf' }),
    ]);

    expect(await screen.findByText('Hello')).toBeTruthy();
    expect(screen.getByText('edited')).toBeTruthy();
    expect(screen.getByText('❤️ 2')).toBeTruthy();
    expect(screen.getByRole('imagebutton', { name: 'Photo' })).toBeTruthy();
    expect(screen.getByText('Voice message · 0:07')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open invoice.pdf' })).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/conversations/7');
  });

  test('sending posts the text, shows the message and clears the box', async () => {
    await openThread([message(1, 'Hello')]);
    mockPost.mockResolvedValue({ data: message(9, 'See you at 6', true) });
    await screen.findByText('Hello');

    await fireEvent.changeText(screen.getByLabelText('Message'), '  See you at 6  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('See you at 6')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/7/messages', {
      body: 'See you at 6',
      reply_to_id: null,
    });
    expect(screen.getByLabelText('Message').props.value).toBe('');
  });

  test('a message the recipient blocks keeps the text and says why', async () => {
    await openThread([]);
    mockPost.mockRejectedValue(
      new ApiError(422, 'That message could not be sent. Please reword it and try again.', {
        body: 'That message could not be sent. Please reword it and try again.',
      }),
    );

    await fireEvent.changeText(await screen.findByLabelText('Message'), 'click scamlink');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('That message could not be sent. Please reword it and try again.')).toBeTruthy();
    expect(screen.getByLabelText('Message').props.value).toBe('click scamlink');
  });

  test('the microphone shows until there is text to send', async () => {
    await openThread([]);

    expect(await screen.findByRole('button', { name: 'Record voice message' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message'), 'hi');
    expect(screen.queryByRole('button', { name: 'Record voice message' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  test('the emoji tray adds an emoji to the message', async () => {
    await openThread([]);
    await fireEvent.changeText(await screen.findByLabelText('Message'), 'Great job ');

    await fireEvent.press(screen.getByRole('button', { name: 'Emoji' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add 🔥' }));

    expect(screen.getByLabelText('Message').props.value).toBe('Great job 🔥');
  });

  test('a long press lets me reply, and the reply is sent with the message', async () => {
    await openThread([message(1, 'Are you around?')]);
    mockPost.mockResolvedValue({ data: message(9, 'Yes', true) });

    await fireEvent(await screen.findByText('Are you around?'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Sarah Creator: Are you around?')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Message'), 'Yes');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/7/messages', { body: 'Yes', reply_to_id: 1 });
    expect(screen.queryByText(/Replying to/)).toBeNull();
  });

  test('reacting from the long-press menu shows the reaction', async () => {
    await openThread([message(1, 'Hello')]);
    mockPut.mockResolvedValue({ data: { reactions: [{ emoji: '😂', count: 1, mine: true }] } });

    await fireEvent(await screen.findByText('Hello'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'React 😂' }));

    expect(mockPut).toHaveBeenCalledWith('/api/v1/messages/1/reaction', { emoji: '😂' });
    expect(await screen.findByText('😂')).toBeTruthy();
  });

  test('tapping my own reaction removes it', async () => {
    await openThread([message(1, 'Hello', false, { reactions: [{ emoji: '👍', count: 1, mine: true }] })]);
    mockDelete.mockResolvedValue({ data: { reactions: [] } });

    await fireEvent.press(await screen.findByRole('button', { name: '👍 1, yours. Tap to remove' }));

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/messages/1/reaction');
    expect(screen.queryByText('👍')).toBeNull();
  });

  test('editing my message saves the new text and marks it edited', async () => {
    await openThread([message(1, 'See you at 5', true)]);
    mockPut.mockResolvedValue({ data: { id: 1, body: 'See you at 6' } });

    await fireEvent(await screen.findByText('See you at 5'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Message').props.value).toBe('See you at 5');

    await fireEvent.changeText(screen.getByLabelText('Message'), 'See you at 6');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(mockPut).toHaveBeenCalledWith('/api/v1/messages/1', { body: 'See you at 6' });
    expect(await screen.findByText('See you at 6')).toBeTruthy();
    expect(screen.getByText('edited')).toBeTruthy();
  });

  test('a long press on a voice note opens the menu instead of playing it', async () => {
    await openThread([message(3, '', true, { attachment_type: 'voice', attachment_duration: 4 })]);

    await fireEvent(await screen.findByRole('button', { name: 'Play voice message' }), 'longPress');

    expect(screen.getByRole('button', { name: 'Unsend' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  test('only my own messages offer edit and unsend', async () => {
    await openThread([message(1, 'Hello')]);

    await fireEvent(await screen.findByText('Hello'), 'longPress');

    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unsend' })).toBeNull();
  });

  test('unsending asks first, then removes the message', async () => {
    await openThread([message(1, 'oops', true)]);
    mockDelete.mockResolvedValue({ success: true });
    const alert = jest.spyOn(Alert, 'alert');

    await fireEvent(await screen.findByText('oops'), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Unsend' }));
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons.find((b) => b.text === 'Unsend')!.onPress!());

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/messages/1');
    expect(screen.queryByText('oops')).toBeNull();
  });

  test('a photo from the library is uploaded as a file', async () => {
    await openThread([]);
    mockPickPhoto.mockResolvedValue({ file: { uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg' } });
    mockPost.mockResolvedValue({ data: message(9, '', true, { attachment_type: 'image', attachment_url: 'x' }) });

    await fireEvent.press(await screen.findByRole('button', { name: 'Attach' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Photo library' }));

    expect(await screen.findByRole('imagebutton', { name: 'Photo' })).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/7/attachments', expect.any(FormData));
  });

  test('a picker problem is shown instead of uploading', async () => {
    await openThread([]);
    mockPickPhoto.mockResolvedValue({ error: 'That file is over 20 MB. Please pick a smaller one.' });

    await fireEvent.press(await screen.findByRole('button', { name: 'Attach' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Photo library' }));

    expect(await screen.findByText('That file is over 20 MB. Please pick a smaller one.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('the other person typing shows, and a live change refetches the thread', async () => {
    await openThread([message(1, 'Hello')]);
    await screen.findByText('Hello');
    const events = mockJoinThread.mock.calls[0][2];

    await act(async () => events.onTyping());
    expect(screen.getByText('Sarah Creator is typing…')).toBeTruthy();

    mockGet.mockResolvedValue(page([message(1, 'Hello'), message(2, 'New one')]));
    await act(async () => events.onChange());
    expect(await screen.findByText('New one')).toBeTruthy();

    await act(async () => events.onDeleted(1));
    expect(screen.queryByText('Hello')).toBeNull();
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

describe('mergeLatest', () => {
  test('replaces changed messages and appends new ones', () => {
    const current = [message(1, 'old'), message(2, 'two')] as never[];
    const latest = [message(2, 'two, edited'), message(3, 'three')] as never[];

    expect(mergeLatest(current, latest).map((m) => m.body)).toEqual(['old', 'two, edited', 'three']);
  });
});
