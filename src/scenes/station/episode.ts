import type { EpisodeDef } from '../../episodes/types';
import { stationTrack } from './episodeTrack';
import { StationScene } from './StationScene';
import { TOUCH } from '../../ui/touch';

export const stationEpisode: EpisodeDef = {
  id: 'station',
  number: 1,
  title: 'Arrival',
  subtitle: 'Frankfurt (Main) Hbf · Platform 7 · 23:47',
  World: StationScene,
  track: stationTrack,
  beats: [0, 0.12, 0.38, 0.5, 0.64, 0.8, 0.9, 1],
  captions: [
    // the first thing to do, in the system's ACTION box (as the letter's and the screen's): it goes as the page moves
    { from: 0, to: 0.008, place: 'bl', tone: 'tip', plain: true, text: TOUCH ? 'Swipe up to begin the Drunkfurt story.' : 'Scroll down to begin the Drunkfurt story.' },
    { from: 0.12, to: 0.3, place: 'tl', kicker: 'Platform 7 · 23:47', text: 'On time. In Germany that already counts as a plot twist.', voice: '01' },
    { from: 0.4, to: 0.53, place: 'br', text: 'Frankfurt. Maybe Drunkfurt would be a better fit. Bankers, pigeons, and people who stopped asking why the train is late.', voice: '02' },
    { from: 0.57, to: 0.7, place: 'bl', tone: 'yellow', kicker: 'This train ends here', text: 'Yeah, most plans do too.', voice: '03' },
    { from: 0.74, to: 0.84, place: 'tr', kicker: '1888', text: 'Steel, glass, and a hundred and thirty years of soot.', voice: '04' },
    { from: 0.88, to: 0.955, place: 'br', tone: 'yellow', text: 'The city is waiting outside. It is not waiting politely.', voice: '05' },
  ],
};
