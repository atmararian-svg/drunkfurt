import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { limb, paint, Piece } from './anatomy';

/**
 * Lofted body shapes: a surface through a series of cross-sections, each a
 * superellipse with its own width, depth and centre. This is how the torso,
 * the limbs and the shoes are built: a section every few centimetres where the
 * body actually changes (waist, ribcage, armpit, the slope of the shoulders),
 * so silhouettes read as anatomy instead of turned vases and boxes.
 */
export interface Section {
  /** Position along the loft axis. */
  at: number;
  /** Full width (across) and depth towards the front and the back from the centre line. */
  w: number;
  front: number;
  back: number;
  /** Centre offset across and along the depth axis. */
  cx?: number;
  cz?: number;
  /** Superellipse exponent: 2 = ellipse, higher = squarer. */
  p?: number;
}

const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * A closed loft along `axis` ('y': sections in x/z, 'z': sections in x/y with
 * "front" meaning up). Ends are closed with a rounded cap.
 */
export function loft(sections: Section[], segments = 16, axis: 'y' | 'z' = 'y'): Piece {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (s: Section) => {
    const e = 2 / (s.p ?? 2);
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const across = (s.cx ?? 0) + (s.w / 2) * sgnPow(c, e);
      const depth = (s.cz ?? 0) + (sn >= 0 ? s.front : s.back) * sgnPow(sn, e);
      if (axis === 'y') pos.push(across, s.at, depth);
      else pos.push(across, depth, s.at);
    }
  };
  // rounded ends: a smaller section just beyond each end, then a pole
  const first = sections[0];
  const last = sections[sections.length - 1];
  const dir = Math.sign(last.at - first.at) || 1;
  const shrink = (s: Section, k: number, d: number): Section => ({ ...s, at: s.at + d, w: s.w * k, front: s.front * k, back: s.back * k });
  const capLen = (s: Section) => Math.min(s.w, s.front + s.back) * 0.22;
  const all = [shrink(first, 0.72, -dir * capLen(first)), ...sections, shrink(last, 0.72, dir * capLen(last))];
  all.forEach(ring);
  const rings = all.length;
  for (let r = 0; r < rings - 1; r++)
    for (let k = 0; k < segments; k++) {
      const a = r * segments + k;
      const b = r * segments + ((k + 1) % segments);
      const c = (r + 1) * segments + k;
      const d = (r + 1) * segments + ((k + 1) % segments);
      if (dir > 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  const pole = (s: Section, d: number) => {
    const at = s.at + d;
    if (axis === 'y') pos.push(s.cx ?? 0, at, s.cz ?? 0);
    else pos.push(s.cx ?? 0, s.cz ?? 0, at);
    return pos.length / 3 - 1;
  };
  const p0 = pole(all[0], -dir * capLen(first) * 0.45);
  const p1 = pole(all[rings - 1], dir * capLen(last) * 0.45);
  for (let k = 0; k < segments; k++) {
    const a = k;
    const b = (k + 1) % segments;
    const c = (rings - 1) * segments + k;
    const d = (rings - 1) * segments + ((k + 1) % segments);
    if (dir > 0) idx.push(p0, a, b, c, p1, d);
    else idx.push(p0, b, a, c, d, p1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Hands

const M = new Matrix4();
const Q = new Quaternion();
const E = new Euler();
const V = new Vector3();
const ONE = new Vector3(1, 1, 1);

/**
 * A hand, pivot at the wrist, hanging down (-y): palm, thumb and four fingers
 * of three phalanges each. `curl` 0 is a relaxed open hand (fingers gently
 * bent), 1 a closed fist with the thumb across the fingers. The palm faces the
 * body (towards -side·x), the thumb is in front (+z). Sizes are for a 1.75 m
 * adult; the figure scales them with the body.
 */
export function hand(side: -1 | 1, skin: Color, curl = 0): Piece[] {
  const inward = -side; // palm normal along x
  const out: Piece[] = [];
  // palm: wider at the knuckles than at the wrist, the thumb's pad (thenar) on the front half
  const palm = loft(
    [
      { at: 0.004, w: 0.034, front: 0.026, back: 0.024, p: 3 },
      { at: -0.03, w: 0.04, front: 0.036, back: 0.03, cz: 0.002, p: 3.2 },
      { at: -0.07, w: 0.034, front: 0.041, back: 0.039, cz: 0.001, p: 3.6 },
      { at: -0.098, w: 0.028, front: 0.041, back: 0.04, p: 3.6 },
    ],
    14,
  );
  // the loft's width runs along x (palm thickness), its depth along z (across the knuckles)
  palm.scale(1, 1, 1);
  palm.translate(inward * 0.003, 0, 0);
  out.push(paint(palm, skin));
  // fingers: index (front) to little (back); base along the knuckle line
  const fingers = [
    { z: 0.028, len: 0.078, r: 0.0098 },
    { z: 0.009, len: 0.086, r: 0.0102 },
    { z: -0.01, len: 0.08, r: 0.0096 },
    { z: -0.028, len: 0.064, r: 0.0086 },
  ];
  const relaxed = [0.22, 0.32, 0.2];
  const fist = [1.55, 1.75, 1.0];
  fingers.forEach((f, i) => {
    const spread = (i - 1.5) * 0.03 * (1 - curl);
    const segs = [0.45, 0.31, 0.24].map((k) => k * f.len);
    // chain: start at the knuckle, bend each joint towards the palm (rotation about z)
    M.compose(V.set(0, -0.096 + Math.abs(i - 1.2) * 0.004, f.z), Q.setFromEuler(E.set(spread, 0, 0)), ONE);
    const chain = M.clone();
    segs.forEach((len, k) => {
      const bend = relaxed[k] + (fist[k] - relaxed[k]) * curl + (i === 3 ? 0.08 : 0);
      chain.multiply(new Matrix4().makeRotationZ(inward * bend));
      const r0 = f.r * (1 - k * 0.1);
      const seg = limb(len, r0, r0 * 0.9, 0, 0.5, 7);
      seg.applyMatrix4(chain);
      out.push(paint(seg, skin));
      chain.multiply(new Matrix4().makeTranslation(0, -len, 0));
    });
  });
  // a closing hand: the curled fingers pack into one mass on the palm side (the body of the fist)
  if (curl > 0.5) {
    const k = (curl - 0.5) / 0.5;
    const mass = loft(
      [
        { at: -0.05, w: 0.03 * k + 0.004, front: 0.036, back: 0.034, cx: inward * (0.018 + 0.012 * k) },
        { at: -0.075, w: 0.04 * k + 0.004, front: 0.041, back: 0.039, cx: inward * (0.02 + 0.014 * k), p: 3 },
        { at: -0.1, w: 0.036 * k + 0.004, front: 0.038, back: 0.036, cx: inward * (0.016 + 0.012 * k), p: 3 },
      ],
      14,
    );
    out.push(paint(mass, skin));
  }
  // thumb: from the ball of the thumb (the metacarpal is inside the palm), forwards and down when
  // open, across the front of the curled fingers in a fist
  const dOpen = new Vector3(inward * 0.3, -0.82, 0.5).normalize();
  const dFist = new Vector3(inward * 0.35, -0.3, -0.89).normalize();
  const d = dOpen.lerp(dFist, curl).normalize();
  const thumb = new Matrix4().compose(V.set(inward * (0.01 + 0.03 * curl), -0.048 - 0.022 * curl, 0.03), Q.setFromUnitVectors(new Vector3(0, -1, 0), d), ONE);
  [0.036, 0.03].forEach((len, k) => {
    const seg = limb(len, 0.0118 - k * 0.0012, 0.0106 - k * 0.001, 0, 0.5, 7);
    seg.applyMatrix4(thumb);
    out.push(paint(seg, skin));
    thumb.multiply(new Matrix4().makeTranslation(0, -len, 0));
    thumb.multiply(new Matrix4().makeRotationX(0.25 + 0.5 * curl));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Shoes

/**
 * A shoe, pivot at the ankle joint (0.075 m above the ground): a heel counter,
 * an instep that rises to the ankle, a toe box that narrows and rounds, a sole
 * slightly wider than the upper, a raised heel block and a little toe spring.
 * Built along +z (heel at -0.07, toe at +0.235).
 */
export function shoe(upper: Color, sole: Color, opts: { boot?: boolean; heel?: number } = {}): Piece[] {
  const G = -0.075; // ground, relative to the ankle
  const spring = (z: number) => 0.012 * Math.max(0, (z - 0.15) / 0.085) ** 2;
  const heel = opts.heel ?? 0;
  // upper: sections along z, depth = up/down from a centre line, width across
  // the top line, relative to the ankle: a collar round the ankle (about 8 cm off the ground), the
  // instep sloping down to the laces, a toe box about 3.5 cm high that rounds off at the tip
  const H = (z: number) => {
    // height of the upper above the ground (m)
    if (opts.boot && z < 0.04) return 0.125;
    if (z < 0.0) return 0.08;
    if (z < 0.08) return 0.08 - (z / 0.08) * 0.015;
    if (z < 0.16) return 0.065 - ((z - 0.08) / 0.08) * 0.017;
    if (z < 0.205) return 0.048 - ((z - 0.16) / 0.045) * 0.008;
    return 0.04 - ((z - 0.205) / 0.03) ** 2 * 0.016;
  };
  const top = (z: number) => G + H(z);
  const zs = [-0.07, -0.055, -0.03, 0.0, 0.04, 0.085, 0.13, 0.165, 0.195, 0.215, 0.23];
  const widths = [0.052, 0.068, 0.078, 0.084, 0.09, 0.096, 0.1, 0.099, 0.092, 0.08, 0.056];
  const bottom = G + 0.012 + heel;
  const upperSecs: Section[] = zs.map((z, i) => {
    const t = top(z) + (z > 0.1 ? 0 : heel * (1 - z / 0.1));
    const b = bottom * (z < 0.06 ? 1 : 0) + (G + 0.012) * (z < 0.06 ? 0 : 1) + spring(z);
    const mid = (t + b) / 2;
    const half = Math.max(0.006, (t - b) / 2);
    // the toe box sits a little towards the big toe (inside of the foot)
    return { at: z, w: widths[i], front: half, back: half * 0.96, cz: mid, cx: 0, p: z < -0.04 ? 2.4 : z > 0.2 ? 2.2 : 2.9 };
  });
  const up = loft(upperSecs, 16, 'z');
  // sole: a flat slab following the outline, 6 mm wider, thicker at the heel
  const soleSecs: Section[] = zs.map((z, i) => {
    const thick = (z < 0.04 ? 0.016 + heel : 0.012) * 0.5;
    const y = G + thick + spring(z) + (z < 0.04 ? 0 : 0);
    return { at: z + (i === 0 ? -0.004 : i === zs.length - 1 ? 0.005 : 0), w: widths[i] + 0.008, front: thick, back: thick, cz: y, p: 4 };
  });
  const so = loft(soleSecs, 16, 'z');
  // laces: a lighter strip down the instep, so the top of the foot reads
  const laces = loft(
    [0.015, 0.05, 0.085, 0.115].map((z) => ({ at: z, w: 0.026 - z * 0.06, front: 0.0025, back: 0.0025, cz: top(z) - 0.0012, p: 3 })),
    10,
    'z',
  );
  const lace = upper.clone().lerp(new Color(1, 1, 1), 0.1);
  return [paint(up, upper), paint(so, sole), paint(laces, lace)];
}
