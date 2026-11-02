import { render, screen } from '@testing-library/react-native';

import Watch from '@/app/watch/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  useSession: () => ({ launch: { route: 'home', config: {}, me: { watermark_tag: 'E7A8-9D0A' } } }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '4' }),
  Stack: { Screen: () => null },
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

function respond(media: object, token?: object) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/api/v1/media/4') return media;
    if (path === '/api/v1/media/4/playback-token' && token) return token;
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => jest.clearAllMocks());

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

  test('a locked paid video shows its price instead of a player', async () => {
    respond(detail({ requires_payment: true, required_credits: 30 }));

    await render(<Watch />);

    expect(await screen.findByText('Unlock this video for 30 credits.')).toBeTruthy();
    expect(screen.queryByText(/^playing/)).toBeNull();
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<Watch />);

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
