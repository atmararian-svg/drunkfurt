import { EPISODE_SPANS, EpisodeId } from '../core/timeline';
import { stationEpisode } from '../scenes/station/episode';
import type { EpisodeDef } from './types';

/**
 * Episode registry. Planned: 2 city (skyline reveal), 3 confrontation (slow
 * motion), 4 car, 5 home (portfolio monitor). Each will live in scenes/<id>/
 * with its own episode.ts and be appended here and to EPISODE_SPANS.
 */
export const EPISODES: Partial<Record<EpisodeId, EpisodeDef>> = {
  station: stationEpisode,
};

export const PLANNED: { number: number; title: string }[] = [
  { number: 1, title: 'Ankunft' },
  { number: 2, title: 'Die Stadt' },
  { number: 3, title: 'Zeitlupe' },
  { number: 4, title: 'Der Wagen' },
  { number: 5, title: 'Zuhause' },
];

export const builtEpisodes = () => EPISODE_SPANS.map((s) => EPISODES[s.id]!).filter(Boolean);
