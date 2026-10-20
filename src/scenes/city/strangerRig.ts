import type { Landmarks } from '../../characters/meshRig';

export const HEIGHT = 1.82;

/**
 * Where his joints are on the model (measured from the mesh, metres, feet on
 * y = 0, facing +z). "L" is the -x side, as in the procedural rig.
 */
export const LANDMARKS: Landmarks = {
  height: HEIGHT,
  hips: [0.03, 0.9, 0.0],
  waist: [0.02, 1.02, -0.02],
  neck: [-0.04, 1.55, -0.01],
  headTop: [-0.14, 1.82, 0.02],
  shoulder: [[-0.2, 1.45, -0.03], [0.19, 1.45, 0.0]],
  elbow: [[-0.27, 1.12, -0.08], [0.27, 1.12, 0.01]],
  wrist: [[-0.26, 0.9, -0.02], [0.25, 0.9, 0.08]],
  fingertips: [[-0.24, 0.75, 0.0], [0.22, 0.76, 0.07]],
  hip: [[-0.06, 0.9, -0.02], [0.12, 0.9, 0.02]],
  knee: [[-0.09, 0.49, -0.035], [0.175, 0.49, 0.07]],
  ankle: [[-0.05, 0.1, -0.03], [0.16, 0.1, 0.0]],
  toe: [[-0.06, 0.04, 0.14], [0.19, 0.04, 0.16]],
  face: [[-0.165, 1.632, 0], [-0.098, 1.632, 0], [-0.13, 1.556, 0]],
  faceTilt: [0.68, 0.28],
};
