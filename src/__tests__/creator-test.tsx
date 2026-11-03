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

const video = (extra: object = {}) => ({
  id: 1,
  public_id: 'v1',
  title: 'Studio tour',
  thumbnail_url: null,
  thumbnail_token: null,
  requires_payment: false,
  is_unlocked: false,
  views: 3,
  created_at: '2026-11-02T10:00:00+00:00',
  ...extra,
});

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
      video(),
      video({ id: 4, public_id: 'v4', title: 'Masterclass', requires_payment: true, required_credits: 25, views: 0 }),
    ],
    series: [
      {
        id: 9,
        title: 'Lighting basics',
        is_premium: false,
        bundle_price_credits: null,
        media_count: 3,
        thumbnail_url: null,
      },
      {
        id: 10,
        title: 'Advanced lighting',
        is_premium: true,
        bundle_price_credits: 40,
        media_count: 1,
        thumbnail_url: null,
      },
    ],
    ...extra,
  },
});

beforeEach(() => jest.clearAllMocks());

describe('<CreatorProfile />', () => {
  test('shows who they are above the profile tabs', async () => {
    mockGet.mockResolvedValue(profile());

    await render(<CreatorProfile />);

    expect(await screen.findByText('Sarah Creator')).toBeTruthy();
    expect(screen.getByText('Lighting and lenses.')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('1 subscriber · 2 videos')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Videos', selected: true })).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/creators/c6');
  });

  test('videos open on Free, with a count on each sub-tab as the web shows', async () => {
    mockGet.mockResolvedValue(profile());

    await render(<CreatorProfile />);

    expect(await screen.findByRole('tab', { name: 'Free (1)', selected: true })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Premium (1)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Series (2)' })).toBeTruthy();
    expect(screen.getByText('Studio tour')).toBeTruthy();
    expect(screen.getByText('3 views')).toBeTruthy();
    expect(screen.getByText('Nov 2, 2026')).toBeTruthy();
    expect(screen.queryByText('Masterclass')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Studio tour' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/watch/[id]', params: { id: 'v1' } });
  });

  test('a premium video the fan has not bought is locked and says what it costs', async () => {
    mockGet.mockResolvedValue(profile());
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Premium (1)' }));

    expect(screen.getByText('Masterclass')).toBeTruthy();
    expect(screen.getByText('Premium Content')).toBeTruthy();
    expect(screen.getByText('25 credits')).toBeTruthy();
    expect(screen.getByLabelText('Masterclass, premium, 25 credits to unlock')).toBeTruthy();
    expect(screen.queryByText('Studio tour')).toBeNull();
  });

  test('a bought premium video drops the lock and says it is unlocked', async () => {
    mockGet.mockResolvedValue(
      profile({
        videos: [video({ title: 'Masterclass', requires_payment: true, is_unlocked: true, required_credits: 25 })],
      }),
    );
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Premium (1)' }));

    expect(screen.getByText('Unlocked')).toBeTruthy();
    expect(screen.queryByText('Premium Content')).toBeNull();
    expect(screen.queryByText('25 credits')).toBeNull();
  });

  test('on their own profile a creator sees the price without the lock', async () => {
    mockGet.mockResolvedValue(profile({ is_me: true }));
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Premium (1)' }));

    expect(screen.getByText('25 credits')).toBeTruthy();
    expect(screen.queryByText('Premium Content')).toBeNull();
  });

  test('the Series tab shows each series as a card with its count and price, and opens it', async () => {
    mockGet.mockResolvedValue(profile());
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Series (2)' }));

    expect(screen.getByText('3 videos')).toBeTruthy();
    expect(screen.getByText('1 video · Premium series')).toBeTruthy();
    expect(screen.getByText('40 credits')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Lighting basics' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/series/[id]', params: { id: '9' } });
  });

  test('an empty tab says so in the web’s words', async () => {
    mockGet.mockResolvedValue(profile({ videos: [], series: [] }));
    await render(<CreatorProfile />);

    expect(await screen.findByText('This creator hasn’t posted any free videos yet.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Series (0)' }));
    expect(screen.getByText('This creator hasn’t published any series yet.')).toBeTruthy();
  });

  test('a creator who offers consultations has a Consultations tab that opens their menu', async () => {
    mockGet.mockResolvedValue(profile({ can_offer_consultations: true }));
    await render(<CreatorProfile />);

    await fireEvent.press(await screen.findByRole('tab', { name: 'Consultations' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/consultations/[creator]', params: { creator: 'c6' } });
  });

  test('no Consultations tab for a creator who does not offer them', async () => {
    mockGet.mockResolvedValue(profile());
    await render(<CreatorProfile />);

    await screen.findByText('Sarah Creator');
    expect(screen.queryByRole('tab', { name: 'Consultations' })).toBeNull();
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
