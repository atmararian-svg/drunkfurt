import { CameraTrack } from '../../core/cameraTrack';
import { deg } from '../../core/math';
import { BEAT } from './beats';
import { EYE, PORTAL, STATION_FACE_Z } from './layout';

const IN = STATION_FACE_Z + 2.6;
export const cityTrack = new CameraTrack([
  { t: 0.0, pos: [PORTAL.x, EYE, IN], yaw: 0, pitch: deg(1), fov: 42 },
  { t: 0.1, pos: [PORTAL.x, EYE, IN - 0.4], yaw: 0, pitch: deg(2), fov: 44 },
  { t: 0.22, pos: [PORTAL.x + 0.2, EYE, 2.6], yaw: deg(-3), pitch: deg(6), fov: 50 },
  { t: 0.31, pos: [2.2, EYE, 0.2], yaw: deg(30), pitch: deg(1), fov: 52 },
  { t: 0.4, pos: [2.8, EYE, -2.4], yaw: deg(-34), pitch: deg(0), fov: 52 },
  { t: 0.48, pos: [4.6, EYE, -9.0], yaw: deg(-8), pitch: deg(1), fov: 50 },
  { t: 0.55, pos: [6.9, EYE, -17], yaw: deg(-3), pitch: deg(0), fov: 50 },
  { t: 0.62, pos: [6.7, EYE, -26], yaw: deg(0), pitch: deg(0), fov: 50 },
  { t: 0.7, pos: [6.6, EYE, -31.6], yaw: deg(2), pitch: deg(-1), fov: 46 },
  // you stop when he does; the frame tightens to his face and shoulders
  { t: BEAT.stop, pos: [6.52, EYE, -33.7], yaw: deg(2), pitch: deg(-1), fov: 42 },
  { t: BEAT.cock, pos: [6.5, EYE, -34], yaw: deg(2), pitch: deg(-2), fov: 42 },
  // the knife comes up: your eyes drop to it, his face still in the frame
  { t: BEAT.gate, pos: [6.5, EYE, -34], yaw: deg(2), pitch: deg(-8), fov: 50 },
  { t: 0.86, pos: [6.5, EYE, -34], yaw: deg(2), pitch: deg(-8), fov: 50 },
  // after the fight, back in your own eyes where it left you (fight.ts: a step back from where
  // you stood), looking down at him on his back and the letter between you
  { t: BEAT.aftermath, pos: [6.49, EYE, -33.72], yaw: deg(1), pitch: deg(-31), fov: 48 },
  { t: 1.0, pos: [6.49, EYE - 0.02, -33.74], yaw: deg(1), pitch: deg(-30), fov: 46 },
]);
