import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Search from '@/app/search';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));

const results = {
  data: {
    creators: [{ id: 6, public_id: 'c6', name: 'Lerato Studio', profile_photo_url: null, bio_excerpt: 'Portraits and studio lighting.' }],
    videos: [
      { id: 3, public_id: 'v3', title: 'Studio tour', creator_name: 'Lerato Studio', thumbnail_url: null, requires_payment: false },
      { id: 4, public_id: 'v4', title: 'Studio masterclass', creator_name: 'Lerato Studio', thumbnail_url: null, requires_payment: true },
    ],
  },
};

async function typeAndWait(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Search Nalar'), text);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => jest.useRealTimers());

describe('<Search />', () => {
  test('typing searches after a pause and shows creators and videos', async () => {
    mockGet.mockResolvedValue(results);
    await render(<Search />);

    await typeAndWait('studio ');

    expect(await screen.findByText('Portraits and studio lighting.')).toBeTruthy();
    // Once as the creator, once under each of their two videos.
    expect(screen.getAllByText('Lerato Studio')).toHaveLength(3);
    expect(screen.getByText('Studio tour')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/api/v1/search?term=studio');
  });

  test('one letter does not search yet', async () => {
    await render(<Search />);

    await typeAndWait('s');

    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByText('Search for creators and videos.')).toBeTruthy();
  });

  test('opening a video goes to its watch screen', async () => {
    mockGet.mockResolvedValue(results);
    await render(<Search />);
    await typeAndWait('studio');

    await fireEvent.press(await screen.findByRole('button', { name: 'Studio tour' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: 'v3' } });
  });

  test('opening a creator goes to their profile', async () => {
    mockGet.mockResolvedValue(results);
    await render(<Search />);
    await typeAndWait('studio');

    await fireEvent.press(await screen.findByRole('button', { name: 'Lerato Studio' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/creator/[id]', params: { id: 'c6' } });
  });

  test('nothing found says so', async () => {
    mockGet.mockResolvedValue({ data: { creators: [], videos: [] } });
    await render(<Search />);

    await typeAndWait('zebra');

    expect(await screen.findByText('Nothing found for “zebra”.')).toBeTruthy();
  });

  test('a failed search shows the safe message', async () => {
    mockGet.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));
    await render(<Search />);

    await typeAndWait('studio');

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
