import { ApiError, type Api } from '@/lib/api';
import type { MediaDetail } from '@/lib/types';

export type Playback =
  | { kind: 'play'; url: string; protect: boolean }
  | { kind: 'locked'; credits: number }
  | { kind: 'preparing'; message: string }
  | { kind: 'unavailable'; message: string };

const PREPARING = 'This video is still being prepared. Please try again in a few minutes.';
const UNAVAILABLE = 'This video can’t be played right now.';

export const streamUrl = (playbackId: string, token?: string) =>
  `https://stream.mux.com/${playbackId}.m3u8${token ? `?token=${token}` : ''}`;

/**
 * Decides how the watch screen plays a video. Paid video always streams with a
 * short-lived signed token and is played protected (watermark, capture
 * blocked); the server refuses a token to anyone who has not unlocked it, so
 * the locked check here only saves a round trip.
 */
export async function resolvePlayback(api: Api, media: MediaDetail): Promise<Playback> {
  if (media.playback_pending) return { kind: 'preparing', message: PREPARING };
  if (!media.mux_playback_id) return { kind: 'unavailable', message: UNAVAILABLE };

  if (!media.requires_payment) {
    return { kind: 'play', url: streamUrl(media.mux_playback_id), protect: false };
  }

  if (!media.is_unlocked && !media.viewer_is_creator) {
    return { kind: 'locked', credits: media.required_credits ?? 0 };
  }

  try {
    const { playback_token } = await api.get<{ playback_token: string }>(`/api/v1/media/${media.id}/playback-token`);

    return { kind: 'play', url: streamUrl(media.mux_playback_id, playback_token), protect: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { kind: 'preparing', message: e.message };

    return { kind: 'unavailable', message: e instanceof ApiError ? e.message : UNAVAILABLE };
  }
}
