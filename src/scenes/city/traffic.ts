/**
 * City traffic: a few scripted cars on fixed lanes, kept from ever touching
 * each other, the parked cars or the visitor.
 *
 *  - Every car is an oriented box (body and tyres, plus a small margin) moving
 *    along its lane: a polyline with rounded corners, sampled by arc length,
 *    so position and heading are a smooth function of distance travelled.
 *  - Each step a car looks ahead along its own lane (as far as it needs to
 *    stop, plus a following gap) and sweeps its box over that stretch. The
 *    first place its box would touch a parked car, the visitor, or another
 *    car is where it must be able to stop; its speed is capped to do that at
 *    a comfortable deceleration.
 *  - Where two lanes cross or merge, both cars see the conflict. The one that
 *    would get there later yields (ties go to the lane with priority), so
 *    one slows or waits and the other goes.
 *  - Last line of defence: a move that would make two boxes overlap is not
 *    made. Boxes can only ever touch if one is spawned into another, and
 *    spawning waits until the entry is clear.
 *
 * Deterministic: fixed sub-steps, no randomness. Pure (no three.js), so it is
 * tested in node (see the README).
 */

export type P2 = [number, number];

export interface Box {
  x: number;
  z: number;
  /** Heading: atan2(dx, dz), 0 = towards +z. */
  yaw: number;
  /** Half length (along the heading) and half width. */
  hl: number;
  hw: number;
}

/** A car: 4.5 m long over the bumpers, 1.8 m over the tyres. The margin keeps paint off paint. */
export const CAR_BOX = { hl: 2.3, hw: 0.92 };
const MARGIN = 0.15;

// ---------------------------------------------------------------------------
// Geometry

/** Separating-axis test for two oriented boxes in the ground plane. */
export function overlaps(a: Box, b: Box, margin = 0) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const ang of axes) {
    const ax = Math.sin(ang);
    const az = Math.cos(ang);
    const ra = projRadius(a, ax, az) + margin / 2;
    const rb = projRadius(b, ax, az) + margin / 2;
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}

function projRadius(b: Box, ax: number, az: number) {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  return b.hl * Math.abs(fx * ax + fz * az) + b.hw * Math.abs(fz * ax - fx * az);
}

/** The four corners, for checks that a box stays on the road. */
export function corners(b: Box): P2[] {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const rx = fz;
  const rz = -fx;
  return [
    [b.x + fx * b.hl + rx * b.hw, b.z + fz * b.hl + rz * b.hw],
    [b.x + fx * b.hl - rx * b.hw, b.z + fz * b.hl - rz * b.hw],
    [b.x - fx * b.hl + rx * b.hw, b.z - fz * b.hl + rz * b.hw],
    [b.x - fx * b.hl - rx * b.hw, b.z - fz * b.hl - rz * b.hw],
  ];
}

// ---------------------------------------------------------------------------
// Lanes

export interface Lane {
  /** Dense samples every STEP metres: x, z, yaw. */
  xs: Float32Array;
  zs: Float32Array;
  yaws: Float32Array;
  length: number;
}
const STEP = 0.25;

/**
 * A lane through the given points, each inner corner rounded with the given
 * radius (a circular arc tangent to both legs), so the heading never jumps.
 */
export function makeLane(pts: P2[], radius = 5): Lane {
  const path: P2[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i - 1];
    const [cx, cz] = pts[i];
    const [nx, nz] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cz - pz);
    const l2 = Math.hypot(nx - cx, nz - cz);
    const d1: P2 = [(cx - px) / l1, (cz - pz) / l1];
    const d2: P2 = [(nx - cx) / l2, (nz - cz) / l2];
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]); // signed, x→z positive
    if (Math.abs(turn) < 1e-3) {
      path.push([cx, cz]);
      continue;
    }
    // a circular arc tangent to both legs: it starts `cut` before the corner and ends `cut` after it
    const r = Math.min(radius, (0.45 * Math.min(l1, l2)) / Math.tan(Math.abs(turn) / 2));
    const cut = r * Math.tan(Math.abs(turn) / 2);
    const p1: P2 = [cx - d1[0] * cut, cz - d1[1] * cut];
    // centre: from the arc's start, perpendicular to the incoming leg, on the inside of the turn
    const sgn = Math.sign(turn);
    const o: P2 = [p1[0] - d1[1] * r * sgn, p1[1] + d1[0] * r * sgn];
    const a0 = Math.atan2(p1[1] - o[1], p1[0] - o[0]);
    const n = Math.max(2, Math.ceil((Math.abs(turn) * r) / 0.4));
    for (let k = 0; k <= n; k++) {
      const ang = a0 + turn * (k / n);
      path.push([o[0] + Math.cos(ang) * r, o[1] + Math.sin(ang) * r]);
    }
  }
  path.push(pts[pts.length - 1]);
  // resample by arc length
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const length = cum[cum.length - 1];
  const n = Math.floor(length / STEP) + 1;
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const yaws = new Float32Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k * STEP;
    while (j < path.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
    xs[k] = path[j][0] + (path[j + 1][0] - path[j][0]) * u;
    zs[k] = path[j][1] + (path[j + 1][1] - path[j][1]) * u;
  }
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 2);
    const b = Math.min(n - 1, k + 2);
    yaws[k] = Math.atan2(xs[b] - xs[a], zs[b] - zs[a]);
  }
  return { xs, zs, yaws, length: (n - 1) * STEP };
}

export function laneAt(l: Lane, s: number, out: Box = { x: 0, z: 0, yaw: 0, ...CAR_BOX }): Box {
  const f = Math.min(Math.max(s, 0), l.length) / STEP;
  const i = Math.min(Math.floor(f), l.xs.length - 2);
  const u = f - i;
  out.x = l.xs[i] + (l.xs[i + 1] - l.xs[i]) * u;
  out.z = l.zs[i] + (l.zs[i + 1] - l.zs[i]) * u;
  let d = l.yaws[i + 1] - l.yaws[i];
  d = Math.atan2(Math.sin(d), Math.cos(d));
  out.yaw = l.yaws[i] + d * u;
  return out;
}

// ---------------------------------------------------------------------------
// Simulation

export interface CarDef {
  lane: Lane;
  /** Cruising speed (m/s). */
  speed: number;
  /** A car sets off every `period` seconds, first at `offset` (if the entry is clear). */
  period: number;
  offset: number;
  /** Lower number goes first when two cars would reach a conflict together. */
  priority: number;
}

export interface CarState {
  /** On the road (false: waiting off-screen for its next turn). */
  on: boolean;
  s: number;
  v: number;
  box: Box;
  /** Why it is slowing (for tests): 'car', 'parked', 'visitor', 'yield' or ''. */
  reason: string;
}

export interface Traffic {
  defs: CarDef[];
  cars: CarState[];
  statics: Box[];
  t: number;
  acc: number;
}

const DT = 1 / 60;
const DECEL = 4.5; // comfortable braking (m/s²)
const ACCEL = 2.2;
const GAP = 1.6; // space left in front when stopped behind something (m)
const LOOK = 6; // look this much further than the stopping distance (m)

export function createTraffic(defs: CarDef[], statics: Box[]): Traffic {
  return {
    defs,
    cars: defs.map((d) => ({ on: false, s: 0, v: d.speed, box: laneAt(d.lane, 0), reason: '' })),
    statics,
    t: 0,
    acc: 0,
  };
}

/** Distance ahead (from s) at which car i's box first touches something, or Infinity. */
function freeDistance(tr: Traffic, i: number, look: number, visitor: P2 | null, others: Box[][]) {
  const d = tr.defs[i];
  const c = tr.cars[i];
  const probe: Box = { x: 0, z: 0, yaw: 0, ...CAR_BOX };
  const vbox: Box | null = visitor ? { x: visitor[0], z: visitor[1], yaw: 0, hl: 0.5, hw: 0.5 } : null;
  for (let ds = 0.5; ds <= look; ds += 0.5) {
    if (c.s + ds > d.lane.length) break;
    laneAt(d.lane, c.s + ds, probe);
    for (const st of tr.statics) if (overlaps(probe, st, MARGIN)) return { at: ds, why: 'parked' };
    if (vbox && overlaps(probe, vbox, 1.2)) return { at: ds, why: 'visitor' };
    for (let j = 0; j < others.length; j++) for (const ob of others[j]) if (overlaps(probe, ob, MARGIN)) return { at: ds, why: 'car' };
  }
  return { at: Infinity, why: '' };
}

/** Where along each car's look-ahead the two sweeps first meet: [distance for a, distance for b], or null. */
function conflict(tr: Traffic, a: number, b: number, lookA: number, lookB: number) {
  const A = tr.cars[a];
  const B = tr.cars[b];
  const pa: Box = { x: 0, z: 0, yaw: 0, ...CAR_BOX };
  const pb: Box = { x: 0, z: 0, yaw: 0, ...CAR_BOX };
  for (let da = 0; da <= lookA; da += 1) {
    if (A.s + da > tr.defs[a].lane.length) break;
    laneAt(tr.defs[a].lane, A.s + da, pa);
    // quick reject: B's sweep is a sausage around its lane
    for (let db = 0; db <= lookB; db += 1) {
      if (B.s + db > tr.defs[b].lane.length) break;
      laneAt(tr.defs[b].lane, B.s + db, pb);
      if (Math.abs(pa.x - pb.x) > 6 || Math.abs(pa.z - pb.z) > 6) continue;
      if (overlaps(pa, pb, MARGIN)) return [da, db];
    }
  }
  return null;
}

/** Advances the traffic by dt seconds. `visitor` is where the visitor stands (x, z), if on or near the road. */
export function stepTraffic(tr: Traffic, dt: number, visitor: P2 | null) {
  tr.acc += dt;
  while (tr.acc >= DT) {
    tr.acc -= DT;
    subStep(tr, visitor);
  }
}

function subStep(tr: Traffic, visitor: P2 | null) {
  const prevT = tr.t;
  tr.t += DT;
  const n = tr.defs.length;
  // spawns: on schedule, once the entry is clear
  for (let i = 0; i < n; i++) {
    const d = tr.defs[i];
    const c = tr.cars[i];
    if (c.on) continue;
    const due = Math.floor((tr.t - d.offset) / d.period) > Math.floor((prevT - d.offset) / d.period) || c.reason === 'spawn';
    if (!due) continue;
    const entry = laneAt(d.lane, 0);
    const blocked = tr.cars.some((o, j) => j !== i && o.on && overlaps(entry, o.box, GAP));
    if (blocked) {
      c.reason = 'spawn'; // try again next step
      continue;
    }
    Object.assign(c, { on: true, s: 0, v: d.speed, box: entry, reason: '' });
  }

  const looks = tr.cars.map((c) => (c.v * c.v) / (2 * DECEL) + GAP + LOOK);
  // where every car is now, for the others to keep clear of
  const sweeps: Box[][] = tr.cars.map((c) => (c.on ? [c.box] : []));
  const want = tr.cars.map(() => Infinity);
  const why = tr.cars.map(() => '');
  for (let i = 0; i < n; i++) {
    const c = tr.cars[i];
    if (!c.on) continue;
    // what is in the way now: parked cars, the visitor, other cars where they are
    const others = sweeps.filter((_, j) => j !== i);
    const free = freeDistance(tr, i, looks[i], visitor, others);
    if (free.at < want[i]) {
      want[i] = free.at;
      why[i] = free.why;
    }
    // crossing and merging lanes: whoever gets there later gives way
    for (let j = 0; j < n; j++) {
      if (j === i || !tr.cars[j].on) continue;
      const cf = conflict(tr, i, j, looks[i], looks[j] + 8);
      if (!cf) continue;
      const ti = cf[0] / Math.max(c.v, 1.5);
      const tj = cf[1] / Math.max(tr.cars[j].v, 1.5);
      const iYields = ti > tj + 0.4 || (Math.abs(ti - tj) <= 0.4 && tr.defs[i].priority > tr.defs[j].priority);
      if (iYields && cf[0] < want[i]) {
        want[i] = cf[0];
        why[i] = 'yield';
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const c = tr.cars[i];
    if (!c.on) continue;
    const d = tr.defs[i];
    // the fastest speed from which it can still stop GAP short of the obstacle
    const room = want[i] - GAP;
    const cap = room === Infinity ? d.speed : Math.sqrt(Math.max(0, 2 * DECEL * Math.max(0, room)));
    const target = Math.min(d.speed, cap);
    c.v = target > c.v ? Math.min(target, c.v + ACCEL * DT) : Math.max(target, c.v - DECEL * 1.6 * DT);
    if (room <= 0.05) c.v = 0;
    c.reason = c.v < d.speed - 0.05 ? why[i] : '';
    // the move itself, refused if it would make boxes touch
    const next = laneAt(d.lane, c.s + c.v * DT);
    const hits = tr.cars.some((o, j) => j !== i && o.on && overlaps(next, o.box)) || tr.statics.some((st) => overlaps(next, st));
    if (hits && c.v > 0) {
      c.v = 0;
      c.reason = c.reason || 'car';
      continue;
    }
    c.s += c.v * DT;
    c.box = next;
    if (c.s >= d.lane.length - 0.01) {
      c.on = false;
      c.reason = '';
    }
  }
}
