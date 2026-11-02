import { fireEvent, render, screen } from '@testing-library/react-native';

import ForgotPassword from '@/app/forgot-password';
import { ApiError } from '@/lib/api';

const mockPost = jest.fn();

jest.mock('@/lib/session', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

async function submit(email: string) {
  await render(<ForgotPassword />);
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
}

beforeEach(() => jest.clearAllMocks());

describe('<ForgotPassword />', () => {
  test('sends the trimmed email and shows what the server said', async () => {
    mockPost.mockResolvedValue({ message: 'We have emailed your password reset link.' });

    await submit(' thandi@example.com ');

    expect(await screen.findByText('We have emailed your password reset link.')).toBeTruthy();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/forgot-password', { email: 'thandi@example.com' });
  });

  test('an invalid email shows the message under the field', async () => {
    mockPost.mockRejectedValue(
      new ApiError(422, 'The email field must be a valid email address.', {
        email: 'The email field must be a valid email address.',
      }),
    );

    await submit('not-an-email');

    expect(await screen.findByText('The email field must be a valid email address.')).toBeTruthy();
  });
});
