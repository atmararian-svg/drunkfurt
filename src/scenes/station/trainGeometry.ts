import { BufferGeometry, Float32BufferAttribute, PlaneGeometry, Vector3 } from 'three';
import { GeoBatch, Vec2, clipY, compose, profileCap, quadBezier, sweepSides } from '../../core/geometry';
import { mulberry32 } from '../../core/math';
import { CAR } from './layout';

/**
 * Procedural intercity train. An original design in the language of German
 * long-distance stock: smooth off-white body, continuous dark window band,
 * plug doors near the car ends, gangway bellows, and a tapered power-car nose.
 *
 * Coordinates are local to the train: x from track centre, y from rail top, z along the track.
 */

/** Car cross-section, CCW. Vertical sides through the window band, tumblehome into the roof. */
export const CAR_PROFILE: Vec2[] = (() => {
  const hw = CAR.halfWidth;
  const right: Vec2[] = [[1.28, 0.95]];
  right.push(...quadBezier([1.28, 0.95], [hw, 0.95], [hw, 1.3], 4));
  right.push([hw, 2.95]);
  right.push(...quadBezier([hw, 2.95], [hw, 3.62], [1.02, 3.82], 8));
  right.push(...quadBezier([1.02, 3.82], [0.62, 3.99], [0.06, 3.99], 6));
  const left = right.map(([x, y]) => [-x, y] as Vec2).reverse();
  return [...right, ...left];
})();

export const BODY_BOTTOM = 0.95;
const FLOOR = CAR.floor;
const DOOR_TOP = FLOOR + CAR.doorHeight;
const WIN_Y0 = 1.72;
const WIN_Y1 = 2.72;
const BAY = 2.3;

export const POWER_LEN = 19.5;
export const NOSE_LEN = 7.4;

export interface TrainSpec {
  /** z of the head nose tip (the head points to -z, towards the buffer stops). */
  noseZ: number;
  cars: number;
  rearPowerCar?: boolean;
  /** Which car/door is standing open, and on which side (+1 = +x). */
  openDoor?: { car: number; side: 1 | -1 };
  firstClassCars?: number[];
  /** Side facing the platform; lit windows spill light onto it. */
  platformSide?: 1 | -1;
  /** 0..1 chance a car's interior is lit. */
  litChance?: number;
  seed?: number;
}

export interface CarSpan {
  z0: number;
  z1: number;
}

export function carSpan(spec: TrainSpec, j: number): CarSpan {
  const z0 = spec.noseZ + POWER_LEN + CAR.gap + j * (CAR.length + CAR.gap);
  return { z0, z1: z0 + CAR.length };
}

/** Result keys map to materials in Train.tsx. */
export function buildTrain(spec: TrainSpec) {
  const b = new GeoBatch();
  const rnd = mulberry32(spec.seed ?? 1);

  // --- head power car
  buildPowerCar(b, spec.noseZ, -1);

  for (let j = 0; j < spec.cars; j++) {
    const { z0, z1 } = carSpan(spec, j);
    const lit = rnd() < (spec.litChance ?? 1);
    const open = spec.openDoor && spec.openDoor.car === j ? spec.openDoor : undefined;
    const doorFront = z0 + CAR.doorInset;
    const doorRear = z1 - CAR.doorInset;

    // body shell (split around an open door so the vestibule is real geometry)
    if (open) {
      const d0 = doorRear - CAR.doorWidth / 2;
      const d1 = doorRear + CAR.doorWidth / 2;
      shell(b, CAR_PROFILE, z0, d0);
      shell(b, CAR_PROFILE, d1, z1);
      b.add('body', sweepSides(clipY(CAR_PROFILE, DOOR_TOP, 'above'), d0, d1));
      b.add('body', sweepSides(clipY(CAR_PROFILE, FLOOR, 'below'), d0, d1));
      vestibule(b, d0, d1, open.side);
    } else {
      shell(b, CAR_PROFILE, z0, z1);
    }

    // window bands
    for (const side of [1, -1] as const) {
      const ws = doorFront + CAR.doorWidth / 2 + 0.32;
      const we = doorRear - CAR.doorWidth / 2 - 0.32;
      windowBand(b, side, ws, we, lit ? 'winLit' : 'winDark');
      if (lit && side === spec.platformSide) windowSpill(b, side, ws, we);
      // thin dark line below the band, a quiet nod to the classic livery stripe
      b.box('trim', [0.012, 0.05, z1 - z0 - 0.3], [side * (CAR.halfWidth + 0.004), 1.58, (z0 + z1) / 2]);
      if (spec.firstClassCars?.includes(j)) {
        // DB marks first class with a yellow stripe above the windows.
        b.box('yellow', [0.012, 0.06, we - ws], [side * (CAR.halfWidth + 0.004), 2.83, (ws + we) / 2]);
      }
      for (const dz of [doorFront, doorRear]) {
        if (open && open.side === side && dz === doorRear) continue;
        closedDoor(b, side, dz, lit);
      }
    }

    // gangway to the next car / power car
    b.box('rubber', [2.5, 2.55, CAR.gap + 0.24], [0, FLOOR + 1.2, z1 + CAR.gap / 2]);
    b.box('rubber', [2.5, 2.55, CAR.gap + 0.24], [0, FLOOR + 1.2, z0 - CAR.gap / 2]);

    undercarriage(b, z0, z1);
    // roof equipment: HVAC unit
    b.box('under', [1.5, 0.26, 3.6], [0, 4.1, z0 + 4.2]);
    b.box('trim', [1.2, 0.04, 2.9], [0, 4.24, z0 + 4.2]);
  }

  if (spec.rearPowerCar) {
    const { z1 } = carSpan(spec, spec.cars - 1);
    buildPowerCar(b, z1 + CAR.gap + POWER_LEN, 1);
  }

  return b.build();
}

function shell(b: GeoBatch, profile: Vec2[], z0: number, z1: number) {
  b.add('body', sweepSides(profile, z0, z1));
  b.add('interior', profileCap(profile, z0, -1));
  b.add('interior', profileCap(profile, z1, 1));
}

function windowBand(b: GeoBatch, side: 1 | -1, zs: number, ze: number, key: string) {
  const len = ze - zs;
  const bays = Math.max(1, Math.round(len / BAY));
  const g = new PlaneGeometry(len, WIN_Y1 - WIN_Y0);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * bays);
  b.add(key, g, compose([side * (CAR.halfWidth + 0.006), (WIN_Y0 + WIN_Y1) / 2, (zs + ze) / 2], [0, (side * Math.PI) / 2, 0]));
}

/** Soft light falling from each lit window onto the platform (y = 0 in world = 0.76 above rail). */
function windowSpill(b: GeoBatch, side: 1 | -1, zs: number, ze: number) {
  const bays = Math.max(1, Math.round((ze - zs) / BAY));
  const bay = (ze - zs) / bays;
  for (let i = 0; i < bays; i++) {
    const z = zs + bay * (i + 0.5);
    b.add('spill', new PlaneGeometry(1.5, bay * 0.95), compose([side * (CAR.halfWidth + 0.95), 0.765, z], [-Math.PI / 2, 0, 0]));
  }
}

function closedDoor(b: GeoBatch, side: 1 | -1, dz: number, lit: boolean) {
  const x = side * CAR.halfWidth;
  const w = CAR.doorWidth;
  const h = CAR.doorHeight;
  b.box('rubber', [0.012, h + 0.05, w + 0.05], [x + side * 0.004, FLOOR + h / 2, dz]);
  b.box('body', [0.02, h - 0.02, w - 0.03], [x + side * 0.012, FLOOR + h / 2, dz]);
  // door window and central seal
  b.box('trim', [0.012, 0.78, w * 0.62], [x + side * 0.024, FLOOR + 1.52, dz]);
  b.box('rubber', [0.01, h - 0.1, 0.012], [x + side * 0.024, FLOOR + h / 2, dz]);
  // step below the door
  b.box('under', [0.24, 0.1, w], [x - side * 0.02, FLOOR - 0.16, dz]);
  // door-open button beside the door
  b.box(lit ? 'buttonLit' : 'trim', [0.012, 0.07, 0.07], [x + side * 0.008, FLOOR + 1.12, dz - (w / 2 + 0.16)]);
}

/** Open plug door with a real vestibule behind it. */
function vestibule(b: GeoBatch, d0: number, d1: number, side: 1 | -1) {
  const x = side * CAR.halfWidth;
  const w = d1 - d0;
  const mid = (d0 + d1) / 2;
  const inner = CAR.halfWidth - 0.05;
  // floor plate and yellow threshold edge
  b.box('floor', [inner * 2, 0.02, w], [0, FLOOR + 0.01, mid]);
  b.box('yellow', [0.07, 0.022, w], [side * (CAR.halfWidth - 0.04), FLOOR + 0.012, mid]);
  b.box('stainless', [0.04, 0.03, w], [side * (CAR.halfWidth - 0.0), FLOOR - 0.005, mid]);
  // far wall with the closed door on the opposite side
  b.box('interior', [0.04, CAR.doorHeight, w], [-side * inner, FLOOR + CAR.doorHeight / 2, mid]);
  b.box('trim', [0.02, 0.7, w * 0.55], [-side * (inner - 0.03), FLOOR + 1.5, mid]);
  b.box('rubber', [0.02, CAR.doorHeight - 0.04, 0.02], [-side * (inner - 0.03), FLOOR + CAR.doorHeight / 2, mid]);
  // glass partition doors into the lit saloon on both sides of the vestibule
  for (const [z, f] of [[d0 + 0.004, 0], [d1 - 0.004, Math.PI]] as const) {
    const g = new PlaneGeometry(0.95, 1.9);
    b.add('partition', g, compose([0, FLOOR + 1.0, z], [0, f, 0]));
    b.box('trim', [1.05, 0.05, 0.03], [0, FLOOR + 1.97, z]);
    b.box('trim', [0.05, 1.95, 0.03], [-0.5, FLOOR + 0.98, z]);
    b.box('trim', [0.05, 1.95, 0.03], [0.5, FLOOR + 0.98, z]);
  }
  // ceiling light
  b.box('interiorLight', [1.2, 0.012, 0.32], [0, DOOR_TOP - 0.008, mid]);
  // grab poles either side of the opening
  for (const z of [d0 + 0.07, d1 - 0.07]) {
    b.cylinder('stainless', 0.017, 1.75, [side * (CAR.halfWidth - 0.13), FLOOR + 1.05, z]);
  }
  // seals around the opening
  b.box('rubber', [0.06, CAR.doorHeight, 0.035], [x - side * 0.02, FLOOR + CAR.doorHeight / 2, d0 + 0.015]);
  b.box('rubber', [0.06, CAR.doorHeight, 0.035], [x - side * 0.02, FLOOR + CAR.doorHeight / 2, d1 - 0.015]);
  b.box('rubber', [0.06, 0.035, w], [x - side * 0.02, DOOR_TOP - 0.015, mid]);
  // the door leaf itself, slid outwards and towards the car end
  const lz = d1 + w / 2 + 0.03;
  b.box('rubber', [0.012, CAR.doorHeight + 0.03, w + 0.03], [x + side * 0.085, FLOOR + CAR.doorHeight / 2, lz]);
  b.box('body', [0.03, CAR.doorHeight - 0.02, w - 0.02], [x + side * 0.1, FLOOR + CAR.doorHeight / 2, lz]);
  b.box('trim', [0.012, 0.78, w * 0.62], [x + side * 0.118, FLOOR + 1.52, lz]);
  // open-door indicator: lit yellow ring beside the opening
  b.box('buttonLit', [0.014, 0.08, 0.08], [x + side * 0.004, FLOOR + 1.12, d0 - 0.16]);
  // step light
  b.box('interiorLight', [0.01, 0.02, w - 0.1], [x - side * 0.02, FLOOR - 0.04, mid]);
}

function undercarriage(b: GeoBatch, z0: number, z1: number) {
  for (const bz of [z0 + 2.7, z1 - 2.7]) {
    b.box('under', [2.1, 0.32, 3.2], [0, 0.62, bz]);
    b.box('under', [2.5, 0.12, 0.5], [0, 0.88, bz]);
    for (const az of [bz - 1.25, bz + 1.25])
      for (const ax of [-0.72, 0.72]) b.cylinder('wheel', 0.45, 0.12, [ax, 0.45, az], [0, 0, Math.PI / 2], 18);
  }
  b.box('under', [2.3, 0.5, z1 - z0 - 8.5], [0, 0.72, (z0 + z1) / 2]);
  b.box('rubber', [2.62, 0.05, z1 - z0 - 0.2], [0, BODY_BOTTOM - 0.02, (z0 + z1) / 2]);
}

/**
 * Power car. `dir` = -1 builds a head pointing to -z with its nose tip at `tipZ`;
 * dir = +1 builds a tail pointing to +z.
 */
function buildPowerCar(b: GeoBatch, tipZ: number, dir: -1 | 1) {
  const noseBase = tipZ - dir * NOSE_LEN;
  const bodyEnd = tipZ - dir * POWER_LEN;
  const z0 = Math.min(noseBase, bodyEnd);
  const z1 = Math.max(noseBase, bodyEnd);
  b.add('body', sweepSides(CAR_PROFILE, z0, z1));
  b.add('interior', profileCap(CAR_PROFILE, dir < 0 ? z1 : z0, dir < 0 ? 1 : -1));
  b.add('nose', noseLoft(noseBase, dir));
  for (const side of [1, -1] as const) {
    const x = side * (CAR.halfWidth + 0.006);
    // machine-room louvres and a single crew door behind the cab
    const crew = noseBase - dir * 1.4;
    b.box('trim', [0.012, 1.9, 0.75], [x, FLOOR + 1.0, crew]);
    b.box('rubber', [0.01, 1.95, 0.8], [x - side * 0.002, FLOOR + 1.0, crew]);
    for (let k = 0; k < 4; k++) {
      const z = noseBase - dir * (3.2 + k * 2.6);
      b.box('trim', [0.012, 0.9, 2.1], [x, 2.55, z]);
    }
    b.box('trim', [0.012, 0.05, POWER_LEN - NOSE_LEN - 0.3], [x, 1.58, (z0 + z1) / 2]);
  }
  undercarriage(b, z0, z1);
  // pantograph (lowered), roughly over the rear bogie of the power car
  const pz = bodyEnd + dir * 4;
  b.box('under', [1.6, 0.18, 1.6], [0, 4.08, pz]);
  const a = new Vector3(0, 4.2, pz - 0.7);
  const m = new Vector3(0, 4.42, pz + 0.6);
  const t = new Vector3(0, 4.52, pz - 0.5);
  b.strut('pantograph', a, m, 0.05, 0.05);
  b.strut('pantograph', m, t, 0.04, 0.04);
  b.box('pantograph', [1.7, 0.04, 0.06], [0, 4.55, pz - 0.5]);
}

const noseSX = (t: number) => 1 - 0.5 * Math.pow(t, 2.0);
const noseSY = (t: number) => 1 - 0.64 * Math.pow(t, 1.35);

/** Lofted nose: the car profile tapers in width and height towards a low, rounded tip. */
function noseLoft(baseZ: number, dir: -1 | 1) {
  const rings = 18;
  const prof = CAR_PROFILE;
  const n = prof.length;
  const pos: number[] = [];
  const col: number[] = [];
  const body = [0.9, 0.9, 0.88];
  const dark = [0.035, 0.035, 0.038];
  let lastRing: Vec2[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const sx = noseSX(t);
    const sy = noseSY(t);
    const z = baseZ + dir * NOSE_LEN * Math.sin((t * Math.PI) / 2);
    lastRing = [];
    for (let i = 0; i < n; i++) {
      const [px, py] = prof[i];
      const x = px * sx;
      const y = BODY_BOTTOM + (py - BODY_BOTTOM) * sy;
      lastRing.push([x, y]);
      pos.push(x, y, z);
      // windscreen wraps the forward slope; a thin dark skirt line runs along the bottom
      const windscreen = t > 0.3 && t < 0.78 && py > 2.45 && Math.abs(px) < 1.38;
      const skirt = py < 1.02;
      const c = windscreen || skirt ? dark : body;
      col.push(c[0], c[1], c[2]);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rings; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const bb = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i;
      const d = (r + 1) * n + ((i + 1) % n);
      if (dir > 0) idx.push(a, bb, c, bb, d, c);
      else idx.push(a, c, bb, bb, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));

  // tip cap (coupler cover), merged into the same geometry
  const tipZ = baseZ + dir * NOSE_LEN;
  const cap = profileCap(lastRing, tipZ, dir);
  const capColors = new Float32Array(cap.getAttribute('position').count * 3).fill(0.82);
  cap.setAttribute('color', new Float32BufferAttribute(capColors, 3));
  const off = pos.length / 3;
  const capIdx = Array.from(cap.index!.array).map((i) => i + off);
  const merged = new BufferGeometry();
  const cat = (name: string, size: number) => {
    const a = g.getAttribute(name).array as Float32Array;
    const c = cap.getAttribute(name).array as Float32Array;
    const out = new Float32Array(a.length + c.length);
    out.set(a);
    out.set(c, a.length);
    merged.setAttribute(name, new Float32BufferAttribute(out, size));
  };
  cat('position', 3);
  cat('normal', 3);
  cat('color', 3);
  cat('uv', 2);
  merged.setIndex([...Array.from(g.index!.array), ...capIdx]);
  return merged;
}

/** Headlight positions on the tip face of a head power car (local coordinates). */
export function headlightPositions(tipZ: number): [number, number, number][] {
  const sx = noseSX(1);
  const sy = noseSY(1);
  const y = BODY_BOTTOM + 0.42 * sy * 2.2;
  return [-1, 1].map((s) => [s * 0.85 * sx, y, tipZ - 0.02] as [number, number, number]);
}
