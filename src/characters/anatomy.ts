import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Body-part geometry for the illustrated people of DRUNKFURT.
 *
 * Every part is a smooth, organic volume (turned profiles and ellipsoids), never
 * a bare primitive: limbs taper and swell where muscles are, the torso narrows
 * at the waist and rounds into the shoulders, heads have a skull, jaw, nose and
 * ears. Parts are coloured with vertex colours (cloth, skin, hair, shoes) so a
 * whole body segment merges into a single mesh with one shared material.
 *
 * All dimensions are for a 1.75 m adult and scaled per person.
 */
export const BODY = {
  ankle: 0.075,
  knee: 0.5,
  hip: 0.92,
  waist: 1.02,
  thigh: 0.42,
  shin: 0.425,
  upperArm: 0.285,
  foreArm: 0.25,
  /** Shoulder joint, relative to the spine origin (waist). */
  shoulderY: 0.395,
  /** Neck top / head pivot, relative to the spine origin. */
  headY: 0.51,
  hipX: 0.088,
} as const;

export type Piece = BufferGeometry;

const tmpM = new Matrix4();
const tmpQ = new Quaternion();

export function place(g: Piece, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  tmpQ.setFromEuler(new Euler(...rot));
  g.applyMatrix4(tmpM.compose(new Vector3(...pos), tmpQ, new Vector3(...scale)));
  return g;
}

export function paint(g: Piece, color: Color) {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g;
}

/** Merges pieces (all indexed, all painted) into one segment geometry. */
export function merge(pieces: Piece[]) {
  const clean = pieces.map((p) => {
    const g = p.index ? p : p.setIndex([...Array(p.getAttribute('position').count).keys()]);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    return g;
  });
  const m = mergeGeometries(clean, false)!;
  m.computeBoundingSphere();
  clean.forEach((g) => g.dispose());
  return m;
}

/** Turned profile given top-to-bottom as [radius, y]; returns a closed surface of revolution. */
function lathe(profile: [number, number][], segments: number) {
  const pts = [...profile].reverse().map(([r, y]) => new Vector2(Math.max(0, r), y));
  return new LatheGeometry(pts, segments);
}

/**
 * A limb hanging down from its joint (y = 0) to y = -len, with rounded ends,
 * a taper from r0 to r1, and a muscle swell of `bulge` centred at `at` (0..1).
 */
export function limb(len: number, r0: number, r1: number, bulge = 0, at = 0.35, segments = 12) {
  const prof: [number, number][] = [];
  for (let a = 0; a <= 4; a++) {
    const t = (a / 4) * (Math.PI / 2);
    prof.push([r0 * Math.sin(t), r0 * Math.cos(t) * 0.8]);
  }
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    const swell = bulge * Math.exp(-((t - at) ** 2) / 0.05);
    prof.push([r0 + (r1 - r0) * t + swell, -len * t]);
  }
  for (let a = 0; a <= 4; a++) {
    const t = (a / 4) * (Math.PI / 2);
    prof.push([r1 * Math.cos(t), -len - r1 * Math.sin(t) * 0.8]);
  }
  return lathe(prof, segments);
}

export function ellipsoid(rx: number, ry: number, rz: number, w = 16, h = 12) {
  const g = new SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

/** Open turned shell (coat skirts, hems): profile top-to-bottom, open at both ends. */
export function shell(profile: [number, number][], segments = 18) {
  return lathe(profile, segments);
}

export function rod(len: number, r: number) {
  return new CylinderGeometry(r, r, len, 6, 1);
}

export function box(w: number, h: number, d: number) {
  return new BoxGeometry(w, h, d);
}

// ---------------------------------------------------------------------------
// Body parts

export interface Build {
  /** Shoulder width factor (1 = average). */
  shoulders: number;
  /** Hip width factor. */
  hips: number;
  /** Girth factor for chest/belly/limbs. */
  girth: number;
  /** Waist relative to chest (lower = more defined waist). */
  waist: number;
}

/** Chest and shoulders, from the waist (y = 0) up to the base of the neck. */
export function torso(b: Build, padding: number) {
  const c = 0.158 * b.girth + padding;
  const w = c * b.waist;
  const g = lathe(
    [
      [0, 0.445],
      [0.06, 0.44],
      [c * 0.62, 0.415],
      [c * 0.92, 0.37],
      [c, 0.3],
      [c * 0.98, 0.2],
      [w * 1.02, 0.1],
      [w, 0.02],
      [w * 0.98, -0.04],
      [0, -0.05],
    ],
    18,
  );
  g.scale(1.12 * b.shoulders, 1, 0.64);
  return g;
}

/** Deltoids: the rounded caps that make shoulders read as shoulders. */
export function deltoids(b: Build, padding: number) {
  const x = shoulderX(b);
  return [-1, 1].map((s) => place(ellipsoid(0.058 + padding, 0.062 + padding, 0.06 + padding), [s * (x - 0.005), BODY.shoulderY - 0.005, 0]));
}

export const shoulderX = (b: Build) => 0.175 * b.shoulders;

/** Pelvis and seat, from below the hip joints up into the torso. */
export function pelvis(b: Build, padding: number) {
  const h = 0.158 * b.hips + padding;
  const g = lathe(
    [
      [0, 0.16],
      [h * 0.86, 0.15],
      [h * 0.94, 0.08],
      [h, 0.0],
      [h * 0.94, -0.06],
      [h * 0.62, -0.11],
      [0, -0.12],
    ],
    16,
  );
  g.scale(1, 1, 0.74);
  return g;
}

export function neck(girth: number) {
  return place(limb(0.1, 0.048 * girth, 0.052 * girth, 0, 0.5, 10), [0, BODY.headY, 0]);
}

/** Skull, jaw, nose and ears; pivot at the top of the neck. */
export function head(skin: Color) {
  return [
    place(ellipsoid(0.077, 0.1, 0.094), [0, 0.1, 0.004]),
    place(ellipsoid(0.06, 0.062, 0.07), [0, 0.048, 0.028]),
    place(ellipsoid(0.011, 0.02, 0.016), [0, 0.078, 0.097], [-0.25, 0, 0]),
    place(ellipsoid(0.011, 0.022, 0.016), [-0.077, 0.088, 0.002]),
    place(ellipsoid(0.011, 0.022, 0.016), [0.077, 0.088, 0.002]),
  ].map((p) => paint(p, skin));
}

export type Hair = 'short' | 'long' | 'bun' | 'cropped' | 'none';
export type Hat = 'beanie' | 'cap' | 'none';

export function hairPieces(style: Hair, hat: Hat, hairC: Color, hatC: Color) {
  const out: Piece[] = [];
  if (hat === 'none' || style === 'long' || style === 'bun') {
    if (style === 'short') out.push(place(ellipsoid(0.083, 0.08, 0.1), [0, 0.13, -0.014]));
    if (style === 'cropped') out.push(place(ellipsoid(0.08, 0.075, 0.098), [0, 0.125, -0.01]));
    if (style === 'long') {
      out.push(place(ellipsoid(0.085, 0.085, 0.102), [0, 0.13, -0.012]));
      out.push(place(ellipsoid(0.082, 0.13, 0.055), [0, 0.035, -0.055]));
    }
    if (style === 'bun') {
      out.push(place(ellipsoid(0.082, 0.08, 0.1), [0, 0.13, -0.012]));
      out.push(place(ellipsoid(0.04, 0.038, 0.038), [0, 0.19, -0.08]));
    }
  }
  out.forEach((p) => paint(p, hairC));
  const hats: Piece[] = [];
  if (hat === 'beanie') hats.push(place(ellipsoid(0.088, 0.085, 0.104), [0, 0.145, -0.008]), place(limb(0.03, 0.09, 0.09, 0, 0.5, 18), [0, 0.135, -0.004], [0, 0, 0], [1, 1, 1.12]));
  if (hat === 'cap') hats.push(place(ellipsoid(0.09, 0.045, 0.106), [0, 0.18, 0.004]), place(ellipsoid(0.08, 0.008, 0.06), [0, 0.168, 0.09]));
  hats.forEach((p) => paint(p, hatC));
  return [...out, ...hats];
}

/** Mitten hand with a thumb; pivot at the wrist, hanging down, palm facing inwards (side = -1 left, 1 right). */
export function hand(side: -1 | 1, skin: Color) {
  return [
    place(ellipsoid(0.021, 0.048, 0.04), [0, -0.05, 0.004]),
    place(ellipsoid(0.017, 0.04, 0.034), [side * 0.002, -0.105, 0.006]),
    place(limb(0.045, 0.012, 0.01, 0, 0.5, 8), [-side * 0.01, -0.03, 0.035], [0.55, 0, side * 0.25]),
  ].map((p) => paint(p, skin));
}

/**
 * Closed fist, pivot at the wrist, hanging down: knuckles at the far end, a
 * row of finger rolls, and the thumb folded across. Knuckles face +z when the
 * forearm is raised forward.
 */
export function fist(side: -1 | 1, skin: Color) {
  return [
    // back of the hand / palm, a compact block
    place(ellipsoid(0.036, 0.048, 0.03), [0, -0.05, 0]),
    // four knuckles in a slight arc at the end of the fist
    ...[-1.5, -0.5, 0.5, 1.5].map((k) => place(ellipsoid(0.011, 0.013, 0.013), [k * 0.017, -0.094 + Math.abs(k) * 0.003, 0.006])),
    // curled fingers under the knuckles
    place(ellipsoid(0.034, 0.018, 0.016), [0, -0.082, 0.022]),
    // thumb wrapped across the fingers
    place(ellipsoid(0.01, 0.026, 0.01), [-side * 0.012, -0.066, 0.034], [0, 0, side * 1.1]),
  ].map((p) => paint(p, skin));
}

/**
 * Worn cloth: pushes vertices in and out along their normals with a smooth
 * pseudo-random field, so hems sag, fabric bunches and silhouettes stop being
 * perfectly turned. `amount` in metres.
 */
export function rough(g: Piece, amount: number, seed: number) {
  const pos = g.getAttribute('position');
  g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  const h = (x: number) => {
    const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 23 + seed) * Math.cos(y * 17 - seed * 0.7) + Math.sin(z * 29 + y * 11) * 0.6 + (h(Math.round(y * 60) + Math.round(x * 40) * 7) - 0.5) * 0.5;
    const d = n * amount;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Shoe, pivot at the ankle (0.075 m above the ground when flat). */
export function shoe(shoeC: Color, soleC: Color) {
  return [
    paint(place(ellipsoid(0.046, 0.042, 0.122), [0, -0.03, 0.05]), shoeC),
    paint(place(box(0.094, 0.018, 0.25), [0, -0.066, 0.048]), soleC),
  ];
}
