import { Color, Group, Mesh, MeshBasicMaterial, Material, Object3D } from 'three';
import {
  BODY,
  Build,
  Hair,
  Hat,
  Piece,
  box,
  deltoids,
  ellipsoid,
  fist,
  hairPieces,
  hand,
  head,
  limb,
  merge,
  neck,
  paint,
  pelvis,
  place,
  rod,
  rough,
  shell,
  shoe,
  shoulderX,
  torso,
} from './anatomy';

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
  root: Group;
  body: Group;
  hips: Group;
  spine: Group;
  head: Group;
  shL: Group;
  elL: Group;
  wrL: Group;
  shR: Group;
  elR: Group;
  wrR: Group;
  hipL: Group;
  kneeL: Group;
  ankleL: Group;
  hipR: Group;
  kneeR: Group;
  ankleR: Group;
  suitcase?: Group;
  phone: Object3D;
  /** Open hands and closed fists; toggle visibility to clench. */
  handL: Object3D;
  handR: Object3D;
  fistL: Object3D;
  fistR: Object3D;
}

const grey = (v: number) => new Color().setStyle(`rgb(${v},${v},${v})`);

const BUILDS: Record<Look['build'], Build> = {
  slim: { shoulders: 0.94, hips: 0.92, girth: 0.9, waist: 0.8 },
  average: { shoulders: 1, hips: 1, girth: 1, waist: 0.86 },
  broad: { shoulders: 1.1, hips: 1.02, girth: 1.08, waist: 0.92 },
  soft: { shoulders: 0.98, hips: 1.1, girth: 1.12, waist: 1.0 },
};

function seg(parent: Object3D, pos: [number, number, number] = [0, 0, 0]) {
  const g = new Group();
  g.position.set(...pos);
  parent.add(g);
  return g;
}

function addMesh(parent: Object3D, pieces: Piece[], mat: Material) {
  const m = new Mesh(pieces.length ? merge(pieces) : undefined, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  // people print as silhouettes: outer contour and overlaps, no internal crease lines
  m.userData.ink = 'silhouette';
  parent.add(m);
  return m;
}

/**
 * Builds one person as a joint hierarchy with merged, vertex-coloured segment
 * meshes. Rest pose: standing upright, arms hanging, facing +z.
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
  const soleC = grey(40);
  const accent = grey(Math.max(10, look.top - 22));
  const coat = look.outfit === 'coat' || look.outfit === 'parka';
  // worn clothes hang loose: a size too big
  const pad = (coat ? 0.016 : look.outfit === 'hoodie' ? 0.012 : 0.008) + (look.worn ? 0.016 : 0);
  let seed = 1;
  const cloth = (p: Piece, amount = 0.006) => (look.worn ? rough(p, amount, seed++) : p);
  const g = b.girth;

  const root = new Group();
  const body = seg(root);
  body.scale.setScalar(look.height / 1.75);
  const hips = seg(body, [0, BODY.hip, 0]);
  const spine = seg(hips, [0, BODY.waist - BODY.hip, 0]);

  // --- pelvis segment: hips, seat, coat skirt or dress
  const pel: Piece[] = [paint(pelvis(b, look.outfit === 'dress' ? 0.006 : 0.004), look.outfit === 'dress' ? top : bottom)];
  const hipR = 0.158 * b.hips;
  if (coat || look.outfit === 'dress') {
    const len = look.outfit === 'parka' ? 0.28 : look.outfit === 'dress' ? 0.38 : 0.42;
    const flare = look.outfit === 'dress' ? 0.06 : 0.035;
    pel.push(
      paint(
        place(
          shell([
            [hipR + 0.02, 0.12],
            [hipR + 0.026, 0.0],
            [hipR + 0.026 + flare * 0.5, -len * 0.5],
            [hipR + 0.026 + flare, -len],
          ]),
          [0, 0, 0],
          [0, 0, 0],
          [1, 1, 0.8],
        ),
        top,
      ),
    );
  } else if (look.worn) {
    // a long, sagging hoodie hem, with a faded shirt hanging out below it on one side
    pel.push(paint(cloth(place(shell([[hipR + 0.03, 0.12], [hipR + 0.04, 0.0], [hipR + 0.046, -0.1], [hipR + 0.03, -0.13]], 22), [0, 0, 0], [0, -0.02, 0], [1, 1, 0.8]), 0.008), top));
    pel.push(paint(cloth(place(shell([[hipR + 0.012, -0.08], [hipR + 0.02, -0.16], [hipR + 0.012, -0.2]], 18), [0.012, 0, 0], [0, 0, 0.06], [1, 1, 0.76]), 0.006), grey(look.shirt ?? 120)));
  } else {
    // jacket / hoodie hem over the belt
    pel.push(paint(place(shell([[hipR + 0.014, 0.12], [hipR + 0.02, 0.02], [hipR + 0.024, -0.04]]), [0, 0, 0], [0, 0, 0], [1, 1, 0.78]), top));
  }
  if (look.carry === 'shoulderbag') pel.push(paint(place(ellipsoid(0.04, 0.11, 0.13), [hipR + 0.06, 0.02, 0.02]), accent));
  addMesh(hips, pel, mat);

  // --- torso segment: chest, shoulders, neck, collar, backpack
  const tor: Piece[] = [paint(cloth(torso(b, pad), 0.007), top), ...deltoids(b, pad).map((p) => paint(cloth(p, 0.004), top)), paint(neck(g), skin)];
  // collar
  tor.push(paint(place(limb(0.05, 0.062 * g + pad, 0.07 * g + pad, 0, 0.5, 14), [0, 0.465, -0.005], [0, 0, 0], [1, 1, 0.92]), top));
  if (look.outfit === 'hoodie') {
    tor.push(paint(cloth(place(ellipsoid(0.1, 0.07, 0.07), [0, 0.44, -0.075], [0.3, 0, 0]), 0.008), top));
    if (look.worn) {
      // the hood bunched up behind the neck, and a stretched-out collar of the shirt beneath
      tor.push(paint(cloth(place(ellipsoid(0.12, 0.085, 0.09), [0, 0.47, -0.1], [0.5, 0, 0.08]), 0.012), top));
      tor.push(paint(place(limb(0.03, 0.068, 0.072, 0, 0.5, 14), [0, 0.455, 0.01], [0.15, 0, 0], [1, 1, 0.9]), grey(look.shirt ?? 120)));
      // drawstrings, one longer than the other
      tor.push(paint(place(rod(0.18, 0.004), [-0.03, 0.36, 0.11], [0.15, 0, 0.05]), grey(look.shirt ?? 120)));
      tor.push(paint(place(rod(0.11, 0.004), [0.03, 0.39, 0.11], [0.15, 0, -0.08]), grey(look.shirt ?? 120)));
      // kangaroo pocket
      tor.push(paint(cloth(place(ellipsoid(0.11, 0.07, 0.03), [0, 0.07, 0.115]), 0.004), grey(Math.max(8, look.top - 8))));
    }
  }
  if (look.outfit === 'parka') tor.push(paint(place(ellipsoid(0.1, 0.06, 0.085), [0, 0.46, -0.05]), grey(Math.min(200, look.top + 30))));
  if (look.carry === 'backpack') {
    tor.push(paint(place(ellipsoid(0.14, 0.2, 0.075), [0, 0.22, -0.155]), accent));
    for (const s of [-1, 1]) tor.push(paint(place(box(0.035, 0.36, 0.02), [s * 0.085, 0.24, 0.09], [0.12, 0, 0]), accent));
  }
  if (look.carry === 'shoulderbag') tor.push(paint(place(rod(0.62, 0.008), [0.02, 0.18, 0.1], [0, 0, -0.62]), accent));
  addMesh(spine, tor, mat);

  // --- head
  const headG = seg(spine, [0, BODY.headY + 0.04, 0]);
  addMesh(headG, [...head(skin), ...hairPieces(look.hair, look.hat ?? 'none', hairC, grey(30))], mat);

  // --- arms
  const shX = shoulderX(b);
  const arm = (side: -1 | 1) => {
    const sh = seg(spine, [side * shX, BODY.shoulderY, 0]);
    addMesh(sh, [paint(cloth(limb(BODY.upperArm, 0.052 * g + pad, 0.043 * g + pad, 0.004, 0.3), 0.005), top)], mat);
    const el = seg(sh, [0, -BODY.upperArm, 0]);
    const fore: Piece[] = [paint(cloth(limb(BODY.foreArm, 0.043 * g + pad, 0.034 * g + pad * 0.6, 0.006, 0.22), 0.005), top)];
    // a pushed-up, bunched sleeve
    if (look.worn) fore.push(paint(cloth(place(limb(0.06, 0.046 * g + pad, 0.046 * g + pad, 0, 0.5, 12), [0, -BODY.foreArm + 0.05, 0]), 0.006), top));
    // cuff of skin at the wrist
    fore.push(paint(place(limb(0.03, 0.03, 0.029, 0, 0.5, 8), [0, -BODY.foreArm + 0.012, 0]), skin));
    addMesh(el, fore, mat);
    const wr = seg(el, [0, -BODY.foreArm, 0]);
    const open = addMesh(wr, hand(side, skin), mat);
    const closed = addMesh(wr, fist(side, skin), mat);
    closed.visible = false;
    return { sh, el, wr, open, closed };
  };
  const L = arm(-1);
  const R = arm(1);

  // --- legs
  const leg = (side: -1 | 1) => {
    const hip = seg(hips, [side * BODY.hipX * b.hips, 0, 0]);
    const skirted = look.outfit === 'dress';
    const legC = skirted ? grey(28) : bottom;
    const baggy = look.worn ? 0.018 : 0;
    addMesh(hip, [paint(cloth(place(limb(BODY.thigh, 0.084 * g + baggy, 0.058 * g + baggy, 0.006, 0.25), [0, 0, 0], [0, 0, 0], [1, 1, 0.92]), 0.006), legC)], mat);
    const knee = seg(hip, [0, -BODY.thigh, 0]);
    const shin: Piece[] = [paint(cloth(limb(BODY.shin, 0.056 * g + baggy, 0.04 + baggy, 0.012 * g, 0.28), 0.006), legC)];
    // trousers too long: the hem bunches over the shoes
    if (look.worn) shin.push(paint(cloth(place(ellipsoid(0.07, 0.04, 0.075), [0, -BODY.shin + 0.02, 0.01]), 0.01), legC));
    addMesh(knee, shin, mat);
    const ankle = seg(knee, [0, -BODY.shin, 0]);
    const sh = shoe(shoeC, soleC);
    // scuffs on old trainers
    if (look.worn) sh.push(paint(place(ellipsoid(0.03, 0.02, 0.04), [0.012, -0.012, 0.12]), grey(Math.max(10, (look.shoe ?? 18) - 70))));
    addMesh(ankle, sh, mat);
    return { hip, knee, ankle };
  };
  const LL = leg(-1);
  const RL = leg(1);

  // --- held things
  const phone = new Group();
  const ph = new Mesh(box(0.072, 0.145, 0.009), mat);
  const scr = new Mesh(box(0.062, 0.128, 0.002), screen);
  scr.position.z = 0.0055;
  scr.userData.ink = false;
  phone.add(ph, scr);
  phone.position.set(0, -0.1, 0.03);
  phone.rotation.set(0, 0, 0);
  phone.visible = false;
  R.wr.add(phone);

  if (look.carry === 'tote') {
    // carried on the left shoulder: strap over the shoulder, bag against the hip (rests on the lap when sitting)
    addMesh(spine, [
      paint(place(ellipsoid(0.045, 0.15, 0.15), [-(shX + 0.03), -0.05, 0.02], [0, 0, 0.08]), accent),
      paint(place(rod(0.44, 0.007), [-(shX - 0.01), 0.18, 0.05], [0, 0, 0.06]), accent),
    ], mat);
  }

  let suitcase: Group | undefined;
  if (look.carry === 'suitcase') {
    suitcase = new Group();
    addMesh(suitcase, [
      paint(place(box(0.24, 0.58, 0.4), [0, 0.33, 0]), accent),
      paint(place(ellipsoid(0.125, 0.3, 0.205, 10, 8), [0, 0.33, 0]), accent),
      paint(place(rod(0.4, 0.008), [0, 0.81, 0.06]), grey(30)),
      paint(place(box(0.03, 0.02, 0.1), [0, 1.01, 0.06]), grey(30)),
      paint(place(ellipsoid(0.025, 0.025, 0.025), [0.09, 0.03, -0.17]), grey(20)),
      paint(place(ellipsoid(0.025, 0.025, 0.025), [-0.09, 0.03, -0.17]), grey(20)),
    ], mat);
    body.add(suitcase);
  }

  return {
    root,
    body,
    hips,
    spine,
    head: headG,
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
    handL: L.open,
    handR: R.open,
    fistL: L.closed,
    fistR: R.closed,
  };
}
