import { MAST_X, MAST_Z } from './layout';

/** Placement of platform furniture, shared by the renderer and the colliders. */
export const DISPLAY_MASTS = MAST_Z.filter((_, i) => i % 2 === 1);
export const NAME_SIGN_MASTS = MAST_Z.filter((_, i) => i % 2 === 0);
export const SECTION_LETTERS = 'ABCDEFG';
export const CLOCK_MAST_Z = MAST_Z[4];
export const BENCH_Z = MAST_Z.filter((_, i) => i % 2 === 0).map((z) => z + 6);
export const BIN_Z = MAST_Z.map((z) => z - 1.1);
export const POSTER_Z = [-8.5, -38.5, 21.5];
// between the bins at mast -46 and the bench at -55 (it used to stand inside that bench)
export const VENDING = { x: MAST_X, z: -49.6 };
export const SMOKING = { x0: 6.8, x1: 9.2, z0: -28.5, z1: -24.0 };
