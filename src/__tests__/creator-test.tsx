import { fireEvent, render, screen } from '@testing-library/react-native';

import CreatorProfile from '@/app/creator/[id]';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'c6' }),
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));

const profile = (extra: object = {}) => ({
  data: {
    id: 6,
    public_id: 'c6',
    name: 'Sarah Creator',
    profile_photo_url: null,
    cover_image_url: null,
    bio: 'Lighting and lenses.',
    category: 'lifestyle',
    badges: [{ slug: 'verified', name: 'Verified' }],
    subscriber_count: 1,
    video_count: 2,
    sparks_count: 0,
    is_me: false,
    is_subscribed: false,
    can_offer_consultations: false,
    videos: [
      { id: 1, public_id: 'v1', title: 'Studio tour', thumbnail_url: null, thumbnail_token: null, requires_payment: false, is_unlocked: false, views: 3 },
      { id: 4, public_id: 'v4', title: 'Masterclass', thumbnail_url: null, thumbnail_token: null, requires_payment: true, is_unlocked: false, views: 0 },
    ],
    series: [{ id: 9, title: 'Lighting basics', is_premium: false, media_count: 3 }],
    ...extra,
  },
});

beforeEach(() => jest.clearAllMocks());

describe('<CreatorProfile />', () => {
  test('shows who they are, their videos and their series', async () => {
    mockGet.mockResolvedValue(profile());

    await render(<CreatorProfile />);

    expect(await screen.findByText('Sarah Creator')).toBeTruthy();
    expect(screen.getByText('Lighting and lenses.')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('1 subscriber · 2 videos')).toBeTruthy();
    expect(screen.getByText('Studio tour')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Lighting basics')).toBeTruthy();
    expect(screen.getByText('3 videos')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/creators/c6');
  });

  test('opening one of their videos goes to its watch screen', async () => {
    mockGet.mockResolvedValue(profile());
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Studio tour' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: 'v1' } });
  });

  test('message starts or opens the conversation with them', async () => {
    mockGet.mockResolvedValue(profile());
    mockPost.mockResolvedValue({ data: { id: 12 } });
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Message' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/conversations/start/6');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversation/[id]', params: { id: '12' } });
  });

  test('your own profile has no message button', async () => {
    mockGet.mockResolvedValue(profile({ is_me: true }));

    await render(<CreatorProfile />);

    await screen.findByText('Sarah Creator');
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
  });

  test('a creator who cannot be found shows the message', async () => {
    mockGet.mockRejectedValue(new ApiError(404, 'We couldn’t find that.'));

    await render(<CreatorProfile />);

    expect(await screen.findByText('We couldn’t find that.')).toBeTruthy();
  });
});
