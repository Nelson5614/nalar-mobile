import type { SeriesDetail, SeriesEpisode } from '@/lib/types';

/** Opens a video with its series kept, so the watch screen can show the list and play on. */
export const episodeRoute = (episode: SeriesEpisode, seriesId: number) => ({
  pathname: '/watch/[id]' as const,
  params: { id: episode.public_id ?? String(episode.id), series: String(seriesId) },
});

export const canPlay = (series: SeriesDetail, episode: SeriesEpisode) =>
  series.viewer_is_creator || episode.current_user_can_play;
