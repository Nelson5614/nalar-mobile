import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Book from '@/app/consultations/book';
import Menu from '@/app/consultations/[creator]';
import Mine from '@/app/consultations/mine';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockReload = jest.fn();
const mockOpenBrowser = jest.fn();
let mockBalance = 100;
let mockParams: Record<string, string> = {};

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
  useSession: () => ({
    launch: {
      route: 'home',
      config: { top_up: { url: 'http://nalar.test/credits', link_enabled: { ios: true, android: true } } },
      me: { credit_balance: mockBalance },
    },
    reload: (...args: unknown[]) => mockReload(...args),
  }),
}));

jest.mock('@/lib/config', () => ({ PLATFORM: 'ios', API_URL: 'http://nalar.test' }));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args) }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  Stack: { Screen: () => null },
}));

const confirmEveryAlert = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style !== 'cancel')?.onPress?.();
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockBalance = 100;
});

describe('consultation menu', () => {
  test('lists the creator’s services and opens one to book', async () => {
    mockParams = { creator: 'c6' };
    mockGet.mockResolvedValue({
      data: {
        creator: { id: 6, public_id: 'c6', name: 'Sarah Creator' },
        services: [{ id: 3, title: 'Portfolio review', description: null, mode: 'online', price_credits: 40, duration_minutes: 30 }],
        venue_area: null,
      },
    });

    await render(<Menu />);

    expect(await screen.findByText('Portfolio review')).toBeTruthy();
    expect(screen.getByText('30 minutes · 40 credits · Online')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Portfolio review' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/consultations/book',
      params: { offering: '3', title: 'Portfolio review', price: '40', creator: 'Sarah Creator' },
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/creators/c6/consultations');
  });
});

describe('booking a consultation', () => {
  const slots = { data: ['2026-11-05T09:00:00+00:00', '2026-11-05T10:00:00+00:00'] };

  beforeEach(() => {
    mockParams = { offering: '3', title: 'Portfolio review', price: '40', creator: 'Sarah Creator' };
    mockGet.mockResolvedValue(slots);
  });

  test('a picked time and topic are booked after confirming, then my bookings open', async () => {
    mockPost.mockResolvedValue({ data: { id: 50 } });
    confirmEveryAlert();
    await render(<Book />);

    await fireEvent.press((await screen.findAllByRole('radio'))[1]);
    await fireEvent.changeText(screen.getByLabelText('What would you like to cover?'), 'My portfolio before applying');
    await fireEvent.press(screen.getByRole('button', { name: 'Book for 40 credits' }));

    expect(Alert.alert).toHaveBeenCalledWith('Book this consultation?', 'This uses 40 of your 100 credits.', expect.any(Array));
    expect(mockPost).toHaveBeenCalledWith('/api/v1/consultations/bookings', {
      consultation_offering_id: 3,
      scheduled_for: '2026-11-05T10:00:00+00:00',
      topic: 'My portfolio before applying',
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/consultations/mine'));
    expect(mockReload).toHaveBeenCalled();
  });

  test('cannot book without a time and a real topic', async () => {
    await render(<Book />);
    await screen.findAllByRole('radio');

    expect(screen.getByRole('button', { name: 'Book for 40 credits' })).toBeDisabled();
    await fireEvent.press(screen.getAllByRole('radio')[0]);
    await fireEvent.changeText(screen.getByLabelText('What would you like to cover?'), 'short');
    expect(screen.getByRole('button', { name: 'Book for 40 credits' })).toBeDisabled();
  });

  test('too few credits offers a top-up instead', async () => {
    mockBalance = 10;
    await render(<Book />);

    expect(await screen.findByText('You need 30 more credits to book this.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Book for 40 credits' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Buy credits' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith('http://nalar.test/credits');
  });

  test('a refused booking shows the server’s message', async () => {
    mockPost.mockRejectedValue(new ApiError(422, 'That time was just taken. Please pick another.'));
    confirmEveryAlert();
    await render(<Book />);

    await fireEvent.press((await screen.findAllByRole('radio'))[0]);
    await fireEvent.changeText(screen.getByLabelText('What would you like to cover?'), 'My portfolio before applying');
    await fireEvent.press(screen.getByRole('button', { name: 'Book for 40 credits' }));

    expect(await screen.findByText('That time was just taken. Please pick another.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('my consultations', () => {
  const booking = (extra: object = {}) => ({
    id: 50,
    status: 'confirmed',
    scheduled_for: '2026-11-05T10:00:00+00:00',
    duration_minutes: 30,
    offering: { id: 3, title: 'Portfolio review' },
    creator: { id: 6, name: 'Sarah Creator' },
    can_cancel: true,
    ...extra,
  });

  test('lists my bookings and cancels one after confirming', async () => {
    mockGet.mockResolvedValue({ data: { as_guest: [booking()], as_host: [] } });
    mockPost.mockResolvedValue({ message: 'Consultation cancelled.', data: { refunded_credits: 40 } });
    confirmEveryAlert();
    await render(<Mine />);

    expect(await screen.findByText('Portfolio review')).toBeTruthy();
    expect(screen.getByText('with Sarah Creator')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel booking' }));

    expect(mockPost).toHaveBeenCalledWith('/api/v1/consultations/bookings/50/cancel');
    expect(await screen.findByText('Cancelled. 40 credits are back in your balance.')).toBeTruthy();
    expect(mockReload).toHaveBeenCalled();
  });

  test('a booking that can no longer be cancelled has no cancel button', async () => {
    mockGet.mockResolvedValue({ data: { as_guest: [booking({ can_cancel: false })], as_host: [] } });

    await render(<Mine />);

    await screen.findByText('Portfolio review');
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
  });

  test('no bookings yet says so', async () => {
    mockGet.mockResolvedValue({ data: { as_guest: [], as_host: [] } });

    await render(<Mine />);

    expect(await screen.findByText(/No consultations yet/)).toBeTruthy();
  });
});
