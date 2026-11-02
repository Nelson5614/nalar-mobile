import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SignIn from '@/app/sign-in';
import { ApiError } from '@/lib/api';

const mockPost = jest.fn();
const mockSignIn = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
  useSession: () => ({ signIn: mockSignIn }),
}));

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
  },
}));

async function fillAndSubmit() {
  await render(<SignIn />);
  await fireEvent.changeText(screen.getByLabelText('Email'), ' thandi@example.com ');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'secret-pass');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => jest.clearAllMocks());

describe('<SignIn />', () => {
  test('a token signs the user in and returns to the launch gate', async () => {
    const issued = { token: 'tok-1', expires_at: '2026-12-01T00:00:00Z' };
    mockPost.mockResolvedValue(issued);

    await fillAndSubmit();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockSignIn).toHaveBeenCalledWith(issued);
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/login', {
      email: 'thandi@example.com',
      password: 'secret-pass',
      device_name: expect.any(String),
    });
  });

  test('a two-step account goes to the code screen with its challenge', async () => {
    mockPost.mockResolvedValue({ two_factor: true, challenge_id: 'ch-1' });

    await fillAndSubmit();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/two-factor', params: { challenge: 'ch-1' } }),
    );
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('wrong credentials show the message under the field', async () => {
    mockPost.mockRejectedValue(
      new ApiError(422, 'These credentials do not match our records.', {
        email: 'These credentials do not match our records.',
      }),
    );

    await fillAndSubmit();

    expect(await screen.findByText('These credentials do not match our records.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('no connection shows the safe offline message', async () => {
    mockPost.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await fillAndSubmit();

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
