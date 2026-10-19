import { clamp, smoothstep } from '../../core/math';
import type { CameraPose } from '../../core/sequence';
import type { EpisodeDef } from '../../episodes/types';
import { CityScene } from './CityScene';
import { BEAT, encounter } from './encounter';
import { cityTrack } from './track';

/**
 * Episode 2 camera, by beat (local progress):
 *  0.00–0.10  under the station portal, behind the ink and the title
 *  0.10–0.22  out onto the square: the street, the houses, the towers
 *  0.22–0.40  a look around: the kiosk on the left, the tram stop on the right
 *  0.40–0.60  across the zebra and down the right sidewalk
 *  0.60–0.72  a man leaves a doorway ahead and walks towards you
 *  0.72–0.845 he closes in; everything slows to a tenth
 *  0.845      DEFEND (the story waits here)
 *  0.85–0.905 the strike, under ink
 *  0.905–1.00 aftermath: a new angle on the same spot
 */
/** While he approaches, the camera turns a little to keep him in frame. */
function keepStrangerInFrame(local: number, pose: CameraPose) {
  if (local < BEAT.strangerMoves - 0.02 || local > BEAT.cut) return;
  const w = 0.6 * smoothstep(clamp((local - (BEAT.strangerMoves - 0.02)) / 0.12, 0, 1));
  const dx = encounter.stranger.x - pose.position.x;
  const dz = encounter.stranger.z - pose.position.z;
  if (Math.hypot(dx, dz) < 0.5) return;
  const want = Math.atan2(-dx, -dz);
  const d = Math.atan2(Math.sin(want - pose.yaw), Math.cos(want - pose.yaw));
  pose.yaw += d * w;
}

export const cityEpisode: EpisodeDef = {
  id: 'city',
  number: 2,
  title: 'City',
  subtitle: 'Outside Frankfurt (Main) Hbf · 23:59',
  World: CityScene,
  track: cityTrack,
  adjustPose: keepStrangerInFrame,
  beats: [0, 0.12, 0.22, 0.31, 0.4, 0.5, 0.62, 0.72, BEAT.gate, 0.95, 1],
  captions: [
    { from: 0.14, to: 0.27, place: 'tl', kicker: 'Midnight, give or take', text: 'Outside, the city was awake. Not in a good way.' },
    { from: 0.3, to: 0.41, place: 'br', text: 'Banks at the end of the street. Everyone else down here.' },
    { from: 0.46, to: 0.58, place: 'tl', text: 'Twelve minutes in Drunkfurt. Nothing had happened yet.' },
    { from: 0.64, to: 0.76, place: 'bl', tone: 'yellow', text: 'Some people walk somewhere. He was walking at me.' },
    { from: 0.94, to: 0.995, place: 'br', tone: 'yellow', text: 'He wanted my bag. He got the sidewalk.' },
  ],
};
