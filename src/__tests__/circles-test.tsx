import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import CircleChat from '@/app/circle/chat';
import CircleScreen from '@/app/circle/[id]';
import Circles from '@/app/circles/index';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockPush = jest.fn();
const mockReload = jest.fn();
const mockOpenBrowser = jest.fn();
const mockJoinCircle = jest.fn();
let mockBalance = 100;
let mockParams: Record<string, string> = {};

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  useSession: () => ({
    launch: {
      route: 'home',
      config: {
        top_up: { url: 'http://nalar.test/credits', link_enabled: { ios: true, android: true } },
        realtime: { key: null, host: null, port: 8080, scheme: 'http' },
      },
      me: { id: 2, name: 'John Fan', credit_balance: mockBalance },
    },
    reload: (...args: unknown[]) => mockReload(...args),
  }),
}));

jest.mock('@/lib/realtime', () => ({ joinCircle: (...args: unknown[]) => mockJoinCircle(...args) }));
jest.mock('@/lib/token-store', () => ({ tokenStore: { get: () => Promise.resolve({ token: 'secret-token' }) } }));
jest.mock('@/lib/config', () => ({ PLATFORM: 'ios', API_URL: 'http://nalar.test' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args) }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));

const creator = { id: 6, public_id: 'c6', name: 'Sarah Creator', profile_photo_url: null };

const circle = (extra: object = {}) => ({
  id: 11,
  public_id: 'k11',
  title: 'Lighting club',
  description: 'A monthly deep dive on light.',
  cover_image_url: null,
  is_free: false,
  monthly_price_credits: 20,
  member_count: 4,
  creator,
  ...extra,
});

function confirmEveryAlert() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockBalance = 100;
  mockParams = {};
  mockJoinCircle.mockReturnValue(null);
});

describe('the Circles tab', () => {
  function serve(mine: object[], all: object[]) {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/circles/mine') return { data: mine };
      if (path === '/api/v1/circles') return { data: all };
      throw new Error(`unexpected ${path}`);
    });
  }

  test('my circles first, with where each membership stands, then circles to discover', async () => {
    serve(
      [
        {
          id: 1,
          status: 'active',
          renews_at: '2026-12-03T10:00:00+00:00',
          circle: circle({ title: 'Studio chat', id: 10, is_free: true, monthly_price_credits: null }),
        },
        { id: 2, status: 'paused', renews_at: null, circle: circle({ id: 12, title: 'Paused club' }) },
      ],
      [circle({ id: 10, title: 'Studio chat' }), circle()],
    );

    await render(<Circles />);

    expect(await screen.findByText('Your circles')).toBeTruthy();
    expect(screen.getByText('Studio chat')).toBeTruthy();
    expect(screen.getByText('Member · renews Dec 3, 2026')).toBeTruthy();
    expect(screen.getByText('Paused · top up to rejoin the chat')).toBeTruthy();
    expect(screen.getByText('Discover')).toBeTruthy();
    expect(screen.getByText('Lighting club')).toBeTruthy();
    expect(screen.getByText('4 members · 20 credits/mo')).toBeTruthy();
    // A circle I am already in is not offered again under Discover.
    expect(screen.getAllByText('Studio chat')).toHaveLength(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Lighting club' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/circle/[id]', params: { id: '11' } });
  });

  test('no circles yet says so and still offers some', async () => {
    serve([], [circle()]);

    await render(<Circles />);

    expect(await screen.findByText('You haven’t joined any circles yet.')).toBeTruthy();
    expect(screen.getByText('Lighting club')).toBeTruthy();
  });
});

describe('a circle', () => {
  function serve(show: object | (() => object), sessionList: object[] = []) {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/circles/11') return typeof show === 'function' ? show() : show;
      if (path === '/api/v1/circles/11/sessions') return { data: sessionList };
      throw new Error(`unexpected ${path}`);
    });
  }

  const outsider = { circle: circle(), membership: null, is_member: false, is_creator: false };
  const member = {
    circle: circle(),
    membership: { id: 31, status: 'active', renews_at: '2026-12-03T10:00:00+00:00' },
    is_member: true,
    is_creator: false,
  };

  beforeEach(() => {
    mockParams = { id: '11' };
  });

  test('shows what it is, who runs it and what it costs', async () => {
    serve(outsider);

    await render(<CircleScreen />);

    expect(await screen.findByText('Lighting club')).toBeTruthy();
    expect(screen.getByText('Sarah Creator')).toBeTruthy();
    expect(screen.getByText('4 members · 20 credits/mo')).toBeTruthy();
    expect(screen.getByText('A monthly deep dive on light.')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/circles/11');
  });

  test('joining a paid circle asks first, spends the credits and refreshes the balance', async () => {
    confirmEveryAlert();
    let joined = false;
    serve(() => (joined ? member : outsider));
    mockPost.mockImplementation(async () => {
      joined = true;
      return { message: 'Successfully joined the circle.' };
    });

    await render(<CircleScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Join for 20 credits a month' }));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Join Lighting club?',
      'This uses 20 of your 100 credits now, and renews monthly.',
      expect.anything(),
    );
    expect(mockPost).toHaveBeenCalledWith('/api/v1/circles/11/join');
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
    expect(await screen.findByText('You’re a member · renews Dec 3, 2026')).toBeTruthy();
  });

  test('a free circle joins without asking', async () => {
    serve({ ...outsider, circle: circle({ is_free: true, monthly_price_credits: null }) });
    mockPost.mockResolvedValue({});

    await render(<CircleScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Join for free' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/circles/11/join');
  });

  test('too few credits offers a top-up instead', async () => {
    mockBalance = 5;
    serve(outsider);

    await render(<CircleScreen />);

    expect(await screen.findByText('You need 15 more credits to join.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join for 20 credits a month' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Buy credits' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith('http://nalar.test/credits');
  });

  test('a refused join shows the server’s message', async () => {
    confirmEveryAlert();
    serve(outsider);
    mockPost.mockRejectedValue(new ApiError(400, 'This circle has reached its maximum member count.'));

    await render(<CircleScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Join for 20 credits a month' }));

    expect(await screen.findByText('This circle has reached its maximum member count.')).toBeTruthy();
  });

  test('a member opens the chat, and can leave after confirming', async () => {
    confirmEveryAlert();
    serve(member);
    mockDelete.mockResolvedValue({});

    await render(<CircleScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Open chat' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/circle/chat', params: { id: '11', title: 'Lighting club' } });

    await fireEvent.press(screen.getByRole('button', { name: 'Leave circle' }));
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/circle-memberships/31');
  });

  test('a paused membership offers to reactivate', async () => {
    confirmEveryAlert();
    serve({ ...member, is_member: false, membership: { id: 31, status: 'paused', renews_at: null } });
    mockPost.mockResolvedValue({});

    await render(<CircleScreen />);

    expect(await screen.findByText('Your membership is paused because a renewal could not be paid.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reactivate for 20 credits' }));
    expect(mockPost).toHaveBeenCalledWith('/api/v1/circle-memberships/31/reactivate');
  });

  test('upcoming sessions are listed, and a live one opens on the web', async () => {
    serve(member, [
      {
        id: 5,
        title: 'Ask me anything',
        scheduled_for: '2026-11-06T18:00:00+00:00',
        duration_minutes: 45,
        status: 'scheduled',
      },
      {
        id: 6,
        title: 'Lighting live',
        scheduled_for: '2026-11-03T10:00:00+00:00',
        duration_minutes: 60,
        status: 'live',
      },
      { id: 7, title: 'Old one', scheduled_for: '2026-10-01T10:00:00+00:00', duration_minutes: 60, status: 'ended' },
    ]);

    await render(<CircleScreen />);

    expect(await screen.findByText('Ask me anything')).toBeTruthy();
    expect(screen.getByText('Live now')).toBeTruthy();
    expect(screen.queryByText('Old one')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Join Lighting live on the web' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith('http://nalar.test/circles/11/sessions/6/live');
  });

  test('the creator’s own circle has no join button', async () => {
    serve({ ...outsider, is_creator: true });

    await render(<CircleScreen />);

    expect(await screen.findByRole('button', { name: 'Open chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull();
  });
});

describe('the circle chat', () => {
  const message = (extra: object = {}) => ({
    id: 51,
    body: 'Welcome in.',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    user: { id: 6, name: 'Sarah Creator', profile_photo_url: null },
    user_id: 6,
    attachment_url: null,
    attachment_type: null,
    attachment_name: null,
    ...extra,
  });

  beforeEach(() => {
    mockParams = { id: '11', title: 'Lighting club' };
  });

  test('shows who said what and when', async () => {
    mockGet.mockResolvedValue({
      data: [message({ id: 52, body: 'Thanks!', user_id: 2, user: { id: 2, name: 'John Fan' } }), message()],
      next_cursor: null,
    });

    await render(<CircleChat />);

    expect(await screen.findByText('Welcome in.')).toBeTruthy();
    expect(screen.getByText('Thanks!')).toBeTruthy();
    expect(screen.getByText('Sarah Creator · 2 minutes ago')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/circles/11/messages');
  });

  test('sending posts the message and shows it', async () => {
    mockGet.mockResolvedValue({ data: [message()], next_cursor: null });
    mockPost.mockResolvedValue({
      data: message({
        id: 60,
        body: 'Hello all',
        user_id: 2,
        user: { id: 2, name: 'John Fan' },
        created_at: new Date().toISOString(),
      }),
    });

    await render(<CircleChat />);
    await fireEvent.changeText(await screen.findByPlaceholderText('Message the circle'), 'Hello all');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/circles/11/messages', { body: 'Hello all' });
    expect(await screen.findByText('Hello all')).toBeTruthy();
  });

  test('a refused message shows why', async () => {
    mockGet.mockResolvedValue({ data: [], next_cursor: null });
    mockPost.mockRejectedValue(new ApiError(403, 'Your membership is paused. Top up credits to post in this chat.'));

    await render(<CircleChat />);
    await fireEvent.changeText(await screen.findByPlaceholderText('Message the circle'), 'Hi');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Your membership is paused. Top up credits to post in this chat.')).toBeTruthy();
  });

  test('my own message can be deleted after confirming', async () => {
    confirmEveryAlert();
    mockGet.mockResolvedValue({
      data: [message({ id: 52, body: 'Oops', user_id: 2, user: { id: 2, name: 'John Fan' } })],
      next_cursor: null,
    });
    mockDelete.mockResolvedValue({});

    await render(<CircleChat />);
    await fireEvent(await screen.findByLabelText('Your message: Oops'), 'longPress');

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/circle-messages/52');
    await waitFor(() => expect(screen.queryByText('Oops')).toBeNull());
  });

  test('an empty chat invites the first message', async () => {
    mockGet.mockResolvedValue({ data: [], next_cursor: null });

    await render(<CircleChat />);

    expect(await screen.findByText('No messages yet. Say hello.')).toBeTruthy();
  });
});
