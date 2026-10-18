/**
 * Station dimensions in metres. Platform surface is y = 0.
 * +z points away from the station head; the concourse and buffer stops are at -z.
 * Frankfurt Hbf is a terminus (Kopfbahnhof): every track ends at the concourse.
 *
 * Real-world references: long-distance platforms 76 cm above rail, platform edge
 * ~1.70 m from track centre, standard gauge 1.435 m, car body ~2.9 m wide.
 */
export const RAIL_TOP = -0.76;
export const TRACK_BED = -1.05;
export const GAUGE = 1.435;

export const PLATFORM = { x0: 0, x1: 10, z0: -101, z1: 92 } as const;
export const PLATFORM_2 = { x0: 13.4, x1: 23.4, z0: -101, z1: 92 } as const;

export const TRACKS = {
  /** Our train (Gleis 7). */
  a: -1.7,
  /** Opposite side of the platform (Gleis 8). */
  b: 11.7,
  /** Next platform's far track (Gleis 9), empty. */
  c: 25.1,
} as const;

export const TRACK_Z = { start: -100, end: 260 } as const;
export const BUFFER_Z = -99.5;

/** Train car geometry (local to track centre, y relative to rail top). */
export const CAR = {
  length: 26.4,
  gap: 0.6,
  halfWidth: 1.45,
  floor: 1.16, // above rail → 0.40 m above the platform
  doorWidth: 0.92,
  doorHeight: 2.0,
  doorInset: 2.05, // door centre distance from the car end
} as const;

/** Our door: car 0 spans [DOOR_Z - length + inset, DOOR_Z + inset]. */
export const DOOR_Z = 0;

/** Train hall: a barrel-vaulted steel arch like the Hbf's 19th-century halls. */
export const HALL = {
  springY: 4.2,
  /** Pier lines between the halls. */
  x0: -6.6,
  x1: 27.6,
  rise: 19.5,
  ribSpacing: 9.4,
  z0: -141,
  z1: 96,
} as const;
export const HALL_SPAN = HALL.x1 - HALL.x0;
export const HALL_CX = (HALL.x0 + HALL.x1) / 2;
/** Neighbouring halls, rendered mostly as structure for depth. */
export const HALL_OFFSETS = [-HALL_SPAN, 0, HALL_SPAN] as const;

export const CONCOURSE = { z0: -101, z1: -141 } as const;

/** Platform lighting masts down the platform centreline. */
export const MAST_X = 5;
export const MAST_Z: number[] = Array.from({ length: 13 }, (_, i) => -91 + i * 15);

export const EYE_HEIGHT = 1.68;
