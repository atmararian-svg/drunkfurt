import { EPISODE_SPANS, EpisodeId } from '../core/timeline';
import { carEpisode } from '../scenes/car/episode';
import { cityEpisode } from '../scenes/city/episode';
import { homeEpisode } from '../scenes/home/episode';
import { stationEpisode } from '../scenes/station/episode';
import type { EpisodeDef } from './types';

/**
 * Episode registry. Built: 1 station, 2 city, 3 car (the getaway, on the
 * city's street), 4 home, "My Cave" (the back room and the portfolio screen, the end of
 * the story). Each lives in scenes/<id>/ with its own episode.ts and is listed
 * here and in EPISODE_SPANS.
 */
export const EPISODES: Partial<Record<EpisodeId, EpisodeDef>> = {
  station: stationEpisode,
  city: cityEpisode,
  car: carEpisode,
  home: homeEpisode,
};

export const PLANNED: { number: number; title: string }[] = [
  { number: 1, title: 'Arrival' },
  { number: 2, title: 'City' },
  { number: 3, title: 'Getaway' },
  { number: 4, title: 'My Cave' },
];

export const builtEpisodes = () => EPISODE_SPANS.map((s) => EPISODES[s.id]!).filter(Boolean);
