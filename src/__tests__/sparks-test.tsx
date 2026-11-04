import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import Sparks from '@/app/(tabs)/sparks';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  useSession: () => ({ launch: { route: 'home', me: { id: 2, name: 'John Fan' } } }),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockPlay = jest.fn();
const mockPause = jest.fn();

jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: mockPlay, pause: mockPause }),
  VideoView: () => null,
}));

const spark = (id: number, caption: string, extra: object = {}) => ({
  id,
  caption,
  mux_playback_id: `pb-${id}`,
  thumbnail_url: null,
  creator: { id: 6, name: 'Sarah Creator', profile_photo_url: null },
  view_count: 1200,
  like_count: 12,
  dislike_count: 0,
  comment_count: 3,
  share_count: 1,
  save_count: 2,
  is_liked: false,
  is_disliked: false,
  is_saved: false,
  ...extra,
});

function serve(sparks: object[]) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/api/v1/sparks') return { data: sparks, next_cursor: null };
    if (path === '/api/v1/sparks/1/comments') {
      return {
        comments: [
          {
            id: 70,
            content: 'So good',
            created_at: new Date().toISOString(),
            user: { id: 8, name: 'Mary Viewer' },
            likes_count: 0,
            is_liked: false,
            replies: [],
          },
        ],
        total: 1,
      };
    }
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockPost.mockResolvedValue({});
});

describe('<Sparks />', () => {
  test('shows each Spark with its caption and creator, skipping any without a stream', async () => {
    serve([spark(1, 'First Spark'), spark(2, 'Still encoding', { mux_playback_id: null })]);

    await render(<Sparks />);

    expect(await screen.findByText('First Spark')).toBeTruthy();
    expect(screen.getByText('Sarah Creator')).toBeTruthy();
    expect(screen.queryByText('Still encoding')).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/sparks');
  });

  test('the action rail shows every count, and views sit with the caption', async () => {
    serve([spark(1, 'First Spark')]);

    await render(<Sparks />);

    expect(await screen.findByRole('button', { name: 'Like, 12 likes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dislike' })).toBeTruthy();
    // Icon only: no other button carries a word under it, so dislike does not either.
    expect(screen.queryByText('Dislike')).toBeNull();
    expect(screen.getByRole('button', { name: 'Comments, 3 comments' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save, 2 saves' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share, 1 share' })).toBeTruthy();
    expect(screen.getByText('1.2K views')).toBeTruthy();
  });

  test('watching a Spark counts a view', async () => {
    serve([spark(1, 'First Spark')]);

    await render(<Sparks />);
    await screen.findByText('First Spark');

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/sparks/1/view', { watch_time_seconds: 0 }));
  });

  test('liking takes the count from the server', async () => {
    serve([spark(1, 'First Spark')]);
    mockPost.mockImplementation(async (path: string) =>
      path === '/api/v1/sparks/1/toggle-like'
        ? { action: 'liked', is_liked: true, is_disliked: false, likes_count: 13, dislikes_count: 0 }
        : {},
    );

    await render(<Sparks />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Like, 12 likes' }));

    expect(await screen.findByRole('button', { name: 'Unlike, 13 likes' })).toBeTruthy();
  });

  test('saving keeps the Spark and counts it', async () => {
    serve([spark(1, 'First Spark')]);
    mockPost.mockImplementation(async (path: string) =>
      path === '/api/v1/sparks/1/toggle-save' ? { is_saved: true, save_count: 3 } : {},
    );

    await render(<Sparks />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save, 2 saves' }));

    expect(await screen.findByRole('button', { name: 'Saved, 3 saves' })).toBeTruthy();
  });

  test('sharing hands the link to the share sheet and counts it', async () => {
    serve([spark(1, 'First Spark')]);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    mockPost.mockImplementation(async (path: string) =>
      path === '/api/v1/sparks/1/share' ? { share_url: 'https://nalar.test/sparks/1', share_count: 2 } : {},
    );

    await render(<Sparks />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Share, 1 share' }));

    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'First Spark https://nalar.test/sparks/1' }));
    expect(await screen.findByRole('button', { name: 'Share, 2 shares' })).toBeTruthy();
  });

  test('comments open in a sheet over the Spark, and post to it', async () => {
    serve([spark(1, 'First Spark')]);
    mockPost.mockImplementation(async (path: string, body?: { content: string }) =>
      path === '/api/v1/sparks/1/comments'
        ? { id: 71, content: body?.content, created_at: new Date().toISOString(), user: { id: 2, name: 'John Fan' } }
        : {},
    );

    await render(<Sparks />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Comments, 3 comments' }));

    expect(await screen.findByText('So good')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Add a comment…'), 'Lovely');
    await fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/sparks/1/comments', { content: 'Lovely' });
    expect(await screen.findByText('Lovely')).toBeTruthy();
    // The rail's count follows, without waiting for the next feed load.
    expect(screen.getByRole('button', { name: 'Comments, 4 comments' })).toBeTruthy();
  });

  test('the creator’s photo opens their profile', async () => {
    serve([spark(1, 'First Spark')]);

    await render(<Sparks />);
    await fireEvent.press(await screen.findByRole('link', { name: 'Sarah Creator' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creator/[id]', params: { id: '6' } });
  });

  test('a long caption shows two lines, then opens into a box half the screen tall that scrolls', async () => {
    const long = 'A long caption about light. '.repeat(40).trim();
    serve([spark(1, long)]);

    await render(<Sparks />);

    expect(await screen.findByText(long)).toHaveProp('numberOfLines', 2);
    expect(screen.queryByTestId('caption-scroll')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Show the full caption' }));

    expect(screen.getByText(long)).not.toHaveProp('numberOfLines', 2);
    const box = screen.getByTestId('caption-scroll');
    expect(box).toHaveStyle({ maxHeight: screen.getByTestId('spark-1').props.style.height / 2 });

    await fireEvent.press(screen.getByRole('button', { name: 'Show less of the caption' }));
    expect(screen.getByText(long)).toHaveProp('numberOfLines', 2);
  });

  test('tapping the video pauses it, and tapping again plays it', async () => {
    serve([spark(1, 'First Spark')]);

    await render(<Sparks />);
    await screen.findByText('First Spark');
    mockPlay.mockClear();
    mockPause.mockClear();

    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(mockPause).toHaveBeenCalled();
    expect(screen.getByTestId('paused-icon')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(mockPlay).toHaveBeenCalled();
    expect(screen.queryByTestId('paused-icon')).toBeNull();
  });

  test('a short caption has nothing to open', async () => {
    serve([spark(1, 'Short one')]);

    await render(<Sparks />);

    await screen.findByText('Short one');
    expect(screen.queryByRole('button', { name: 'Show the full caption' })).toBeNull();
  });

  test('one view reads as one view', async () => {
    serve([spark(1, 'First Spark', { view_count: 1 })]);

    await render(<Sparks />);

    expect(await screen.findByText('1 view')).toBeTruthy();
  });

  test('no Sparks yet says so', async () => {
    serve([]);

    await render(<Sparks />);

    expect(await screen.findByText(/No Sparks yet/)).toBeTruthy();
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<Sparks />);

    expect(
      await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.'),
    ).toBeTruthy();
  });
});
