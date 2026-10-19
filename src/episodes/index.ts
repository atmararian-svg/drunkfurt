import { EPISODE_SPANS, EpisodeId } from '../core/timeline';
import { cityEpisode } from '../scenes/city/episode';
import { stationEpisode } from '../scenes/station/episode';
import type { EpisodeDef } from './types';

/**
 * Episode registry. Built: 1 station, 2 city. Planned: 3 slow motion,
 * 4 car, 5 home (portfolio monitor). Each will live in scenes/<id>/
 * with its own episode.ts and be appended here and to EPISODE_SPANS.
 */
export const EPISODES: Partial<Record<EpisodeId, EpisodeDef>> = {
  station: stationEpisode,
  city: cityEpisode,
};

export const PLANNED: { number: number; title: string }[] = [
  { number: 1, title: 'Arrival' },
  { number: 2, title: 'City' },
  { number: 3, title: 'Slow Motion' },
  { number: 4, title: 'The Car' },
  { number: 5, title: 'Home' },
];

export const builtEpisodes = () => EPISODE_SPANS.map((s) => EPISODES[s.id]!).filter(Boolean);
