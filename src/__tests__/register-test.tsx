import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Register from '@/app/register';
import { ApiError } from '@/lib/api';

const mockPost = jest.fn();
const mockSignIn = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
  useSession: () => ({ signIn: mockSignIn }),
}));

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
}));

async function fillIn({ tickBoxes = true } = {}) {
  await render(<Register />);
  await fireEvent.changeText(screen.getByLabelText('Your name'), ' Thandi ');
  await fireEvent.changeText(screen.getByLabelText('Email'), ' thandi@example.com ');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'a-long-secret');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'a-long-secret');
  if (tickBoxes) {
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I’m 13 years old or older.' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy.' }));
  }
}

const createButton = () => screen.getByRole('button', { name: 'Create account' });

beforeEach(() => jest.clearAllMocks());

describe('<Register />', () => {
  test('a new account is signed in and handed to the launch gate', async () => {
    const issued = { token: 'tok-1', expires_at: '2026-12-01T00:00:00Z' };
    mockPost.mockResolvedValue(issued);

    await fillIn();
    await fireEvent.press(createButton());

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockSignIn).toHaveBeenCalledWith(issued);
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/register', {
      name: 'Thandi',
      email: 'thandi@example.com',
      password: 'a-long-secret',
      password_confirmation: 'a-long-secret',
      age_confirmed: true,
      terms: true,
      device_name: expect.any(String),
    });
  });

  test('the account cannot be created until both boxes are ticked', async () => {
    await fillIn({ tickBoxes: false });

    expect(createButton()).toBeDisabled();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'I’m 13 years old or older.' }));
    expect(createButton()).toBeDisabled();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy.' }));
    expect(createButton()).toBeEnabled();
  });

  test('a taken email shows the message under the field', async () => {
    mockPost.mockRejectedValue(
      new ApiError(422, 'The email has already been taken.', { email: 'The email has already been taken.' }),
    );

    await fillIn();
    await fireEvent.press(createButton());

    expect(await screen.findByText('The email has already been taken.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('no connection shows the safe offline message', async () => {
    mockPost.mockRejectedValue(new ApiError(0, 'We can’t reach Nalar right now. Check your connection and try again.'));

    await fillIn();
    await fireEvent.press(createButton());

    expect(await screen.findByText('We can’t reach Nalar right now. Check your connection and try again.')).toBeTruthy();
  });
});
