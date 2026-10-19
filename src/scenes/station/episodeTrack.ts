import { CameraTrack } from '../../core/cameraTrack';
import { deg } from '../../core/math';
import { CAR, DOOR_Z, EYE_HEIGHT, TRACKS } from './layout';

/** Train floor is 0.40 m above the platform. */
const FLOOR_Y = CAR.floor - 0.76;
const DOOR_X = TRACKS.a + CAR.halfWidth;
const IN_DOOR_Y = FLOOR_Y + EYE_HEIGHT - 0.04;

/**
 * Episode 1 camera. Each block of keys is one shot; scrolling moves between them.
 *  0.00–0.10  in the doorway, head out of the train (title)
 *  0.10–0.38  step out: lean, glance at the gap, step down 40 cm, settle
 *  0.38–0.52  a few paces down the platform while a traveller crosses
 *  0.52–0.68  look up at the display: "Zug endet hier"
 *  0.68–0.80  low angle under the name sign, the clock and the vault
 *  0.80–1.00  long lens down the platform towards the concourse; exit
 */
export const stationTrack = new CameraTrack([
  { t: 0.0, pos: [DOOR_X + 0.13, IN_DOOR_Y, DOOR_Z + 0.22], yaw: deg(-17), pitch: deg(-3.5), fov: 54 },
  { t: 0.1, pos: [DOOR_X + 0.15, IN_DOOR_Y, DOOR_Z + 0.18], yaw: deg(-18), pitch: deg(-4), fov: 50 },
  { t: 0.18, pos: [DOOR_X + 0.3, IN_DOOR_Y - 0.03, DOOR_Z - 0.02], yaw: deg(-21), pitch: deg(-24), roll: deg(0.6), fov: 50 },
  { t: 0.26, pos: [DOOR_X + 0.7, IN_DOOR_Y - 0.26, DOOR_Z - 0.16], yaw: deg(-26), pitch: deg(-15), roll: deg(1.4), fov: 52 },
  { t: 0.32, pos: [DOOR_X + 1.05, EYE_HEIGHT - 0.07, DOOR_Z - 0.28], yaw: deg(-22), pitch: deg(-8), roll: deg(-0.6), fov: 54 },
  { t: 0.38, pos: [DOOR_X + 1.55, EYE_HEIGHT, DOOR_Z - 0.55], yaw: deg(-12), pitch: deg(-1.5), fov: 54 },
  { t: 0.5, pos: [2.4, EYE_HEIGHT, -6.0], yaw: deg(-6), pitch: deg(0), fov: 54 },
  { t: 0.6, pos: [3.0, EYE_HEIGHT - 0.02, -10.6], yaw: deg(-7), pitch: deg(22), fov: 46 },
  { t: 0.68, pos: [3.05, EYE_HEIGHT - 0.02, -11.2], yaw: deg(-7), pitch: deg(23), fov: 44 },
  { t: 0.8, pos: [6.3, 1.5, -27.2], yaw: deg(32), pitch: deg(50), roll: deg(-4), fov: 64 },
  { t: 0.88, pos: [3.2, EYE_HEIGHT, -33], yaw: deg(1), pitch: deg(1), fov: 44 },
  { t: 1.0, pos: [3.2, EYE_HEIGHT, -60], yaw: deg(0), pitch: deg(2), fov: 40 },
]);
