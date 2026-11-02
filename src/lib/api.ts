const OFFLINE_MESSAGE = 'We can’t reach Nalar right now. Check your connection and try again.';
const SERVER_MESSAGE = 'Something went wrong on our side. Please try again shortly.';
const EXPIRED_MESSAGE = 'Your sign-in has expired. Please sign in again.';

/**
 * Status 0 means the request never reached the server. `message` is always
 * safe to show: it is either the server's own user-facing text or one of ours.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors: Record<string, string> = {},
    public reference?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Options = {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  onUnauthorized: () => void | Promise<void>;
  fetchImpl?: typeof fetch;
};

export type Api = ReturnType<typeof createApi>;

export function createApi({ baseUrl, getToken, onUnauthorized, fetchImpl = fetch }: Options) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, OFFLINE_MESSAGE);
    }

    const json = await response.json().catch(() => null);

    if (response.ok) return json as T;

    if (response.status === 401 && token) {
      await onUnauthorized();
      throw new ApiError(401, EXPIRED_MESSAGE);
    }

    // Anything that is not a JSON body with a message (a proxy's HTML page,
    // an empty 502) gets our generic text rather than whatever came back.
    const message = typeof json?.message === 'string' ? json.message : SERVER_MESSAGE;
    const fieldErrors: Record<string, string> = {};
    for (const [field, messages] of Object.entries(json?.errors ?? {})) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') fieldErrors[field] = messages[0];
    }

    throw new ApiError(response.status, message, fieldErrors, json?.reference);
  }

  return {
    get: <T = any>(path: string) => request<T>('GET', path),
    post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body),
    delete: <T = any>(path: string) => request<T>('DELETE', path),
  };
}
