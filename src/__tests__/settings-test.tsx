import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking, Share } from 'react-native';

import Me from '@/app/(tabs)/me';
import Devices from '@/app/settings/devices';
import Settings from '@/app/settings/index';
import ChangePassword from '@/app/settings/password';
import TwoStep from '@/app/settings/two-factor';
import { ApiError } from '@/lib/api';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/session', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  useSession: () => ({
    launch: {
      route: 'home',
      me: { id: 5, name: 'John Fan', credit_balance: 10 },
      config: { features: {}, top_up: { link_enabled: {} } },
    },
    reload: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  Redirect: () => null,
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
  },
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('account settings', () => {
  test('Me opens account settings, which lists password, two-step sign-in and devices', async () => {
    await render(<Me />);
    await fireEvent.press(screen.getByRole('button', { name: 'Account settings' }));
    expect(mockPush).toHaveBeenCalledWith('/settings');

    mockGet.mockResolvedValue({ data: { enabled: true, pending: false } });
    await render(<Settings />);

    expect(await screen.findByText('On')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Two-step sign-in/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/two-factor');
    await fireEvent.press(screen.getByRole('button', { name: /Change password/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/password');
    await fireEvent.press(screen.getByRole('button', { name: /Signed-in devices/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/settings/devices');
  });

  test('changing the password sends all three fields and says it worked', async () => {
    mockPut.mockResolvedValue({ message: 'Your password has been changed.' });
    await render(<ChangePassword />);

    await fireEvent.changeText(screen.getByLabelText('Current password'), 'old-Secret-123');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'new-Secret-456!');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-Secret-456!');
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

    expect(mockPut).toHaveBeenCalledWith('/api/v1/account/password', {
      current_password: 'old-Secret-123',
      password: 'new-Secret-456!',
      password_confirmation: 'new-Secret-456!',
    });
    expect(await screen.findByText('Your password has been changed.')).toBeTruthy();
  });

  test('a wrong current password is shown on that field', async () => {
    mockPut.mockRejectedValue(
      new ApiError(422, 'The given data was invalid.', {
        current_password: 'The provided password does not match your current password.',
      }),
    );
    await render(<ChangePassword />);

    await fireEvent.changeText(screen.getByLabelText('Current password'), 'nope');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'new-Secret-456!');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-Secret-456!');
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('The provided password does not match your current password.')).toBeTruthy();
  });

  test('turning on two-step sign-in: password, then the setup key, then a code, then recovery codes', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    mockGet.mockResolvedValue({ data: { enabled: false, pending: false } });
    mockPost
      .mockResolvedValueOnce({
        data: { setup_key: 'ABCD EFGH', otpauth_url: 'otpauth://totp/Nalar:john?secret=ABCDEFGH' },
      })
      .mockResolvedValueOnce({ data: { recovery_codes: ['one-two', 'three-four'] } });
    await render(<TwoStep />);

    expect(await screen.findByText(/Off/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on' }));
    await fireEvent.changeText(screen.getByLabelText('Your password'), 'old-Secret-123');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockPost).toHaveBeenCalledWith('/api/v1/account/two-factor', { password: 'old-Secret-123' });

    expect(await screen.findByText('ABCD EFGH')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open in authenticator app' }));
    expect(openURL).toHaveBeenCalledWith('otpauth://totp/Nalar:john?secret=ABCDEFGH');

    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(mockPost).toHaveBeenLastCalledWith('/api/v1/account/two-factor/confirm', { code: '123456' });

    expect(await screen.findByText('one-two')).toBeTruthy();
    expect(screen.getByText('three-four')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save recovery codes' }));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('one-two\nthree-four') });
  });

  test('turning it off takes the password', async () => {
    mockGet.mockResolvedValue({ data: { enabled: true, pending: false } });
    mockDelete.mockResolvedValue(undefined);
    await render(<TwoStep />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Turn off' }));
    await fireEvent.changeText(screen.getByLabelText('Your password'), 'old-Secret-123');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/account/two-factor', { password: 'old-Secret-123' });
    expect(await screen.findByText(/Off/)).toBeTruthy();
  });

  test('a wrong password says so and changes nothing', async () => {
    mockGet.mockResolvedValue({ data: { enabled: true, pending: false } });
    mockPost.mockRejectedValue(
      new ApiError(422, 'That password is not right.', { password: 'That password is not right.' }),
    );
    await render(<TwoStep />);

    await fireEvent.press(await screen.findByRole('button', { name: 'New recovery codes' }));
    await fireEvent.changeText(screen.getByLabelText('Your password'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('That password is not right.')).toBeTruthy();
  });

  test('devices: this one is marked, and another can be signed out after confirming', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 7, name: 'iPhone', current: true, last_used_at: new Date().toISOString() },
        { id: 3, name: 'iPad', current: false, last_used_at: null },
      ],
    });
    mockDelete.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert');
    await render(<Devices />);

    expect(await screen.findByText('This device')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out iPhone' })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out iPad' }));
    await act(async () => alert.mock.calls[0][2]!.find((b) => b.text === 'Sign out')!.onPress!());

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/devices/3');
    expect(screen.queryByText('iPad')).toBeNull();
  });
});
