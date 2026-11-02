import { ApiError, type Api } from '@/lib/api';
import { resolveLaunch } from '@/lib/launch';
import type { StoredToken } from '@/lib/token-store';

const config = {
  features: {},
  guest_browsing: { enabled: false, free_plays_before_signup: 0 },
  top_up: { url: 'http://nalar.test/credits', link_enabled: { ios: true, android: true } },
  minimum_version: { ios: '1.0.0', android: '1.0.0' },
};

const me = { id: 7, name: 'Thandi', email_verified: true, credit_balance: 120 };

const inThirtyDays = () => new Date(Date.now() + 30 * 86400_000).toISOString();

function setup(overrides: { stored?: StoredToken | null; meResponse?: unknown; configResponse?: unknown } = {}) {
  const get = jest.fn(async (path: string) => {
    if (path === '/api/v1/app-config') {
      if (overrides.configResponse instanceof Error) throw overrides.configResponse;
      return { data: overrides.configResponse ?? config };
    }
    if (path === '/api/v1/me') {
      if (overrides.meResponse instanceof Error) throw overrides.meResponse;
      return { data: overrides.meResponse ?? me };
    }
    throw new Error(`unexpected ${path}`);
  });
  const post = jest.fn(async () => ({ token: 'tok-new', expires_at: inThirtyDays() }));
  const tokens = {
    get: jest.fn(async () => (overrides.stored === undefined ? { token: 'tok-1', expiresAt: inThirtyDays() } : overrides.stored)),
    set: jest.fn(async () => {}),
    clear: jest.fn(async () => {}),
  };

  const run = (appVersion = '1.0.0') =>
    resolveLaunch({ api: { get, post } as unknown as Api, tokens, appVersion, platform: 'ios' });

  return { run, get, post, tokens };
}

describe('resolveLaunch', () => {
  test('a signed-in, verified user goes home with their account', async () => {
    const { run } = setup();

    await expect(run()).resolves.toEqual({ route: 'home', config, me });
  });

  test('an app older than the minimum must update before anything else', async () => {
    const { run, get } = setup();

    await expect(run('0.9.0')).resolves.toEqual({ route: 'update-required', config });
    expect(get).not.toHaveBeenCalledWith('/api/v1/me');
  });

  test('no saved token goes to welcome', async () => {
    const { run, get } = setup({ stored: null });

    await expect(run()).resolves.toEqual({ route: 'welcome', config });
    expect(get).not.toHaveBeenCalledWith('/api/v1/me');
  });

  test('a rejected token is forgotten and the user goes to welcome', async () => {
    const { run, tokens } = setup({ meResponse: new ApiError(401, 'expired') });

    await expect(run()).resolves.toEqual({ route: 'welcome', config });
    expect(tokens.clear).toHaveBeenCalled();
  });

  test('an unverified user is asked to check their email', async () => {
    const unverified = { ...me, email_verified: false };
    const { run } = setup({ meResponse: unverified });

    await expect(run()).resolves.toEqual({ route: 'verify-email', config, me: unverified });
  });

  test('no connection on launch shows the offline screen with a safe message', async () => {
    const { run } = setup({ configResponse: new ApiError(0, 'We can’t reach Nalar right now.') });

    await expect(run()).resolves.toEqual({ route: 'offline', message: 'We can’t reach Nalar right now.' });
  });

  test('a server error loading the account keeps the token and shows offline', async () => {
    const { run, tokens } = setup({ meResponse: new ApiError(500, 'Something went wrong on our side.') });

    await expect(run()).resolves.toEqual({ route: 'offline', message: 'Something went wrong on our side.' });
    expect(tokens.clear).not.toHaveBeenCalled();
  });

  test('a token close to expiry is swapped for a fresh one before loading the account', async () => {
    const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
    const { run, post, tokens } = setup({ stored: { token: 'tok-1', expiresAt: soon } });

    await run();

    expect(post).toHaveBeenCalledWith('/api/v1/auth/refresh');
    expect(tokens.set).toHaveBeenCalledWith({ token: 'tok-new', expiresAt: expect.any(String) });
  });

  test('a token with plenty of time left is not refreshed', async () => {
    const { run, post } = setup();

    await run();

    expect(post).not.toHaveBeenCalled();
  });

  test('a failed refresh does not block launch while the old token still works', async () => {
    const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
    const { run, post } = setup({ stored: { token: 'tok-1', expiresAt: soon } });
    post.mockRejectedValueOnce(new ApiError(0, 'offline'));

    await expect(run()).resolves.toMatchObject({ route: 'home' });
  });
});
