import { ApiError, createApi } from '@/lib/api';

function respond(status: number, body?: unknown) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function setup(token: string | null = 'tok-1') {
  const fetchImpl = jest.fn();
  const onUnauthorized = jest.fn();
  const api = createApi({
    baseUrl: 'http://nalar.test',
    getToken: async () => token,
    onUnauthorized,
    fetchImpl,
  });

  return { api, fetchImpl, onUnauthorized };
}

describe('createApi', () => {
  test('asks for JSON and sends the bearer token', async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockReturnValue(respond(200, { data: { id: 1 } }));

    await expect(api.get('/api/v1/me')).resolves.toEqual({ data: { id: 1 } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://nalar.test/api/v1/me');
    expect(init.headers.Accept).toBe('application/json');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  test('sends no Authorization header when signed out', async () => {
    const { api, fetchImpl } = setup(null);
    fetchImpl.mockReturnValue(respond(200, {}));

    await api.get('/api/v1/app-config');

    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test('posts a JSON body', async () => {
    const { api, fetchImpl } = setup(null);
    fetchImpl.mockReturnValue(respond(200, {}));

    await api.post('/api/v1/auth/login', { email: 'a@b.c' });

    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.c' }));
  });

  test('a validation error keeps the first message for each field', async () => {
    const { api, fetchImpl } = setup(null);
    fetchImpl.mockReturnValue(
      respond(422, {
        message: 'That code did not work.',
        errors: { code: ['That code did not work.', 'second'] },
      }),
    );

    const error = await api.post('/api/v1/auth/two-factor', {}).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual({ code: 'That code did not work.' });
  });

  test('a 401 with a token signs the user out and says so plainly', async () => {
    const { api, fetchImpl, onUnauthorized } = setup();
    fetchImpl.mockReturnValue(respond(401, { message: 'Unauthenticated.' }));

    const error = await api.get('/api/v1/me').catch((e) => e);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Your sign-in has expired. Please sign in again.');
  });

  test('a server error shows the safe message the server sent', async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockReturnValue(
      respond(500, { message: 'Something went wrong on our side. Please try again shortly.', reference: 'ref-1' }),
    );

    const error = await api.get('/api/v1/me').catch((e) => e);

    expect(error.status).toBe(500);
    expect(error.message).toBe('Something went wrong on our side. Please try again shortly.');
    expect(error.reference).toBe('ref-1');
  });

  test('a server error with no body still gets a human message', async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockReturnValue(Promise.resolve(new Response('<html>Bad Gateway</html>', { status: 502 })));

    const error = await api.get('/api/v1/me').catch((e) => e);

    expect(error.status).toBe(502);
    expect(error.message).toBe('Something went wrong on our side. Please try again shortly.');
    expect(error.message).not.toContain('html');
  });

  test('no network becomes an offline error, not a crash', async () => {
    const { api, fetchImpl } = setup();
    fetchImpl.mockRejectedValue(new TypeError('Network request failed'));

    const error = await api.get('/api/v1/me').catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toBe('We can’t reach Nalar right now. Check your connection and try again.');
  });
});
