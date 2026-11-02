import { fireEvent, render, screen } from '@testing-library/react-native';

import Home from '@/app/(tabs)/home';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const page = (data: object[], current = 1, last = 1) => ({ data, current_page: current, last_page: last });
const video = (id: number, extra: object = {}) => ({
  id,
  type: 'media',
  title: `Video ${id}`,
  creator: { id: 6, name: 'Sarah Creator' },
  requires_payment: false,
  thumbnail_url: null,
  ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('<Home /> feed', () => {
  test('shows videos and leaves out items the app cannot open yet', async () => {
    mockGet.mockResolvedValue(
      page([video(1), { id: 9, type: 'poll', title: 'Pick one' }, video(2, { requires_payment: true })]),
    );

    await render(<Home />);

    expect(await screen.findByText('Video 1')).toBeTruthy();
    expect(screen.getByText('Video 2')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.queryByText('Pick one')).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/feed?page=1');
  });

  test('opening a video goes to its watch screen', async () => {
    mockGet.mockResolvedValue(page([video(1)]));
    await render(<Home />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Video 1' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: '1' } });
  });

  test('reaching the end loads the next page', async () => {
    mockGet.mockResolvedValueOnce(page([video(1)], 1, 2)).mockResolvedValueOnce(page([video(2)], 2, 2));
    await render(<Home />);
    await screen.findByText('Video 1');

    await fireEvent(screen.getByTestId('feed'), 'onEndReached');

    expect(await screen.findByText('Video 2')).toBeTruthy();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/feed?page=2');
  });

  test('the search button opens search', async () => {
    mockGet.mockResolvedValue(page([video(1)]));
    await render(<Home />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Search' }));

    expect(mockPush).toHaveBeenCalledWith('/search');
  });

  test('an empty feed says so', async () => {
    mockGet.mockResolvedValue(page([]));

    await render(<Home />);

    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  });

  test('a failed load shows the safe message and can try again', async () => {
    mockGet
      .mockRejectedValueOnce(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'))
      .mockResolvedValueOnce(page([video(1)]));
    await render(<Home />);

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Video 1')).toBeTruthy();
  });
});
