import { HALL, HALL_OFFSETS, CONCOURSE, MAST_X, MAST_Z, PLATFORM } from './layout';
import { BENCH_Z, BIN_Z, POSTER_Z, SMOKING, VENDING } from './props';

/**
 * Walkable space for the people in the station, in the ground plane (x, z).
 * Footprints come from the same placement data the furniture is built from,
 * so the obstacles here are exactly the objects on screen.
 */
export type Obstacle =
  | { kind: 'circle'; x: number; z: number; r: number; what: string }
  | { kind: 'box'; x: number; z: number; hx: number; hz: number; what: string };

export interface Region {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  what: string;
}

/** Body radius of a standing adult, shoulders included. */
export const PERSON_RADIUS = 0.28;

/**
 * Areas people may stand in. On the platform that is behind the white safety
 * lines (1.24 m from each edge); the concourse runs from the platform heads to
 * the shopfronts.
 */
export const REGIONS: Region[] = [
  { x0: PLATFORM.x0 + 1.3, x1: PLATFORM.x1 - 1.3, z0: PLATFORM.z0 + 0.5, z1: PLATFORM.z1 - 1, what: 'platform 7/8' },
  { x0: HALL.x0 + HALL_OFFSETS[0], x1: HALL.x1 + HALL_OFFSETS[2], z0: CONCOURSE.z1 + 0.9, z1: CONCOURSE.z0 - 4, what: 'concourse' },
];

const ribZ: number[] = [];
for (let z = HALL.z0; z <= HALL.z1 + 0.01; z += HALL.ribSpacing) ribZ.push(z);

export const OBSTACLES: Obstacle[] = [
  ...MAST_Z.map((z) => ({ kind: 'circle' as const, x: MAST_X, z, r: 0.22, what: `mast ${z}` })),
  // pair of bins, both cylinders
  ...BIN_Z.map((z) => ({ kind: 'box' as const, x: MAST_X + 0.45, z, hx: 0.22, hz: 0.44, what: `bins ${z}` })),
  // back-to-back benches incl. leg frames
  ...BENCH_Z.map((z) => ({ kind: 'box' as const, x: MAST_X, z, hx: 0.62, hz: 1.08, what: `bench ${z}` })),
  ...POSTER_Z.map((z) => ({ kind: 'box' as const, x: MAST_X, z, hx: 0.1, hz: 0.6, what: `poster case ${z}` })),
  { kind: 'box', x: VENDING.x, z: VENDING.z, hx: 0.42, hz: 0.53, what: 'vending machine' },
  { kind: 'circle', x: SMOKING.x0 + 0.6, z: SMOKING.z0 + 0.6, r: 0.18, what: 'ashtray' },
  { kind: 'circle', x: SMOKING.x1 - 0.2, z: SMOKING.z0 + 0.2, r: 0.06, what: 'smoking sign post' },
  // hall piers, which stand in the concourse too
  ...[HALL.x0, HALL.x1, HALL.x0 + HALL_OFFSETS[0], HALL.x1 + HALL_OFFSETS[2]].flatMap((x) =>
    ribZ.map((z) => ({ kind: 'box' as const, x, z, hx: 0.65, hz: 0.75, what: `pier ${x},${z.toFixed(1)}` })),
  ),
];

/** Distance from a point to an obstacle's surface (negative inside). */
export function clearance(o: Obstacle, x: number, z: number) {
  if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.hx;
  const dz = Math.abs(z - o.z) - o.hz;
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}

export function inRegion(x: number, z: number, margin = 0) {
  return REGIONS.some((r) => x >= r.x0 + margin && x <= r.x1 - margin && z >= r.z0 + margin && z <= r.z1 - margin);
}

/** Can a person of the given radius stand here? */
export function isFree(x: number, z: number, radius = PERSON_RADIUS) {
  return inRegion(x, z) && OBSTACLES.every((o) => clearance(o, x, z) >= radius);
}

/**
 * Checks every 5 cm of a polyline against regions and obstacles. Returns the
 * problems found (empty when the path is walkable).
 */
export function validatePath(points: [number, number][], radius = PERSON_RADIUS + 0.08) {
  const problems: string[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const z = az + ((bz - az) * k) / n;
      if (!inRegion(x, z)) {
        problems.push(`leaves walkable area at (${x.toFixed(2)}, ${z.toFixed(2)})`);
        break;
      }
      const hit = OBSTACLES.find((o) => clearance(o, x, z) < radius);
      if (hit) {
        problems.push(`hits ${hit.what} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
        break;
      }
    }
  }
  return problems;
}
