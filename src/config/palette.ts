/**
 * Drunkfurt palette. Monochrome base with a single yellow accent.
 * Red is reserved for narrative moments and intentionally unused in the station scene.
 */
export const palette = {
  nearBlack: '#101010',
  charcoal: '#1b1b1b',
  graphite: '#2a2a2a',
  grey: '#777777',
  lightGrey: '#b4b3ae',
  offWhite: '#f1f0e9',
  yellow: '#f5d21a',
  red: '#d53a32',
  /** Slightly cool white for station fluorescents. */
  lampWhite: '#eef1f4',
  /** Slightly warm white for train interiors, kept very close to neutral. */
  interiorWhite: '#fff3df',
  sky: '#0c0d10',
  fog: '#0e0e10',
} as const;
