import { CameraPose, CameraShot } from '../../core/sequence';
import { deg } from '../../core/math';
import { Anchor } from '../../player/FirstPersonRig';
import { CAR, DOOR_Z, EYE_HEIGHT, TRACKS } from './layout';

/**
 * Train floor is 0.40 m above the platform. The visitor stands in the doorway,
 * head leaning a little out of it: only from there does the train side recede
 * towards the vanishing point.
 */
const TRAIN_FLOOR_Y = CAR.floor - 0.76;
const DOOR_PLANE_X = TRACKS.a + CAR.halfWidth;

export const ARRIVAL_ANCHOR: Anchor = {
  position: [DOOR_PLANE_X + 0.13, TRAIN_FLOOR_Y + EYE_HEIGHT - 0.04, DOOR_Z + 0.22],
  yaw: deg(-17),
  pitch: deg(-3.5),
};

/** Final yaw on the platform: looking down the platform towards the concourse, our train on the left. */
const PLATFORM_YAW = deg(-12);

/**
 * Stepping out: lean forward and glance down at the gap, step down 40 cm with
 * a small dip on landing, then settle and lift the gaze down the platform.
 */
export function stepOutShot(from: CameraPose): CameraShot {
  const p = from.position;
  const y0 = p.y;
  return {
    id: 'station/step-out',
    duration: 2.9,
    ease: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    keys: [
      { t: 0, pos: [p.x, y0, p.z], yaw: from.yaw, pitch: from.pitch, roll: 0 },
      { t: 0.24, pos: [DOOR_PLANE_X + 0.3, y0 - 0.03, DOOR_Z - 0.02], yaw: from.yaw - deg(4), pitch: deg(-24), roll: deg(0.6) },
      { t: 0.52, pos: [DOOR_PLANE_X + 0.7, y0 - 0.26, DOOR_Z - 0.16], yaw: deg(-26), pitch: deg(-15), roll: deg(1.4) },
      { t: 0.7, pos: [DOOR_PLANE_X + 1.05, EYE_HEIGHT - 0.07, DOOR_Z - 0.28], yaw: deg(-22), pitch: deg(-8), roll: deg(-0.6) },
      { t: 1, pos: [DOOR_PLANE_X + 1.55, EYE_HEIGHT, DOOR_Z - 0.55], yaw: PLATFORM_YAW, pitch: deg(-1.5), roll: 0 },
    ],
  };
}
