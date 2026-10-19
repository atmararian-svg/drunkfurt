/**
 * Walkable space for people in a scene, in the ground plane (x, z): areas they
 * may stand in and obstacle footprints they must keep clear of. Each scene
 * builds one from its own placement data (see scenes/<id>/nav.ts).
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

export interface Nav {
  regions: Region[];
  obstacles: Obstacle[];
  inRegion(x: number, z: number, margin?: number): boolean;
  isFree(x: number, z: number, radius?: number): boolean;
  validatePath(points: [number, number][], radius?: number): string[];
}

/** Distance from a point to an obstacle's surface (negative inside). */
export function clearance(o: Obstacle, x: number, z: number) {
  if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.hx;
  const dz = Math.abs(z - o.z) - o.hz;
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}

export function makeNav(regions: Region[], obstacles: Obstacle[]): Nav {
  const inRegion = (x: number, z: number, margin = 0) =>
    regions.some((r) => x >= r.x0 + margin && x <= r.x1 - margin && z >= r.z0 + margin && z <= r.z1 - margin);
  const isFree = (x: number, z: number, radius = PERSON_RADIUS) =>
    inRegion(x, z) && obstacles.every((o) => clearance(o, x, z) >= radius);
  /** Checks every 5 cm of a polyline; returns readable problems (empty when walkable). */
  const validatePath = (points: [number, number][], radius = PERSON_RADIUS + 0.08) => {
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
        const hit = obstacles.find((o) => clearance(o, x, z) < radius);
        if (hit) {
          problems.push(`hits ${hit.what} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
          break;
        }
      }
    }
    return problems;
  };
  return { regions, obstacles, inRegion, isFree, validatePath };
}
