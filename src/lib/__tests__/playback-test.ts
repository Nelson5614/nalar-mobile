import { ApiError, type Api } from '@/lib/api';
import { resolvePlayback, streamUrl } from '@/lib/playback';
import type { MediaDetail } from '@/lib/types';

const media = (overrides: Partial<MediaDetail> = {}): MediaDetail => ({
  id: 4,
  title: 'Masterclass',
  creator: { id: 6, name: 'Sarah Creator' },
  requires_payment: false,
  is_unlocked: false,
  viewer_is_creator: false,
  playback_pending: false,
  mux_playback_id: 'pb-1',
  required_credits: 0,
  ...overrides,
});

function apiReturning(result: unknown) {
  const get = jest.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { api: { get } as unknown as Api, get };
}

describe('streamUrl', () => {
  test('points at the Mux stream, with the token when there is one', () => {
    expect(streamUrl('pb-1')).toBe('https://stream.mux.com/pb-1.m3u8');
    expect(streamUrl('pb-1', 'tok')).toBe('https://stream.mux.com/pb-1.m3u8?token=tok');
  });
});

describe('resolvePlayback', () => {
  test('a free video plays straight from its playback id, unprotected', async () => {
    const { api, get } = apiReturning(null);

    await expect(resolvePlayback(api, media())).resolves.toEqual({
      kind: 'play',
      url: 'https://stream.mux.com/pb-1.m3u8',
      protect: false,
    });
    expect(get).not.toHaveBeenCalled();
  });

  test('a paid video the viewer has unlocked plays with a fresh token, protected', async () => {
    const { api, get } = apiReturning({ playback_token: 'tok-9', drm_token: null, expires_in: 300 });

    await expect(resolvePlayback(api, media({ requires_payment: true, is_unlocked: true }))).resolves.toEqual({
      kind: 'play',
      url: 'https://stream.mux.com/pb-1.m3u8?token=tok-9',
      protect: true,
    });
    expect(get).toHaveBeenCalledWith('/api/v1/media/4/playback-token');
  });

  test('the creator watches their own paid video the same way', async () => {
    const { api } = apiReturning({ playback_token: 'tok-9' });

    await expect(resolvePlayback(api, media({ requires_payment: true, viewer_is_creator: true }))).resolves.toMatchObject({
      kind: 'play',
      protect: true,
    });
  });

  test('a paid video nobody has unlocked shows its price and asks for no token', async () => {
    const { api, get } = apiReturning(null);

    await expect(resolvePlayback(api, media({ requires_payment: true, required_credits: 30 }))).resolves.toEqual({
      kind: 'locked',
      credits: 30,
    });
    expect(get).not.toHaveBeenCalled();
  });

  test('a video still being prepared says so', async () => {
    const { api } = apiReturning(null);

    await expect(resolvePlayback(api, media({ playback_pending: true }))).resolves.toEqual({
      kind: 'preparing',
      message: 'This video is still being prepared. Please try again in a few minutes.',
    });
  });

  test('the server refusing a token because the video is not ready passes its message on', async () => {
    const { api } = apiReturning(new ApiError(409, 'This video is still being prepared. Please try again in a few minutes.'));

    await expect(resolvePlayback(api, media({ requires_payment: true, is_unlocked: true }))).resolves.toEqual({
      kind: 'preparing',
      message: 'This video is still being prepared. Please try again in a few minutes.',
    });
  });

  test('any other token failure shows the safe message', async () => {
    const { api } = apiReturning(new ApiError(0, 'We can’t reach Nalar right now.'));

    await expect(resolvePlayback(api, media({ requires_payment: true, is_unlocked: true }))).resolves.toEqual({
      kind: 'unavailable',
      message: 'We can’t reach Nalar right now.',
    });
  });

  test('a free video with no stream yet is unavailable', async () => {
    const { api } = apiReturning(null);

    await expect(resolvePlayback(api, media({ mux_playback_id: null }))).resolves.toEqual({
      kind: 'unavailable',
      message: 'This video can’t be played right now.',
    });
  });
});
