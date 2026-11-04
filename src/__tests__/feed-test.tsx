import { act, fireEvent, render, screen } from '@testing-library/react-native';

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

  test('each video shows its title, creator, views and how long ago it was posted', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    mockGet.mockResolvedValue(
      page([
        video(1, { views: 1530, created_at: twoDaysAgo }),
        video(2, { views: 1, created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString() }),
        video(3, { views: 0, created_at: null }),
      ]),
    );

    await render(<Home />);

    expect(await screen.findByText('Video 1')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 1.5K views · 2 days ago')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 1 view · 3 hours ago')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 0 views')).toBeTruthy();
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

  test('the categories from the web sit above the feed, with All chosen', async () => {
    mockGet.mockResolvedValue(page([video(1)]));
    await render(<Home />);
    await screen.findByText('Video 1');

    for (const name of ['All', 'Music', 'Entertainment', 'Culture Preservation', 'Education', 'Spirituality', 'News']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'All' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  test('choosing a category reloads the feed with only that category, and All goes back', async () => {
    mockGet.mockResolvedValueOnce(page([video(1)])).mockResolvedValueOnce(page([video(5, { title: 'Drum circle' })]));
    await render(<Home />);
    await screen.findByText('Video 1');

    await fireEvent.press(screen.getByRole('button', { name: 'Music' }));

    expect(await screen.findByText('Drum circle')).toBeTruthy();
    expect(screen.queryByText('Video 1')).toBeNull();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/feed?page=1&category=Music');
    expect(screen.getByRole('button', { name: 'Music' }).props.accessibilityState).toMatchObject({ selected: true });

    mockGet.mockResolvedValueOnce(page([video(1)]));
    await fireEvent.press(screen.getByRole('button', { name: 'All' }));

    expect(await screen.findByText('Video 1')).toBeTruthy();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/feed?page=1');
  });

  test('more pages stay in the chosen category', async () => {
    mockGet
      .mockResolvedValueOnce(page([video(1)]))
      .mockResolvedValueOnce(page([video(3)], 1, 2))
      .mockResolvedValueOnce(page([video(4)], 2, 2));
    await render(<Home />);
    await screen.findByText('Video 1');
    await fireEvent.press(screen.getByRole('button', { name: 'Culture Preservation' }));
    await screen.findByText('Video 3');

    await fireEvent(screen.getByTestId('feed'), 'onEndReached');

    expect(await screen.findByText('Video 4')).toBeTruthy();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/feed?page=2&category=Culture%20Preservation');
  });

  test('an answer for a category left behind does not replace the one chosen', async () => {
    let finishMusic: (value: object) => void = () => {};
    mockGet
      .mockResolvedValueOnce(page([video(1)]))
      .mockReturnValueOnce(new Promise((resolve) => (finishMusic = resolve)))
      .mockResolvedValueOnce(page([video(7, { title: 'Evening news' })]));
    await render(<Home />);
    await screen.findByText('Video 1');

    await fireEvent.press(screen.getByRole('button', { name: 'Music' }));
    await fireEvent.press(screen.getByRole('button', { name: 'News' }));
    expect(await screen.findByText('Evening news')).toBeTruthy();

    await act(async () => finishMusic(page([video(5, { title: 'Drum circle' })])));

    expect(screen.queryByText('Drum circle')).toBeNull();
    expect(screen.getByText('Evening news')).toBeTruthy();
  });

  test('an empty category says so by name', async () => {
    mockGet.mockResolvedValueOnce(page([video(1)])).mockResolvedValueOnce(page([]));
    await render(<Home />);
    await screen.findByText('Video 1');

    await fireEvent.press(screen.getByRole('button', { name: 'Spirituality' }));

    expect(await screen.findByText('No Spirituality videos yet. Try another category.')).toBeTruthy();
  });

  test('a failed load shows the safe message and can try again', async () => {
    mockGet
      .mockRejectedValueOnce(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'))
      .mockResolvedValueOnce(page([video(1)]));
    await render(<Home />);

    expect(
      await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Video 1')).toBeTruthy();
  });
});
