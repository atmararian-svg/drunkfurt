import {
  Bone,
  Color,
  Float32BufferAttribute,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { BODY, Build, Hair, Hat, Piece, box, ellipsoid, hairPieces, head, merge, paint, place, rod, rough, shoulderX } from './anatomy';
import { Section, hand, loft, shoe } from './shapes';

/** What someone looks like. Shades are sRGB grey values (0–255); yellow is reserved for the world. */
export interface Look {
  height: number;
  build: 'slim' | 'average' | 'broad' | 'soft';
  /** Narrower shoulders and a defined waist, or the reverse. */
  frame?: 'narrow' | 'wide';
  outfit: 'coat' | 'jacket' | 'hoodie' | 'dress' | 'parka';
  top: number;
  bottom: number;
  skin: number;
  hair: Hair;
  hairShade?: number;
  hat?: Hat;
  carry?: 'suitcase' | 'backpack' | 'shoulderbag' | 'tote';
  /** Worn, ill-fitting clothes: irregular cloth, a shirt hanging out, baggy trousers, scuffed shoes. */
  worn?: boolean;
  /** Shade of a shirt showing under the top (worn looks). */
  shirt?: number;
  /** Shade of the shoes (default near-black). */
  shoe?: number;
}

export interface Joints {
  root: Object3D;
  body: Object3D;
  hips: Object3D;
  spine: Object3D;
  head: Object3D;
  shL: Object3D;
  elL: Object3D;
  wrL: Object3D;
  shR: Object3D;
  elR: Object3D;
  wrR: Object3D;
  hipL: Object3D;
  kneeL: Object3D;
  ankleL: Object3D;
  hipR: Object3D;
  kneeR: Object3D;
  ankleR: Object3D;
  suitcase?: Group;
  phone: Object3D;
  /** Height of the ankle joint above the sole, in the body's units. */
  ankleHeight: number;
  /** Rest x/z of the hips joint (the rig's centre over the feet). */
  hipsRest: { x: number; z: number };
  /** Open hands and closed fists; toggle visibility to clench. */
  handL: Object3D;
  handR: Object3D;
  fistL: Object3D;
  fistR: Object3D;
}

const grey = (v: number) => new Color().setStyle(`rgb(${v},${v},${v})`);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const BUILDS: Record<Look['build'], Build> = {
  slim: { shoulders: 0.94, hips: 0.92, girth: 0.9, waist: 0.8 },
  average: { shoulders: 1, hips: 1, girth: 1, waist: 0.86 },
  broad: { shoulders: 1.1, hips: 1.02, girth: 1.08, waist: 0.92 },
  soft: { shoulders: 0.98, hips: 1.1, girth: 1.12, waist: 1.0 },
};

// ---------------------------------------------------------------------------
// Skinning: every part is built in its bone's frame, weighted there, then moved into the body.

type Influence = [Bone, number];
interface Part {
  geo: Piece;
  bone: Bone;
  /** Extra influences for a vertex (bone-local position); the remainder goes to `bone`. */
  weigh?: (p: Vector3) => Influence[];
}

/**
 * Blend across a joint: towards the parent above the part's origin, towards
 * the child around `at` below it. Both parts that meet at a joint use the same
 * blend, so the surface bends there instead of opening a gap.
 */
const joint = (parent: Bone | null, rTop: number, child: Bone | null = null, at = 0, rBottom = 0.04) => (p: Vector3): Influence[] => {
  const out: Influence[] = [];
  if (parent) out.push([parent, smooth(-rTop, rTop, p.y)]);
  if (child) out.push([child, smooth(at + rBottom, at - rBottom, p.y)]);
  return out;
};

function skinPart(part: Part, index: Map<Bone, number>) {
  const g = part.geo;
  const pos = g.getAttribute('position');
  const si = new Uint16Array(pos.count * 4);
  const sw = new Float32Array(pos.count * 4);
  const v = new Vector3();
  const own = index.get(part.bone)!;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const extra = part.weigh ? part.weigh(v).filter(([, w]) => w > 1e-3) : [];
    let rest = 1;
    for (const [, w] of extra) rest -= w;
    const list: [number, number][] = [[own, Math.max(0, rest)], ...extra.map(([b, w]) => [index.get(b)!, w] as [number, number])];
    list.sort((a, b) => b[1] - a[1]);
    const top = list.slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0) || 1;
    top.forEach(([b, w], k) => {
      si[i * 4 + k] = b;
      sw[i * 4 + k] = w / sum;
    });
  }
  g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
}

/** Open loft (no end caps), for coat skirts and hems that the legs move inside. */
function hem(sections: Section[], segments = 18): Piece {
  const g = loft(sections, segments);
  // drop the cap triangles: they reference the two pole vertices at the end of the buffer
  const n = g.getAttribute('position').count;
  const idx = Array.from(g.getIndex()!.array);
  const keep: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = idx.slice(t, t + 3);
    if (tri.some((k) => k >= n - 2) || tri.some((k) => k < segments) || tri.some((k) => k >= n - 2 - segments)) continue;
    keep.push(...tri);
  }
  g.setIndex(keep);
  return g;
}

/**
 * Builds one person as a skinned mesh over a joint hierarchy (the joints keep
 * the names the poses use). Rest pose: standing upright, arms hanging, facing +z.
 * Hands are separate meshes on the wrists: an open hand and a fist, toggled.
 */
export function buildFigure(look: Look, mat: Material, screen: MeshBasicMaterial): Joints {
  const b = { ...BUILDS[look.build] };
  if (look.frame === 'narrow') {
    b.shoulders *= 0.94;
    b.hips *= 1.06;
    b.waist *= 0.92;
  } else if (look.frame === 'wide') {
    b.shoulders *= 1.05;
    b.hips *= 0.96;
  }
  const top = grey(look.top);
  const bottom = grey(look.bottom);
  const skin = grey(look.skin);
  const hairC = grey(look.hairShade ?? 22);
  const shoeC = grey(look.shoe ?? 18);
  const soleC = grey(look.worn ? 70 : look.outfit === 'hoodie' ? 150 : 34);
  const accent = grey(Math.max(10, look.top - 22));
  const coat = look.outfit === 'coat' || look.outfit === 'parka';
  const dress = look.outfit === 'dress';
  // cloth stands off the body: coats most, worn clothes a size too big
  const pad = (coat ? 0.016 : look.outfit === 'hoodie' ? 0.012 : 0.007) + (look.worn ? 0.01 : 0);
  let seed = 1;
  const cloth = (p: Piece, amount = 0.005) => (look.worn ? rough(p, amount, seed++) : p);
  const g = b.girth;
  const wf = b.waist / 0.86;

  // --- skeleton
  const root = new Group();
  const body = new Group();
  root.add(body);
  body.scale.setScalar(look.height / 1.75);
  const bone = (parent: Object3D, pos: [number, number, number]) => {
    const j = new Bone();
    j.position.set(...pos);
    parent.add(j);
    return j;
  };
  const hips = bone(body, [0, BODY.hip, 0]);
  const spine = bone(hips, [0, BODY.waist - BODY.hip, 0]);
  const headB = bone(spine, [0, BODY.headY + 0.04, 0]);
  const shX = shoulderX(b);
  const arm = (side: -1 | 1) => {
    const sh = bone(spine, [side * shX, BODY.shoulderY, 0]);
    const el = bone(sh, [0, -BODY.upperArm, 0]);
    const wr = bone(el, [0, -BODY.foreArm, 0]);
    return { sh, el, wr };
  };
  const L = arm(-1);
  const R = arm(1);
  const leg = (side: -1 | 1) => {
    const hip = bone(hips, [side * BODY.hipX * b.hips, 0, 0]);
    const knee = bone(hip, [0, -BODY.thigh, 0]);
    const ankle = bone(knee, [0, -BODY.shin, 0]);
    return { hip, knee, ankle };
  };
  const LL = leg(-1);
  const RL = leg(1);
  const bones = [hips, spine, headB, L.sh, L.el, L.wr, R.sh, R.el, R.wr, LL.hip, LL.knee, LL.ankle, RL.hip, RL.knee, RL.ankle];
  const parts: Part[] = [];
  const add = (bn: Bone, geo: Piece, color: Color, weigh?: Part['weigh']) => parts.push({ geo: paint(geo, color), bone: bn, weigh });

  // --- torso: waist, ribcage, chest, the slope of the shoulders into the neck (spine frame, y from the waist)
  const sw = (w: number) => w * g + 2 * pad;
  const torsoSecs: Section[] = [
    { at: -0.07, w: sw(0.3 * wf), front: 0.095 * g + pad, back: 0.092 * g + pad },
    { at: 0.0, w: sw(0.292 * wf), front: 0.095 * g + pad, back: 0.09 * g + pad },
    { at: 0.09, w: sw(0.3 * wf), front: 0.1 * g + pad, back: 0.094 * g + pad },
    { at: 0.17, w: sw(0.322), front: 0.112 * g + pad, back: 0.1 * g + pad },
    { at: 0.25, w: sw(0.342), front: 0.124 * g + pad, back: 0.106 * g + pad },
    { at: 0.31, w: sw(0.352) * b.shoulders, front: 0.118 * g + pad, back: 0.106 * g + pad },
    // the shoulder line: the torso narrows above the armpits, the arms' caps make the shoulders,
    // and the trapezius slopes from them up into the neck
    { at: 0.35, w: sw(0.356) * b.shoulders, front: 0.102 * g + pad, back: 0.1 * g + pad, p: 2.2 },
    { at: 0.39, w: sw(0.33) * b.shoulders, front: 0.084 * g + pad, back: 0.088 * g + pad, p: 2.3 },
    { at: 0.418, w: sw(0.27) * b.shoulders, front: 0.07 * g + pad, back: 0.078 * g + pad, p: 2.2 },
    { at: 0.444, w: sw(0.18), front: 0.058 + pad, back: 0.066 + pad },
    { at: 0.468, w: sw(0.125), front: 0.052 + pad, back: 0.056 + pad },
  ];
  // the shoulder girdle moves with the arms a little, the waist with the pelvis
  const torsoWeigh = (p: Vector3): Influence[] => {
    const shoulder = smooth(0.11, 0.2, Math.abs(p.x)) * smooth(0.28, 0.38, p.y) * 0.55;
    return [[p.x < 0 ? L.sh : R.sh, shoulder], [hips, smooth(0.04, -0.06, p.y) * 0.5]];
  };
  add(spine, cloth(loft(torsoSecs, 22), 0.006), top, torsoWeigh);
  // neck, into the head
  add(spine, loft([
    { at: 0.43, w: 0.104 * g, front: 0.05 * g, back: 0.056 * g, cz: -0.004 },
    { at: 0.5, w: 0.098 * g, front: 0.047 * g, back: 0.052 * g, cz: -0.002 },
    { at: 0.585, w: 0.094 * g, front: 0.044 * g, back: 0.05 * g, cz: 0.004 },
  ], 12), skin, (p) => [[headB, smooth(0.5, 0.58, p.y)]]);
  // collar of the top
  add(spine, cloth(loft([
    { at: 0.44, w: 0.15 * g + 2 * pad, front: 0.07 + pad, back: 0.074 + pad },
    { at: 0.49, w: 0.125 * g + 2 * pad, front: 0.062 + pad, back: 0.068 + pad },
  ], 16), 0.004), top);

  // --- pelvis and seat (hips frame, y from the hip joints)
  const hp = b.hips;
  const pelvisC = dress ? top : bottom;
  add(hips, loft([
    { at: 0.11, w: 0.29 * hp * wf + 2 * pad * 0.5, front: 0.09 * hp, back: 0.09 * hp },
    { at: 0.04, w: 0.318 * hp, front: 0.098 * hp, back: 0.106 * hp },
    { at: -0.025, w: 0.334 * hp, front: 0.1 * hp, back: 0.118 * hp },
    { at: -0.08, w: 0.318 * hp, front: 0.094 * hp, back: 0.108 * hp },
    { at: -0.12, w: 0.24 * hp, front: 0.078 * hp, back: 0.08 * hp },
  ], 20), pelvisC, (p) => {
    const toLeg = smooth(-0.02, -0.11, p.y) * smooth(0.02, 0.09, Math.abs(p.x)) * 0.65;
    return [[p.x < 0 ? LL.hip : RL.hip, toLeg], [spine, smooth(0.06, 0.13, p.y) * 0.5]];
  });
  // hems and skirts: they hang from the hips and swing with the legs
  const skirtWeigh = (p: Vector3): Influence[] => {
    const legW = smooth(0.0, -0.4, p.y) * 0.6;
    const r = smooth(-0.07, 0.07, p.x);
    return [[RL.hip, legW * r], [LL.hip, legW * (1 - r)]];
  };
  const hipR = 0.168 * hp;
  if (coat || dress) {
    const len = look.outfit === 'parka' ? 0.3 : dress ? 0.4 : 0.46;
    const flare = dress ? 0.075 : 0.045;
    const secs: Section[] = [0, 0.25, 0.5, 0.75, 1].map((u) => ({
      at: 0.12 - (len + 0.12) * u,
      w: 2 * (hipR + 0.022 + flare * u * u + (u < 0.3 ? 0 : 0.004)),
      front: 0.11 * hp + 0.02 + flare * 0.6 * u,
      back: 0.125 * hp + 0.02 + flare * 0.8 * u,
    }));
    add(hips, cloth(hem(secs, 22), 0.006), top, skirtWeigh);
  } else {
    // jacket or hoodie hem over the belt
    const drop = look.worn ? 0.15 : 0.06;
    add(hips, cloth(hem([
      { at: 0.13, w: 2 * (hipR + 0.012), front: 0.105 * hp + pad, back: 0.11 * hp + pad },
      { at: 0.03, w: 2 * (hipR + 0.02), front: 0.11 * hp + pad, back: 0.122 * hp + pad },
      { at: -drop, w: 2 * (hipR + 0.026), front: 0.112 * hp + pad, back: 0.128 * hp + pad },
    ], 22), 0.008), top, skirtWeigh);
    if (look.worn) {
      // a faded shirt hanging out below the hoodie on one side
      add(hips, cloth(place(hem([
        { at: -0.1, w: 2 * (hipR + 0.014), front: 0.105, back: 0.12 },
        { at: -0.2, w: 2 * (hipR + 0.02), front: 0.108, back: 0.124 },
      ], 18), [0.012, 0, 0], [0, 0, 0.06]), 0.006), grey(look.shirt ?? 120), skirtWeigh);
    }
  }

  // --- arms: sleeves from the shoulder cap to the cuff, a skin wrist below it
  const armParts = (A: { sh: Bone; el: Bone; wr: Bone }) => {
    const s = (w: number) => w * g + 2 * pad;
    add(A.sh, cloth(loft([
      // the deltoid: a dome over the joint that sits under the slope of the trapezius
      { at: 0.012, w: s(0.07), front: 0.034 * g + pad, back: 0.036 * g + pad },
      { at: -0.012, w: s(0.098), front: 0.048 * g + pad, back: 0.05 * g + pad },
      { at: -0.035, w: s(0.104), front: 0.051 * g + pad, back: 0.052 * g + pad },
      { at: -0.07, w: s(0.094), front: 0.047 * g + pad, back: 0.046 * g + pad },
      { at: -0.15, w: s(0.084), front: 0.046 * g + pad, back: 0.041 * g + pad },
      { at: -0.24, w: s(0.074), front: 0.038 * g + pad, back: 0.037 * g + pad },
      { at: -0.3, w: s(0.068), front: 0.035 * g + pad, back: 0.035 * g + pad },
    ], 14), 0.005), top, joint(spine, 0.07, A.el, -BODY.upperArm, 0.045));
    const cuff = look.worn ? -0.17 : -0.225; // worn: sleeves pushed up
    add(A.el, cloth(loft([
      { at: 0.03, w: s(0.07), front: 0.035 * g + pad, back: 0.035 * g + pad },
      { at: -0.05, w: s(0.074), front: 0.037 * g + pad, back: 0.034 * g + pad },
      { at: -0.14, w: s(0.064), front: 0.031 * g + pad, back: 0.029 * g + pad },
      { at: cuff, w: s(0.058) + (look.worn ? 0.012 : 0.004), front: 0.029 * g + pad + 0.003, back: 0.028 * g + pad + 0.003 },
    ], 14), 0.006), top, joint(A.sh, 0.045));
    add(A.el, loft([
      { at: cuff + 0.03, w: 0.058 * g, front: 0.027 * g, back: 0.025 * g },
      { at: -0.2, w: 0.054 * g, front: 0.023 * g, back: 0.021 * g },
      { at: -0.25, w: 0.05 * g, front: 0.018 * g, back: 0.017 * g },
    ], 12), skin);
  };
  armParts(L);
  armParts(R);

  // --- legs: trousers (or tights under a dress), shoes
  const legParts = (G: { hip: Bone; knee: Bone; ankle: Bone }) => {
    const legC = dress ? grey(28) : bottom;
    const baggy = look.worn ? 0.016 : 0;
    const k = dress ? 0.86 : 1; // bare-ish legs under a dress are slimmer than trouser legs
    const t = (w: number) => (w * g + baggy) * k;
    add(G.hip, cloth(loft([
      { at: 0.04, w: t(0.17), front: t(0.084), back: t(0.086) },
      { at: -0.06, w: t(0.168), front: t(0.084), back: t(0.088) },
      { at: -0.2, w: t(0.146), front: t(0.074), back: t(0.076) },
      { at: -0.34, w: t(0.122), front: t(0.062), back: t(0.062) },
      { at: -0.42, w: t(0.112), front: t(0.057), back: t(0.057) },
      { at: -0.45, w: t(0.106), front: t(0.054), back: t(0.054) },
    ], 16), 0.006), legC, joint(hips, 0.06, G.knee, -BODY.thigh, 0.05));
    // trouser legs fall fairly straight; tights follow the calf
    const straight = dress ? 0 : 1;
    const sh = (calf: number, plain: number) => calf + (plain - calf) * straight * 0.7;
    add(G.knee, cloth(loft([
      { at: 0.03, w: t(0.106), front: t(0.054), back: t(0.054) },
      { at: -0.1, w: t(sh(0.104, 0.112)), front: t(sh(0.05, 0.056)), back: t(sh(0.066, 0.058)) },
      { at: -0.22, w: t(sh(0.092, 0.11)), front: t(sh(0.046, 0.055)), back: t(sh(0.056, 0.056)) },
      { at: -0.35, w: t(sh(0.072, 0.108)), front: t(sh(0.04, 0.054)), back: t(sh(0.04, 0.054)) },
      { at: dress ? -0.43 : -0.4, w: t(sh(0.066, 0.112)), front: t(sh(0.036, 0.058)), back: t(sh(0.036, 0.056)), cz: 0.004 },
    ], 16), 0.007), legC, joint(G.hip, 0.05, G.ankle, -BODY.shin, 0.03));
    const sp = shoe(shoeC, soleC);
    if (look.worn) sp.push(paint(place(ellipsoid(0.03, 0.016, 0.04), [0.016, -0.05, 0.12]), grey(Math.max(10, (look.shoe ?? 18) - 70))));
    for (const p of sp) parts.push({ geo: p, bone: G.ankle });
  };
  legParts(LL);
  legParts(RL);

  // --- head, hair and hat
  for (const p of [...head(skin), ...hairPieces(look.hair, look.hat ?? 'none', hairC, grey(30))]) parts.push({ geo: p, bone: headB });

  // --- extras on the torso
  if (look.outfit === 'hoodie') {
    add(spine, cloth(place(ellipsoid(0.1, 0.07, 0.07), [0, 0.44, -0.08], [0.3, 0, 0]), 0.008), top, (p) => [[headB, smooth(0.45, 0.52, p.y) * 0.3]]);
    if (look.worn) {
      add(spine, cloth(place(ellipsoid(0.12, 0.085, 0.09), [0, 0.47, -0.1], [0.5, 0, 0.08]), 0.012), top);
      add(spine, place(rod(0.18, 0.004), [-0.03, 0.36, 0.125], [0.15, 0, 0.05]), grey(look.shirt ?? 120));
      add(spine, place(rod(0.11, 0.004), [0.03, 0.39, 0.12], [0.15, 0, -0.08]), grey(look.shirt ?? 120));
      add(spine, cloth(place(ellipsoid(0.11, 0.07, 0.025), [0, 0.07, 0.112 + pad]), 0.004), grey(Math.max(8, look.top - 8)));
    }
  }
  if (look.outfit === 'parka') add(spine, place(ellipsoid(0.11, 0.06, 0.09), [0, 0.46, -0.04]), grey(Math.min(200, look.top + 30)));
  if (look.carry === 'backpack') {
    add(spine, place(ellipsoid(0.14, 0.2, 0.075), [0, 0.22, -0.16 - pad]), accent);
    for (const s of [-1, 1]) add(spine, place(box(0.03, 0.34, 0.01), [s * 0.085, 0.25, 0.118 * g + pad], [0.12, 0, 0]), accent);
  }
  if (look.carry === 'shoulderbag') {
    add(spine, place(rod(0.62, 0.008), [0.02, 0.18, 0.11 + pad], [0, 0, -0.62]), accent);
    add(hips, place(ellipsoid(0.04, 0.11, 0.13), [hipR + 0.06, 0.02, 0.02]), accent);
  }
  if (look.carry === 'tote') {
    // carried on the left shoulder: strap over the shoulder, bag against the hip
    add(spine, place(ellipsoid(0.045, 0.15, 0.15), [-(shX + 0.035), -0.05, 0.02], [0, 0, 0.08]), accent);
    add(spine, place(rod(0.44, 0.007), [-(shX - 0.01), 0.18, 0.05], [0, 0, 0.06]), accent);
  }

  // --- bind: move each part from its bone's frame into the body, weight it, merge into one skinned mesh
  root.updateMatrixWorld(true);
  const index = new Map(bones.map((bn, i) => [bn, i]));
  const toBody = new Matrix4();
  const bodyInv = body.matrixWorld.clone().invert();
  for (const part of parts) {
    skinPart(part, index);
    toBody.multiplyMatrices(bodyInv, part.bone.matrixWorld);
    part.geo.applyMatrix4(toBody);
  }
  const mesh = new SkinnedMesh(merge(parts.map((p) => p.geo)), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // people print as silhouettes: outer contour and overlaps, no internal crease lines
  mesh.userData.ink = 'silhouette';
  body.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones), mesh.matrixWorld);
  // generous bounds that cover any pose (culling must not drop a raised arm)
  mesh.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.25);

  // --- hands: an open hand and a fist on each wrist
  const handMesh = (wr: Bone, side: -1 | 1, curl: number) => {
    const m = new Mesh(merge(hand(side, skin, curl)), mat);
    m.castShadow = true;
    m.userData.ink = 'silhouette';
    wr.add(m);
    return m;
  };
  const openL = handMesh(L.wr, -1, 0);
  const openR = handMesh(R.wr, 1, 0);
  const fistL = handMesh(L.wr, -1, 1);
  const fistR = handMesh(R.wr, 1, 1);
  fistL.visible = fistR.visible = false;

  // --- held things
  const phone = new Group();
  const ph = new Mesh(box(0.072, 0.145, 0.009), mat);
  const scr = new Mesh(box(0.062, 0.128, 0.002), screen);
  scr.position.z = 0.0055;
  scr.userData.ink = false;
  phone.add(ph, scr);
  phone.position.set(0, -0.1, 0.03);
  phone.visible = false;
  R.wr.add(phone);

  let suitcase: Group | undefined;
  if (look.carry === 'suitcase') {
    suitcase = new Group();
    const sm = new Mesh(
      merge([
        paint(place(box(0.24, 0.58, 0.4), [0, 0.33, 0]), accent),
        paint(place(ellipsoid(0.125, 0.3, 0.205, 10, 8), [0, 0.33, 0]), accent),
        paint(place(rod(0.4, 0.008), [0, 0.81, 0.06]), grey(30)),
        paint(place(box(0.03, 0.02, 0.1), [0, 1.01, 0.06]), grey(30)),
        paint(place(ellipsoid(0.025, 0.025, 0.025), [0.09, 0.03, -0.17]), grey(20)),
        paint(place(ellipsoid(0.025, 0.025, 0.025), [-0.09, 0.03, -0.17]), grey(20)),
      ]),
      mat,
    );
    sm.castShadow = true;
    sm.userData.ink = 'silhouette';
    suitcase.add(sm);
    body.add(suitcase);
  }

  return {
    root,
    body,
    hips,
    spine,
    head: headB,
    shL: L.sh,
    elL: L.el,
    wrL: L.wr,
    shR: R.sh,
    elR: R.el,
    wrR: R.wr,
    hipL: LL.hip,
    kneeL: LL.knee,
    ankleL: LL.ankle,
    hipR: RL.hip,
    kneeR: RL.knee,
    ankleR: RL.ankle,
    suitcase,
    phone,
    ankleHeight: BODY.ankle,
    hipsRest: { x: 0, z: 0 },
    handL: openL,
    handR: openR,
    fistL,
    fistR,
  };
}
