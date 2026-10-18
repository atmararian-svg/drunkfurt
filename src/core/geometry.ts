import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec2 = [number, number];

// ---------------------------------------------------------------------------
// 2D profile helpers

export function quadBezier(a: Vec2, c: Vec2, b: Vec2, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export function signedArea(poly: Vec2[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Sutherland–Hodgman clip of a polygon against a horizontal line. */
export function clipY(poly: Vec2[], y: number, keep: 'above' | 'below'): Vec2[] {
  const inside = (p: Vec2) => (keep === 'above' ? p[1] >= y : p[1] <= y);
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci !== pi) {
      const t = (y - prev[1]) / (cur[1] - prev[1]);
      out.push([prev[0] + (cur[0] - prev[0]) * t, y]);
    }
    if (ci) out.push(cur);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sweeps

/**
 * Extrudes a closed CCW profile (x, y) along z. Normals are smoothed across
 * gentle corners and split across sharp ones, so curved bodies stay smooth
 * while cut edges stay crisp. UVs are (arc length, z) in metres.
 */
export function sweepSides(poly: Vec2[], z0: number, z1: number, smoothDeg = 38) {
  const p = signedArea(poly) < 0 ? [...poly].reverse() : poly;
  const n = p.length;
  const edgeN: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    edgeN.push([dy / l, -dx / l]);
  }
  const cosLimit = Math.cos((smoothDeg * Math.PI) / 180);
  const vNormal = (edge: number, vertexOnEdgeStart: boolean): Vec2 => {
    const other = vertexOnEdgeStart ? (edge + n - 1) % n : (edge + 1) % n;
    const a = edgeN[edge];
    const b = edgeN[other];
    if (a[0] * b[0] + a[1] * b[1] < cosLimit) return a;
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let arc = 0;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const na = vNormal(i, true);
    const nb = vNormal(i, false);
    const base = pos.length / 3;
    pos.push(a[0], a[1], z0, b[0], b[1], z0, a[0], a[1], z1, b[0], b[1], z1);
    nor.push(na[0], na[1], 0, nb[0], nb[1], 0, na[0], na[1], 0, nb[0], nb[1], 0);
    uv.push(arc, z0, arc + len, z0, arc, z1, arc + len, z1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    arc += len;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Flat cap for a profile at a given z, facing +z (facing=1) or -z (facing=-1). */
export function profileCap(poly: Vec2[], z: number, facing: 1 | -1) {
  const contour = poly.map(([x, y]) => new Vector2(x, y));
  const tris = ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  poly.forEach(([x, y]) => {
    pos.push(x, y, z);
    nor.push(0, 0, facing);
    uv.push(x, y);
  });
  const idx: number[] = [];
  for (const [a, b, c] of tris) {
    const pa = poly[a];
    const pb = poly[b];
    const pc = poly[c];
    const cross = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
    if ((cross > 0) === (facing > 0)) idx.push(a, b, c);
    else idx.push(a, c, b);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------
// Batching

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpS = new Vector3();
const tmpP = new Vector3();

/**
 * Collects many small static pieces and merges them per material key, so a
 * whole train or platform becomes a handful of draw calls.
 */
export class GeoBatch {
  private parts = new Map<string, BufferGeometry[]>();

  add(key: string, geo: BufferGeometry, matrix?: Matrix4) {
    // All helpers here produce indexed geometry, which mergeGeometries requires consistently.
    const g = geo.index ? geo : indexed(geo);
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
    return this;
  }

  /** Axis-aligned box by centre and size, optionally rotated (radians, XYZ). */
  box(key: string, size: [number, number, number], center: [number, number, number], rot?: [number, number, number]) {
    const g = new BoxGeometry(size[0], size[1], size[2]);
    return this.add(key, g, compose(center, rot));
  }

  /** Cylinder (axis along local y) by centre, optionally rotated. */
  cylinder(
    key: string,
    radius: number,
    length: number,
    center: [number, number, number],
    rot?: [number, number, number],
    segments = 12,
  ) {
    const g = new CylinderGeometry(radius, radius, length, segments, 1, false);
    return this.add(key, g, compose(center, rot));
  }

  /** Box oriented along the segment a→b (used for truss members). */
  strut(key: string, a: Vector3, b: Vector3, w: number, h: number) {
    const dir = tmpP.subVectors(b, a);
    const len = dir.length();
    const g = new BoxGeometry(w, h, len);
    const m = new Matrix4().lookAt(a, b, new Vector3(0, 1, 0));
    // lookAt with eye=a, target=b points -z towards b; box is symmetric so either sign works.
    m.setPosition(new Vector3().addVectors(a, b).multiplyScalar(0.5));
    return this.add(key, g, m);
  }

  build() {
    const out: { key: string; geometry: BufferGeometry }[] = [];
    this.parts.forEach((list, key) => {
      const merged = mergeGeometries(list, false);
      if (!merged) throw new Error(`GeoBatch: could not merge "${key}"`);
      merged.computeBoundingSphere();
      list.forEach((g) => g.dispose());
      out.push({ key, geometry: merged });
    });
    this.parts.clear();
    return out;
  }
}

function indexed(g: BufferGeometry) {
  const count = g.getAttribute('position').count;
  g.setIndex(Array.from({ length: count }, (_, i) => i));
  return g;
}

export function compose(center: [number, number, number], rot?: [number, number, number], scale?: [number, number, number]) {
  tmpE.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
  tmpQ.setFromEuler(tmpE);
  tmpS.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1);
  return tmpM.clone().compose(new Vector3(...center), tmpQ, tmpS);
}
