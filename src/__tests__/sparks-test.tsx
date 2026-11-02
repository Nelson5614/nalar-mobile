import { render, screen } from '@testing-library/react-native';

import Sparks from '@/app/(tabs)/sparks';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  VideoView: () => null,
}));

const spark = (id: number, caption: string, extra: object = {}) => ({
  id,
  caption,
  mux_playback_id: `pb-${id}`,
  thumbnail_url: null,
  creator: { id: 6, name: 'Sarah Creator' },
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('<Sparks />', () => {
  test('shows each Spark with its caption and creator, skipping any without a stream', async () => {
    mockGet.mockResolvedValue({
      data: [spark(1, 'First Spark'), spark(2, 'Still encoding', { mux_playback_id: null })],
      next_cursor: null,
    });

    await render(<Sparks />);

    expect(await screen.findByText('First Spark')).toBeTruthy();
    expect(screen.getByText('Sarah Creator')).toBeTruthy();
    expect(screen.queryByText('Still encoding')).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/sparks');
  });

  test('no Sparks yet says so', async () => {
    mockGet.mockResolvedValue({ data: [], next_cursor: null });

    await render(<Sparks />);

    expect(await screen.findByText(/No Sparks yet/)).toBeTruthy();
  });

  test('a failed load shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await render(<Sparks />);

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
