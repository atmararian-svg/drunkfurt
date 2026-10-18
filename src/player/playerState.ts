import { Vector3 } from 'three';

/** Read-only snapshot of the visitor, written by the rig each frame. */
export const playerState = {
  position: new Vector3(),
  yaw: 0,
  speed: 0,
};
