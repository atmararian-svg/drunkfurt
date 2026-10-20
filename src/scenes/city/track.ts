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
  { t: BEAT.aftermath, pos: [5.4, 1.45, -32.6], yaw: deg(-22), pitch: deg(-20), fov: 46 },
  { t: 1.0, pos: [5.5, 1.4, -32.9], yaw: deg(-24), pitch: deg(-21), fov: 44 },
]);
