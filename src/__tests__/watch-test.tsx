import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Watch from '@/app/watch/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReload = jest.fn();
const mockOpenBrowser = jest.fn();
let mockBalance = 1000;

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  useSession: () => ({
    launch: {
      route: 'home',
      config: { top_up: { url: 'http://nalar.test/credits', link_enabled: { ios: true, android: true } } },
      me: { watermark_tag: 'E7A8-9D0A', credit_balance: mockBalance },
    },
    reload: (...args: unknown[]) => mockReload(...args),
  }),
}));

jest.mock('@/lib/config', () => ({ PLATFORM: 'ios', API_URL: 'http://nalar.test' }));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '4' }),
  Stack: { Screen: () => null },
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('@/components/protected-video', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ url, protect, watermark }: { url: string; protect: boolean; watermark?: string }) => (
      <Text>{`playing ${url} protect=${protect} mark=${watermark ?? ''}`}</Text>
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
});

describe('<Watch />', () => {
  test('a free video plays without protection', async () => {
    respond(detail());

    await render(<Watch />);

    expect(await screen.findByText('playing https://stream.mux.com/pb-1.m3u8 protect=false mark=E7A8-9D0A')).toBeTruthy();
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

    expect(Alert.alert).toHaveBeenCalledWith('Unlock this video?', 'This uses 30 of your 1000 credits.', expect.any(Array));
    expect(
      await screen.findByText('playing https://stream.mux.com/pb-1.m3u8?token=tok-9 protect=true mark=E7A8-9D0A'),
    ).toBeTruthy();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/api/v1/content/4/unlock');
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

    await fireEvent.press(await screen.findByRole('button', { name: 'Message Sarah Creator' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/start/6');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation/[id]', params: { id: '12' } });
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<Watch />);

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
