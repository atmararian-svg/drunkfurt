import { clamp } from '../../core/math';
import { BENCH_Z } from './props';
import { MAST_X } from './layout';
import { OBSTACLES, PERSON_RADIUS, clearance, isFree, validatePath } from './nav';

/**
 * The people in the station. A deliberately small crowd with explicit routes,
 * so every movement has a reason and stays on walkable ground:
 *
 *  - 'lane'   walks a fixed route back and forth, pausing at each end (looking at
 *             a shop window, waiting for a train) and turning in place before
 *             setting off again. Time-driven.
 *  - 'scroll' walks a route whose progress is a pure function of the episode's
 *             scroll progress, so scrubbing backwards replays it exactly.
 *  - 'stand' / 'sit' stay put and idle.
 *
 * Routes are validated against the obstacle map at load (see nav.ts). At run
 * time, people moving on lanes give way: they slow down and wait when the
 * visitor or anyone else is in front of them, and if they have waited for a
 * while they step half a metre aside, provided that spot is free.
 */
export type Route = [number, number][];

export type Behaviour =
  | { kind: 'lane'; route: Route; speed: number; dwell: number; start?: number; dwellYaw?: number }
  | { kind: 'scroll'; route: Route; t0: number; t1: number }
  | { kind: 'stand'; x: number; z: number; yaw: number; activity?: 'phone' | 'smoke' | 'wait' }
  | { kind: 'sit'; x: number; z: number; yaw: number };

export interface Look {
  height: number;
  build: 'coat' | 'jacket';
  shade: number;
  hat?: boolean;
  carry?: 'suitcase' | 'backpack' | 'bag';
}

export interface PersonDef {
  name: string;
  b: Behaviour;
  look: Look;
}

const BENCH_55 = BENCH_Z[1];

export const PEOPLE: PersonDef[] = [
  // platform 7/8: lanes keep to their own strip of floor, clear of the masts and furniture line
  { name: 'suitcase', b: { kind: 'lane', route: [[7.4, -34], [7.4, -95]], speed: 1.1, dwell: 3, start: 0.15 }, look: { height: 1.78, build: 'coat', shade: 0, carry: 'suitcase' } },
  { name: 'commuter', b: { kind: 'lane', route: [[1.6, -88], [1.6, -40]], speed: 1.3, dwell: 5, start: 0.6 }, look: { height: 1.84, build: 'jacket', shade: 1, carry: 'backpack' } },
  { name: 'pacer', b: { kind: 'lane', route: [[6.3, -70], [6.3, -36]], speed: 1.15, dwell: 6, start: 0.3 }, look: { height: 1.7, build: 'coat', shade: 2, carry: 'bag' } },
  { name: 'late one', b: { kind: 'lane', route: [[6.7, 24], [6.7, 80]], speed: 1.35, dwell: 4, start: 0.5 }, look: { height: 1.76, build: 'jacket', shade: 0 } },
  // the traveller who cuts in front of you, around the poster case, towards the train
  { name: 'traveller', b: { kind: 'scroll', route: [[8.4, -14.4], [5.0, -11.7], [2.3, -9.7], [1.6, -8.6]], t0: 0.4, t1: 0.56 }, look: { height: 1.86, build: 'coat', shade: 0, hat: true } },
  { name: 'phone', b: { kind: 'stand', x: 8.35, z: -42, yaw: Math.PI / 2, activity: 'phone' }, look: { height: 1.72, build: 'coat', shade: 3 } },
  { name: 'smoker', b: { kind: 'stand', x: 8.2, z: -25.6, yaw: Math.PI * 0.8, activity: 'smoke' }, look: { height: 1.81, build: 'jacket', shade: 1 } },
  // on the bench, facing Gleis 7 (seat side at x < mast)
  { name: 'sitter', b: { kind: 'sit', x: MAST_X - 0.36, z: BENCH_55 + 0.45, yaw: -Math.PI / 2 }, look: { height: 1.75, build: 'coat', shade: 2, hat: true } },
  { name: 'waiting', b: { kind: 'stand', x: 3.2, z: -79, yaw: Math.PI, activity: 'wait' }, look: { height: 1.66, build: 'coat', shade: 3, carry: 'suitcase' } },
  // concourse: one person per lane, between shop windows; lanes run between the pier rows
  { name: 'c1', b: { kind: 'lane', route: [[-18, -107.8], [20, -107.8]], speed: 1.25, dwell: 2.5, start: 0.1, dwellYaw: Math.PI }, look: { height: 1.74, build: 'coat', shade: 1 } },
  { name: 'c2', b: { kind: 'lane', route: [[30, -110.2], [-4, -110.2]], speed: 1.1, dwell: 3, start: 0.45, dwellYaw: Math.PI }, look: { height: 1.8, build: 'jacket', shade: 0, carry: 'bag' } },
  { name: 'c3', b: { kind: 'lane', route: [[-14, -117.4], [24, -117.4]], speed: 1.3, dwell: 2, start: 0.7, dwellYaw: Math.PI }, look: { height: 1.69, build: 'coat', shade: 2 } },
  { name: 'c4', b: { kind: 'lane', route: [[22, -119.9], [-20, -119.9]], speed: 1.2, dwell: 3.5, start: 0.25, dwellYaw: Math.PI }, look: { height: 1.83, build: 'jacket', shade: 3, carry: 'backpack' } },
  { name: 'c5', b: { kind: 'lane', route: [[6, -126.6], [38, -126.6]], speed: 1.05, dwell: 4, start: 0.85, dwellYaw: Math.PI }, look: { height: 1.72, build: 'coat', shade: 0, hat: true } },
  { name: 'c6', b: { kind: 'lane', route: [[-10, -134.5], [16, -134.5]], speed: 0.9, dwell: 5, start: 0.4, dwellYaw: Math.PI }, look: { height: 1.77, build: 'coat', shade: 1 } },
];

// ---------------------------------------------------------------------------
// Route geometry

interface Path {
  pts: Route;
  cum: number[];
  length: number;
}

function makePath(route: Route): Path {
  const cum = [0];
  for (let i = 1; i < route.length; i++)
    cum.push(cum[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  return { pts: route, cum, length: cum[cum.length - 1] };
}

/** Position and heading at arc length s. Heading is blended across corners (0.6 m) so turns are not snapped. */
function along(p: Path, s: number, dir: 1 | -1) {
  s = clamp(s, 0, p.length);
  let i = 0;
  while (i < p.pts.length - 2 && s > p.cum[i + 1]) i++;
  const [ax, az] = p.pts[i];
  const [bx, bz] = p.pts[i + 1];
  const segLen = p.cum[i + 1] - p.cum[i] || 1;
  const u = (s - p.cum[i]) / segLen;
  const x = ax + (bx - ax) * u;
  const z = az + (bz - az) * u;
  const yawOf = (j: number) => Math.atan2(p.pts[j + 1][0] - p.pts[j][0], p.pts[j + 1][1] - p.pts[j][1]);
  let yaw = yawOf(i);
  const BLEND = 0.6;
  if (i < p.pts.length - 2 && p.cum[i + 1] - s < BLEND) {
    yaw = lerpAngle(yaw, yawOf(i + 1), 0.5 * (1 - (p.cum[i + 1] - s) / BLEND));
  } else if (i > 0 && s - p.cum[i] < BLEND) {
    yaw = lerpAngle(yawOf(i - 1), yaw, 0.5 + 0.5 * ((s - p.cum[i]) / BLEND));
  }
  if (dir < 0) yaw += Math.PI;
  return { x, z, yaw };
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function approachAngle(a: number, b: number, maxStep: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -maxStep, maxStep);
}

// ---------------------------------------------------------------------------
// Simulation

export interface PersonState {
  x: number;
  z: number;
  yaw: number;
  /** Ground speed (m/s), drives the walk cycle. */
  speed: number;
  /** Walk-cycle phase in radians; advanced by distance, so feet never slide. */
  phase: number;
  /** Turning in place (rad/s), drives small stepping when not walking. */
  turn: number;
  // lane internals
  s: number;
  dir: 1 | -1;
  dwell: number;
  waited: number;
  /** Current and wanted sideways offset from the lane (m), for stepping aside. */
  side: number;
  sideTarget: number;
}

export interface Crowd {
  people: PersonDef[];
  state: PersonState[];
  paths: (Path | null)[];
}

export function createCrowd(defs = PEOPLE): Crowd {
  const paths = defs.map((d) => (d.b.kind === 'lane' || d.b.kind === 'scroll' ? makePath(d.b.route) : null));
  const state = defs.map((d, i): PersonState => {
    const b = d.b;
    const p = paths[i];
    if (b.kind === 'lane' && p) {
      const s = (b.start ?? 0) * p.length;
      const pos = along(p, s, 1);
      return { ...pos, speed: 0, phase: 0, turn: 0, s, dir: 1, dwell: 0, waited: 0, side: 0, sideTarget: 0 };
    }
    if (b.kind === 'scroll' && p) {
      const pos = along(p, 0, 1);
      return { ...pos, speed: 0, phase: 0, turn: 0, s: 0, dir: 1, dwell: 0, waited: 0, side: 0, sideTarget: 0 };
    }
    const sb = b as { x: number; z: number; yaw: number };
    return { x: sb.x, z: sb.z, yaw: sb.yaw, speed: 0, phase: 0, turn: 0, s: 0, dir: 1, dwell: 0, waited: 0, side: 0, sideTarget: 0 };
  });
  return { people: defs, state, paths };
}

/** Load-time sanity check: every route must be walkable. Returns readable problems. */
export function validateCrowd(defs = PEOPLE) {
  const out: string[] = [];
  for (const d of defs) {
    if (d.b.kind === 'lane' || d.b.kind === 'scroll') {
      validatePath(d.b.route).forEach((p) => out.push(`${d.name}: ${p}`));
    } else if (!isFree(d.b.x, d.b.z, d.b.kind === 'sit' ? 0 : PERSON_RADIUS)) {
      if (d.b.kind !== 'sit') out.push(`${d.name}: stands inside an obstacle or off the walkable area`);
    }
  }
  return out;
}

const MAX_TURN = 2.6; // rad/s while turning in place
const ACCEL = 1.6; // m/s²
const AHEAD = 1.25; // metres of personal space ahead
const LATERAL = 0.62;
/** Sidestep distance: clears the personal-space corridor of whoever is in the way. */
const STEP_ASIDE = 0.8;

/** Distance ahead of `a` (along heading) to the nearest blocker in its corridor, or Infinity. */
function blockedAhead(x: number, z: number, yaw: number, others: { x: number; z: number }[]) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let best = Infinity;
  for (const o of others) {
    const dx = o.x - x;
    const dz = o.z - z;
    const along = dx * fx + dz * fz;
    if (along <= 0.05 || along > AHEAD + 0.6) continue;
    const lat = Math.abs(dx * fz - dz * fx);
    if (lat < LATERAL) best = Math.min(best, along);
  }
  return best;
}

/** Where everyone stood after the last step (read by the pigeon). */
export const crowdPositions: { x: number; z: number }[] = [];

/**
 * Advances the crowd. `scrollT` is the episode's local progress; `visitor` is
 * where the camera stands on the ground.
 */
export function stepCrowd(c: Crowd, dt: number, scrollT: number, visitor: { x: number; z: number }) {
  const positions = c.state.map((s) => ({ x: s.x, z: s.z }));
  c.people.forEach((d, i) => {
    const st = c.state[i];
    const b = d.b;
    const path = c.paths[i];
    const prevX = st.x;
    const prevZ = st.z;
    const prevYaw = st.yaw;

    if (b.kind === 'scroll' && path) {
      const u = clamp((scrollT - b.t0) / (b.t1 - b.t0), 0, 1);
      // ease in and out of the walk so the first and last steps aren't abrupt
      const e = u * u * (3 - 2 * u);
      const pos = along(path, e * path.length, 1);
      st.x = pos.x;
      st.z = pos.z;
      st.yaw = pos.yaw;
    } else if (b.kind === 'lane' && path) {
      const target = st.dir > 0 ? path.length : 0;
      const pos = along(path, st.s, st.dir);
      if (st.dwell > 0) {
        // at the end of the lane: face the shop window / platform, then turn back
        st.dwell -= dt;
        const face = b.dwellYaw ?? pos.yaw;
        const want = st.dwell > 0.8 ? face : pos.yaw + Math.PI;
        st.yaw = approachAngle(st.yaw, want, MAX_TURN * dt);
        if (st.dwell <= 0) st.dir = st.dir > 0 ? -1 : 1;
        st.speed = Math.max(0, st.speed - ACCEL * 2 * dt);
      } else {
        const heading = along(path, st.s, st.dir).yaw;
        // never walk off sideways: finish turning before moving
        st.yaw = approachAngle(st.yaw, heading, MAX_TURN * dt);
        const aligned = Math.abs(lerpAngle(st.yaw, heading, 1) - st.yaw) < 0.3;
        const others = positions.filter((_, j) => j !== i);
        others.push(visitor);
        const gap = blockedAhead(st.x, st.z, st.yaw, others);
        // slow to a stop before the blocker, keep a body length of space
        const free = gap === Infinity ? b.speed : clamp((gap - 0.75) / 0.6, 0, 1) * b.speed;
        const want = aligned ? free : 0;
        st.speed = want > st.speed ? Math.min(want, st.speed + ACCEL * dt) : Math.max(want, st.speed - ACCEL * 2 * dt);
        st.waited = st.speed < 0.05 && gap !== Infinity ? st.waited + dt : Math.max(0, st.waited - dt);
        st.s = clamp(st.s + st.dir * st.speed * dt, 0, path.length);
        if (Math.abs(st.s - target) < 1e-3) st.dwell = b.dwell;

        // after a long wait, step aside (to whichever side is free)…
        if (st.waited > 2.2 && st.sideTarget === 0) {
          const c0 = along(path, st.s, st.dir);
          const rx = Math.cos(c0.yaw);
          const rz = -Math.sin(c0.yaw);
          if (isFree(c0.x + rx * STEP_ASIDE, c0.z + rz * STEP_ASIDE)) st.sideTarget = STEP_ASIDE;
          else if (isFree(c0.x - rx * STEP_ASIDE, c0.z - rz * STEP_ASIDE)) st.sideTarget = -STEP_ASIDE;
          st.waited = 0;
        }
        // …and drift back to the lane only once nobody is within reach
        if (st.sideTarget !== 0) {
          const near = others.some((o) => Math.hypot(o.x - st.x, o.z - st.z) < 2.2);
          if (!near && Math.abs(st.side - st.sideTarget) < 0.01) st.sideTarget = 0;
        }
        const sideRate = 0.7 * dt; // a calm diagonal step, not a slide
        st.side += clamp(st.sideTarget - st.side, -sideRate, sideRate);
      }
      const c0 = along(path, st.s, st.dir);
      const rx = Math.cos(c0.yaw);
      const rz = -Math.sin(c0.yaw);
      st.x = c0.x + rx * st.side;
      st.z = c0.z + rz * st.side;
    }

    // walk cycle driven by distance actually covered (no foot sliding, stops when they stop)
    const moved = Math.hypot(st.x - prevX, st.z - prevZ);
    if (b.kind === 'scroll') st.speed = moved / Math.max(dt, 1e-4);
    st.phase += (moved / 0.72) * Math.PI;
    const turned = Math.abs(lerpAngle(prevYaw, st.yaw, 1) - prevYaw);
    st.turn = turned / Math.max(dt, 1e-4);
    if (moved < 1e-4) st.phase += turned * 1.2; // shuffle the feet while turning
  });
  crowdPositions.length = 0;
  c.state.forEach((s) => crowdPositions.push({ x: s.x, z: s.z }));
}

/** Smallest clearance from any person to any obstacle (for tests). */
export function worstObstacleClearance(c: Crowd) {
  let worst = Infinity;
  let who = '';
  c.state.forEach((s, i) => {
    if (c.people[i].b.kind === 'sit') return;
    for (const o of OBSTACLES) {
      const d = clearance(o, s.x, s.z) - PERSON_RADIUS;
      if (d < worst) {
        worst = d;
        who = `${c.people[i].name} vs ${o.what}`;
      }
    }
  });
  return { worst, who };
}
