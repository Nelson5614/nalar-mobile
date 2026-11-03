import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SeriesScreen from '@/app/series/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockReload = jest.fn();
const mockPush = jest.fn();
const mockOpenBrowser = jest.fn();
let mockBalance = 100;

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  useSession: () => ({
    launch: {
      route: 'home',
      config: { top_up: { url: 'http://nalar.test/credits', link_enabled: { ios: true, android: true } } },
      me: { id: 2, credit_balance: mockBalance },
    },
    reload: (...args: unknown[]) => mockReload(...args),
  }),
}));

jest.mock('@/lib/config', () => ({ PLATFORM: 'ios', API_URL: 'http://nalar.test' }));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '9' }),
  Stack: { Screen: () => null },
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const episode = (extra: object = {}) => ({
  id: 21,
  title: 'Part 1',
  thumbnail_url: null,
  views: 3,
  requires_payment: false,
  current_user_can_play: true,
  playback_pending: false,
  ...extra,
});

const series = (extra: object = {}) => ({
  data: {
    id: 9,
    title: 'Lighting basics',
    description: 'Start here.',
    cover_url: null,
    is_premium: false,
    bundle_price_credits: null,
    is_unlocked: false,
    can_be_unlocked: false,
    viewer_is_creator: false,
    creator: { id: 6, public_id: 'c6', name: 'Sarah Creator', profile_photo_url: null },
    media: [episode(), episode({ id: 22, title: 'Part 2', views: 1 })],
    ...extra,
  },
});

const bundle = (extra: object = {}) =>
  series({
    title: 'Advanced lighting',
    is_premium: true,
    bundle_price_credits: 40,
    can_be_unlocked: true,
    media: [episode({ requires_payment: true, current_user_can_play: false })],
    ...extra,
  });

function confirmEveryAlert() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBalance = 100;
});

describe('<SeriesScreen />', () => {
  test('a playlist header with who made it, how many videos, and Play all', async () => {
    mockGet.mockResolvedValue(series());

    await render(<SeriesScreen />);

    expect(await screen.findByText('Lighting basics')).toBeTruthy();
    expect(screen.getByText('Sarah Creator')).toBeTruthy();
    expect(screen.getByText('Series · 2 videos')).toBeTruthy();
    expect(screen.getByText('Start here.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/series/9');

    await fireEvent.press(screen.getByRole('button', { name: 'Play all' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: '21', series: '9' } });
  });

  test('each video row shows its title, creator and views, and plays inside the series', async () => {
    mockGet.mockResolvedValue(series());

    await render(<SeriesScreen />);

    expect(await screen.findByText('Part 2')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 1 view')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 3 views')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Play Part 2' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: '22', series: '9' } });
  });

  test('the creator’s name opens their profile', async () => {
    mockGet.mockResolvedValue(series());
    await render(<SeriesScreen />);

    await fireEvent.press(await screen.findByRole('link', { name: 'Sarah Creator' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creator/[id]', params: { id: 'c6' } });
  });

  test('a locked bundle offers the unlock in place of Play all and marks each video locked', async () => {
    mockGet.mockResolvedValue(bundle());

    await render(<SeriesScreen />);

    expect(await screen.findByText('Premium series · 1 video')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock for 40 credits' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play all' })).toBeNull();
    expect(screen.getByText('Locked')).toBeTruthy();
  });

  test('unlocking asks first, spends the credits, refreshes the balance and reloads', async () => {
    confirmEveryAlert();
    mockGet
      .mockResolvedValueOnce(bundle())
      .mockResolvedValueOnce(
        bundle({ is_unlocked: true, media: [episode({ requires_payment: true, current_user_can_play: true })] }),
      );
    mockPost.mockResolvedValue({ message: 'Series unlocked successfully.' });

    await render(<SeriesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Unlock for 40 credits' }));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unlock this series?',
      'This uses 40 of your 100 credits.',
      expect.anything(),
    );
    expect(mockPost).toHaveBeenCalledWith('/api/v1/series/9/unlock');
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
    expect(await screen.findByText('Premium series · 1 video · Owned')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play all' })).toBeTruthy();
    expect(screen.queryByText('Locked')).toBeNull();
  });

  test('too few credits offers a top-up on the web instead of an unlock', async () => {
    mockBalance = 15;
    mockGet.mockResolvedValue(bundle());

    await render(<SeriesScreen />);

    expect(await screen.findByText('Unlock every video for 40 credits. You need 25 more.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock for 40 credits' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Buy credits' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith('http://nalar.test/credits');
  });

  test('a refused unlock shows the server’s message', async () => {
    confirmEveryAlert();
    mockGet.mockResolvedValue(bundle());
    mockPost.mockRejectedValue(new ApiError(400, 'You do not have enough credits to unlock this series.'));

    await render(<SeriesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Unlock for 40 credits' }));

    expect(await screen.findByText('You do not have enough credits to unlock this series.')).toBeTruthy();
    expect(mockReload).not.toHaveBeenCalled();
  });

  test('a video still being secured says so', async () => {
    mockGet.mockResolvedValue(series({ media: [episode({ playback_pending: true })] }));

    await render(<SeriesScreen />);

    expect(await screen.findByText('Preparing')).toBeTruthy();
  });

  test('the creator’s own series plays without an unlock', async () => {
    mockGet.mockResolvedValue(bundle({ viewer_is_creator: true }));

    await render(<SeriesScreen />);

    expect(await screen.findByRole('button', { name: 'Play all' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock for 40 credits' })).toBeNull();
  });

  test('a series that cannot be opened shows why', async () => {
    mockGet.mockRejectedValue(new ApiError(404, 'We couldn’t find that.'));

    await render(<SeriesScreen />);

    expect(await screen.findByText('We couldn’t find that.')).toBeTruthy();
  });
});
