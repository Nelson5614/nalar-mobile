import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import VerifyEmail from '@/app/verify-email';

const mockReload = jest.fn();
const mockReplace = jest.fn();

const me = { id: 7, name: 'Una', email: 'una@example.com', email_verified: false, credit_balance: 0 };
const stillUnverified = { route: 'verify-email', config: {}, me };
const verified = { route: 'home', config: {}, me: { ...me, email_verified: true } };

jest.mock('@/lib/session', () => ({
  api: { post: jest.fn() },
  useSession: () => ({
    launch: { route: 'verify-email', config: {}, me: { email: 'una@example.com' } },
    reload: (...args: unknown[]) => mockReload(...args),
    signOut: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}));

let appStateListener: ((state: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  appStateListener = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

describe('<VerifyEmail />', () => {
  test('checking before the link was opened says so and stays on the screen', async () => {
    mockReload.mockResolvedValue(stillUnverified);
    await render(<VerifyEmail />);

    await fireEvent.press(screen.getByRole('button', { name: 'I’ve verified my email' }));

    expect(
      await screen.findByText('We haven’t seen your confirmation yet. Open the link in the email, then try again.'),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('checking after the link was opened moves on', async () => {
    mockReload.mockResolvedValue(verified);
    await render(<VerifyEmail />);

    await fireEvent.press(screen.getByRole('button', { name: 'I’ve verified my email' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  test('coming back to the app after opening the link moves on without a tap', async () => {
    mockReload.mockResolvedValue(verified);
    await render(<VerifyEmail />);

    await act(async () => appStateListener?.('active'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  test('coming back without having opened the link stays quiet', async () => {
    mockReload.mockResolvedValue(stillUnverified);
    await render(<VerifyEmail />);

    await act(async () => appStateListener?.('active'));

    expect(mockReload).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText(/haven’t seen your confirmation/)).toBeNull();
  });
});
