import type { Collider } from '../../player/FirstPersonRig';
import { MAST_X, MAST_Z } from './layout';

/** Placement of platform furniture, shared by the renderer and the colliders. */
export const DISPLAY_MASTS = MAST_Z.filter((_, i) => i % 2 === 1);
export const NAME_SIGN_MASTS = MAST_Z.filter((_, i) => i % 2 === 0);
export const SECTION_LETTERS = 'ABCDEFG';
export const CLOCK_MAST_Z = MAST_Z[4];
export const BENCH_Z = MAST_Z.filter((_, i) => i % 2 === 0).map((z) => z + 6);
export const BIN_Z = MAST_Z.map((z) => z - 1.1);
export const POSTER_Z = [-8.5, -38.5, 21.5];
export const VENDING = { x: MAST_X, z: -53.5 };
export const SMOKING = { x0: 6.8, x1: 9.2, z0: -28.5, z1: -24.0 };


export const stationColliders: Collider[] = [
  ...MAST_Z.map((z) => ({ kind: 'circle' as const, x: MAST_X, z, r: 0.42 })),
  ...BIN_Z.map((z) => ({ kind: 'circle' as const, x: MAST_X + 0.45, z, r: 0.35 })),
  ...BENCH_Z.map((z) => ({ kind: 'box' as const, x: MAST_X, z, hx: 0.85, hz: 1.2 })),
  ...POSTER_Z.map((z) => ({ kind: 'box' as const, x: MAST_X, z, hx: 0.3, hz: 0.7 })),
  { kind: 'box', x: VENDING.x, z: VENDING.z, hx: 0.65, hz: 0.75 },
  { kind: 'circle', x: SMOKING.x0 + 0.6, z: SMOKING.z0 + 0.6, r: 0.35 },
];
