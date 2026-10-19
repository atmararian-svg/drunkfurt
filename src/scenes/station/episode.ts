import type { EpisodeDef } from '../../episodes/types';
import { stationTrack } from './episodeTrack';
import { StationScene } from './StationScene';

export const stationEpisode: EpisodeDef = {
  id: 'station',
  number: 1,
  title: 'Ankunft',
  subtitle: 'Frankfurt (Main) Hbf · Gleis 7 · 23:47',
  World: StationScene,
  track: stationTrack,
  beats: [0, 0.12, 0.38, 0.5, 0.64, 0.8, 0.9, 1],
  captions: [
    { from: 0.12, to: 0.3, place: 'tl', kicker: 'Gleis 7 · 23:47', text: 'On time. In Germany that already counts as a plot twist.' },
    { from: 0.4, to: 0.53, place: 'br', text: 'Frankfurt. Bankers, pigeons, and people who stopped asking why the train is late.' },
    { from: 0.57, to: 0.7, place: 'bl', tone: 'yellow', kicker: 'Zug endet hier', text: 'This train ends here. Most plans do too.' },
    { from: 0.74, to: 0.84, place: 'tr', kicker: '1888', text: 'Steel, glass, and a hundred and thirty years of soot.' },
    { from: 0.88, to: 0.99, place: 'br', tone: 'yellow', text: 'The city is waiting outside. It is not waiting politely.' },
  ],
};
