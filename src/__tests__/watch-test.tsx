import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';

import Watch from '@/app/watch/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReload = jest.fn();
const mockOpenBrowser = jest.fn();
const mockDelete = jest.fn();
let mockBalance = 1000;

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  useSession: () => ({
    launch: {
      route: 'home',
      config: { top_up: { url: 'http://nalar.test/credits', link_enabled: { ios: true, android: true } } },
      me: { id: 2, name: 'John Fan', watermark_tag: 'E7A8-9D0A', credit_balance: mockBalance },
    },
    reload: (...args: unknown[]) => mockReload(...args),
  }),
}));

jest.mock('@/lib/config', () => ({ PLATFORM: 'ios', API_URL: 'http://nalar.test' }));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { id: '4' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('@/components/protected-video', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      url,
      protect,
      watermark,
      onEnd,
    }: {
      url: string;
      protect: boolean;
      watermark?: string;
      onEnd?: () => void;
    }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="finish video" onPress={onEnd}>
        <Text>{`playing ${url} protect=${protect} mark=${watermark ?? ''}`}</Text>
      </Pressable>
    ),
  };
});

const detail = (extra: object = {}) => ({
  id: 4,
  title: 'Masterclass',
  description: 'The full session.',
  creator: { id: 6, name: 'Sarah Creator' },
  requires_payment: false,
  is_unlocked: false,
  viewer_is_creator: false,
  playback_pending: false,
  mux_playback_id: 'pb-1',
  required_credits: 0,
  ...extra,
});

const locked = detail({ requires_payment: true, required_credits: 30 });

function respond(media: object | (() => object), token?: object) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/api/v1/media/4') return typeof media === 'function' ? media() : media;
    if (path === '/api/v1/media/4/playback-token' && token) return token;
    throw new Error(`unexpected ${path}`);
  });
}

function confirmEveryAlert() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockBalance = 1000;
  mockParams = { id: '4' };
});

describe('<Watch /> inside a series', () => {
  const playlist = {
    data: {
      id: 9,
      title: 'Lighting basics',
      creator: { id: 6, public_id: 'c6', name: 'Sarah Creator' },
      viewer_is_creator: false,
      media: [
        {
          id: 4,
          title: 'Part 1',
          views: 2,
          requires_payment: false,
          current_user_can_play: true,
          playback_pending: false,
        },
        {
          id: 5,
          title: 'Part 2',
          views: 0,
          requires_payment: false,
          current_user_can_play: true,
          playback_pending: false,
        },
      ],
    },
  };

  beforeEach(() => {
    mockParams = { id: '4', series: '9' };
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/media/4') return detail({ title: 'Part 1' });
      if (path === '/api/v1/series/9') return playlist;
      throw new Error(`unexpected ${path}`);
    });
  });

  test('shows the series under the player with where this video sits in it', async () => {
    await render(<Watch />);

    expect(await screen.findByText('Sarah Creator · 1 / 2')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Lighting basics' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Part 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Now playing Part 1' })).toBeTruthy();
  });

  test('choosing another video stays in the series', async () => {
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Play Part 2' }));

    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: '5', series: '9' } });
  });

  test('when a video ends, the next one in the series plays', async () => {
    await render(<Watch />);
    await screen.findByText('Sarah Creator · 1 / 2');

    await fireEvent.press(await screen.findByRole('button', { name: 'finish video' }));

    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: '5', series: '9' } });
  });
});

describe('<Watch />', () => {
  test('a free video plays without protection', async () => {
    respond(detail());

    await render(<Watch />);

    expect(
      await screen.findByText('playing https://stream.mux.com/pb-1.m3u8 protect=false mark=E7A8-9D0A'),
    ).toBeTruthy();
    expect(screen.getByText('Masterclass')).toBeTruthy();
    expect(screen.getByText('Sarah Creator')).toBeTruthy();
  });

  test('an unlocked paid video plays protected, with the viewer’s watermark', async () => {
    respond(detail({ requires_payment: true, is_unlocked: true }), { playback_token: 'tok-9' });

    await render(<Watch />);

    expect(
      await screen.findByText('playing https://stream.mux.com/pb-1.m3u8?token=tok-9 protect=true mark=E7A8-9D0A'),
    ).toBeTruthy();
  });

  test('a locked paid video shows its price and the viewer’s balance instead of a player', async () => {
    respond(locked);

    await render(<Watch />);

    expect(await screen.findByText('Unlock this video for 30 credits.')).toBeTruthy();
    expect(screen.getByText('You have 1000 credits.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock for 30 credits' })).toBeTruthy();
    expect(screen.queryByText(/^playing/)).toBeNull();
  });

  test('unlocking asks first, spends the credits, refreshes the balance and plays', async () => {
    let unlocked = false;
    respond(() => (unlocked ? detail({ requires_payment: true, is_unlocked: true }) : locked), {
      playback_token: 'tok-9',
    });
    mockPost.mockImplementation(async () => {
      unlocked = true;
      return { message: 'Content unlocked successfully.', credits_remaining: 970 };
    });
    confirmEveryAlert();
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unlock for 30 credits' }));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unlock this video?',
      'This uses 30 of your 1000 credits.',
      expect.any(Array),
    );
    expect(
      await screen.findByText('playing https://stream.mux.com/pb-1.m3u8?token=tok-9 protect=true mark=E7A8-9D0A'),
    ).toBeTruthy();
    // Once only: opening the video afterwards also counts a view.
    expect(mockPost.mock.calls.filter(([path]) => path === '/api/v1/content/4/unlock')).toHaveLength(1);
    expect(mockReload).toHaveBeenCalled();
  });

  test('cancelling the confirmation spends nothing', async () => {
    respond(locked);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'cancel')?.onPress?.();
    });
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unlock for 30 credits' }));

    expect(mockPost).not.toHaveBeenCalled();
  });

  test('too few credits offers a top-up on the web instead of an unlock', async () => {
    mockBalance = 10;
    respond(locked);
    await render(<Watch />);

    expect(await screen.findByText('You need 20 more credits to unlock it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock for 30 credits' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Buy credits' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith('http://nalar.test/credits');
    expect(mockPost).not.toHaveBeenCalled();
  });

  test('a refused unlock shows the server’s message and keeps the video locked', async () => {
    respond(locked);
    mockPost.mockRejectedValue(new ApiError(400, 'You do not have enough credits to unlock this content.'));
    confirmEveryAlert();
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Unlock for 30 credits' }));

    expect(await screen.findByText('You do not have enough credits to unlock this content.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Unlock this video for 30 credits.')).toBeTruthy());
    expect(mockReload).not.toHaveBeenCalled();
  });

  test('messaging the creator opens the conversation with them', async () => {
    respond(detail());
    mockPost.mockResolvedValue({ data: { id: 12 } });
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Message' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/start/6');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation/[id]', params: { id: '12' } });
  });

  test('the creator’s name opens their profile', async () => {
    respond(detail({ creator: { id: 6, public_id: 'c6', name: 'Sarah Creator' } }));
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('link', { name: 'Sarah Creator' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creator/[id]', params: { id: 'c6' } });
  });

  test('a video locked by its bundle sends the fan to the series instead of a per-video unlock', async () => {
    respond(
      detail({
        requires_payment: true,
        required_credits: 0,
        series_paywall: { id: 9, title: 'Advanced lighting', bundle_price_credits: 40 },
      }),
    );
    await render(<Watch />);

    expect(await screen.findByText('Part of Advanced lighting. Unlock the series for 40 credits.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Unlock for/ })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'See the series' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/series/[id]', params: { id: '9' } });
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<Watch />);

    expect(
      await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.'),
    ).toBeTruthy();
  });
});

describe('<Watch /> laid out like YouTube', () => {
  const comment = (extra: object = {}) => ({
    id: 30,
    content: 'Great lighting.',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    user: { id: 8, name: 'Mary Viewer', profile_photo_url: null },
    likes_count: 2,
    liked_by_me: false,
    replies_count: 1,
    replies: [
      {
        id: 31,
        content: 'Thank you!',
        created_at: new Date().toISOString(),
        user: { id: 6, name: 'Sarah Creator', profile_photo_url: null },
      },
    ],
    ...extra,
  });

  const video = (extra: object = {}) =>
    detail({
      title: 'Welcome to Nalar',
      description: 'A quick look around the studio, the lights and the desk.',
      views: 12,
      created_at: '2026-11-02T10:00:00+00:00',
      likes_count: 5,
      is_liked: false,
      creator: { id: 6, public_id: 'c6', name: 'Sarah Creator', profile_photo_url: null, subscribers_count: 3 },
      ...extra,
    });

  const related = [
    {
      id: 7,
      public_id: 'v7',
      title: 'Colour grading',
      views: 4,
      created_at: '2026-11-01T10:00:00+00:00',
      thumbnail_url: null,
      requires_payment: true,
      is_unlocked: false,
      required_credits: 25,
      creator: { id: 6, name: 'Sarah Creator' },
    },
  ];

  function serve(media: object = video(), comments: object[] = [comment()], subscribed = false) {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/media/4') return media;
      if (path === '/api/v1/media/4/comments')
        return { comments, total: comments.length, current_page: 1, last_page: 1 };
      if (path === '/api/v1/media/4/related') return related;
      if (path === '/api/v1/subscription/check?creator_id=6') return { is_subscribed: subscribed };
      throw new Error(`unexpected ${path}`);
    });
  }

  test('title, views and date, the channel with its subscribers, and the action row', async () => {
    serve();
    await render(<Watch />);

    expect(await screen.findByText('Welcome to Nalar')).toBeTruthy();
    expect(screen.getByText('12 views · Nov 2, 2026')).toBeTruthy();
    expect(screen.getByText('3 subscribers')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Subscribe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Like, 5 likes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/media/4/track-view');
  });

  test('subscribing follows the creator, and pressing again unfollows', async () => {
    serve();
    mockPost.mockResolvedValue({});
    mockDelete.mockResolvedValue({});
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Subscribe' }));
    expect(mockPost).toHaveBeenCalledWith('/api/v1/subscriptions', { creator_id: 6 });
    expect(await screen.findByText('4 subscribers')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Subscribed' }));
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/subscriptions?creator_id=6');
    expect(await screen.findByRole('button', { name: 'Subscribe' })).toBeTruthy();
  });

  test('your own video has no subscribe button', async () => {
    serve(video({ creator: { id: 2, name: 'John Fan', subscribers_count: 0 } }));
    await render(<Watch />);

    await screen.findByText('Welcome to Nalar');
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
  });

  test('liking counts up and fills in, as the server says', async () => {
    serve();
    mockPost.mockImplementation(async (path: string) =>
      path === '/api/v1/media/4/toggle-like' ? { action: 'liked', likes_count: 6 } : {},
    );
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Like, 5 likes' }));

    expect(await screen.findByRole('button', { name: 'Unlike, 6 likes' })).toBeTruthy();
  });

  test('share hands the link to the phone’s share sheet', async () => {
    serve();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    mockPost.mockImplementation(async (path: string) =>
      path === '/api/v1/media/4/share' ? { share_url: 'https://nalar.test/watch/v4' } : {},
    );
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ message: 'Welcome to Nalar https://nalar.test/watch/v4' }),
    );
  });

  test('the description opens out', async () => {
    serve();
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Show more of the description' }));

    expect(screen.getByRole('button', { name: 'Show less of the description' })).toBeTruthy();
  });

  test('comments show who said what, when, with likes and replies', async () => {
    serve();
    await render(<Watch />);

    expect(await screen.findByText('Comments')).toBeTruthy();
    expect(screen.getByText('Great lighting.')).toBeTruthy();
    expect(screen.getByText('Mary Viewer · 5 minutes ago')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Like comment by Mary Viewer, 2 likes' })).toBeTruthy();
    expect(screen.queryByText('Thank you!')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: '1 reply' }));

    expect(screen.getByText('Thank you!')).toBeTruthy();
  });

  test('a new comment posts and appears at the top', async () => {
    serve();
    mockPost.mockImplementation(async (path: string, body?: { content: string }) =>
      path === '/api/v1/media/4/comments'
        ? {
            id: 40,
            content: body?.content,
            created_at: new Date().toISOString(),
            user: { id: 2, name: 'John Fan', profile_photo_url: null },
          }
        : {},
    );
    await render(<Watch />);

    await fireEvent.changeText(await screen.findByPlaceholderText('Add a comment…'), 'Lovely work');
    await fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/media/4/comments', { content: 'Lovely work' });
    expect(await screen.findByText('Lovely work')).toBeTruthy();
  });

  test('replying sends the comment it answers', async () => {
    serve();
    mockPost.mockImplementation(async (path: string, body?: { content: string }) =>
      path === '/api/v1/media/4/comments'
        ? { id: 41, content: body?.content, created_at: new Date().toISOString(), user: { id: 2, name: 'John Fan' } }
        : {},
    );
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Reply to Mary Viewer' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Reply to Mary Viewer…'), 'Agreed');
    await fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/media/4/comments', { content: 'Agreed', parent_id: 30 });
    expect(await screen.findByText('Agreed')).toBeTruthy();
  });

  test('a comment the creator’s filter blocks shows why', async () => {
    serve();
    mockPost.mockImplementation(async (path: string) => {
      if (path === '/api/v1/media/4/comments') {
        throw new ApiError(403, 'Your comment was blocked by this creator’s filters.');
      }
      return {};
    });
    await render(<Watch />);

    await fireEvent.changeText(await screen.findByPlaceholderText('Add a comment…'), 'nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));

    expect(await screen.findByText('Your comment was blocked by this creator’s filters.')).toBeTruthy();
  });

  test('liking a comment fills its heart', async () => {
    serve();
    mockPost.mockImplementation(async (path: string) =>
      path === '/api/v1/comments/30/toggle-like' ? { action: 'liked', likes_count: 3 } : {},
    );
    await render(<Watch />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Like comment by Mary Viewer, 2 likes' }));

    expect(await screen.findByRole('button', { name: 'Unlike comment by Mary Viewer, 3 likes' })).toBeTruthy();
  });

  test('no comments yet invites the first one', async () => {
    serve(video(), []);
    await render(<Watch />);

    expect(await screen.findByText('No comments yet. Be the first to say something.')).toBeTruthy();
  });

  test('up next lists more videos, with the lock and price on premium ones', async () => {
    serve();
    await render(<Watch />);

    expect(await screen.findByText('Up next')).toBeTruthy();
    expect(screen.getByText('Colour grading')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 4 views · Nov 1, 2026')).toBeTruthy();
    expect(screen.getByText('25 credits')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Colour grading' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: 'v7' } });
  });
});
