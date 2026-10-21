import { EPISODE_SPANS, EpisodeId } from '../core/timeline';
import { carEpisode } from '../scenes/car/episode';
import { cityEpisode } from '../scenes/city/episode';
import { stationEpisode } from '../scenes/station/episode';
import type { EpisodeDef } from './types';

/**
 * Episode registry. Built: 1 station, 2 city, 3 car (the getaway, on the
 * city's street). Planned: 4 home (portfolio monitor). Each will live in scenes/<id>/
 * with its own episode.ts and be appended here and to EPISODE_SPANS.
 */
export const EPISODES: Partial<Record<EpisodeId, EpisodeDef>> = {
  station: stationEpisode,
  city: cityEpisode,
  car: carEpisode,
};

export const PLANNED: { number: number; title: string }[] = [
  { number: 1, title: 'Arrival' },
  { number: 2, title: 'City' },
  { number: 3, title: 'Getaway' },
  { number: 4, title: 'Home' },
];

export const builtEpisodes = () => EPISODE_SPANS.map((s) => EPISODES[s.id]!).filter(Boolean);
