import { Color, Group, Material, Mesh } from 'three';
import { Piece, ellipsoid, limb, merge, paint, place } from './anatomy';

/**
 * An expressive face for a character the camera gets close to. Built on top of
 * the plain head from anatomy.ts (pivot at the top of the neck, face towards
 * +z): sunken eye sockets, eyes with movable pupils and lids, heavy brows, a
 * crooked nose, stubble, a mouth that can tighten, sneer or open, and a small
 * plaster over one eyebrow.
 */
export interface Expression {
  /** 0 calm … 1 furious: brows down and in, lids narrow. */
  anger: number;
  /** Upper lip raised on one side, mouth corners down. */
  sneer: number;
  /** 0 closed … 1 open (shouting, effort, shock). */
  open: number;
  /** Brows up (surprise, pain). Counteracts anger. */
  shock: number;
  /** Where he looks, -1..1 (right / up). */
  lookX: number;
  lookY: number;
}

export const calmFace = (): Expression => ({ anger: 0, sneer: 0, open: 0, shock: 0, lookX: 0, lookY: 0 });

export interface FaceRig {
  group: Group;
  set(e: Expression): void;
}

const grey = (v: number) => new Color().setStyle(`rgb(${v},${v},${v})`);

export function buildFace(skinShade: number, mat: Material): FaceRig {
  const group = new Group();
  const skin = grey(skinShade);
  const shadow = grey(Math.max(10, skinShade - 48));
  const stubble = grey(Math.max(12, skinShade - 34));
  const dark = grey(14);
  const white = grey(208);

  const mesh = (pieces: Piece[]) => {
    const m = new Mesh(merge(pieces), mat);
    m.userData.ink = 'silhouette';
    m.castShadow = false;
    group.add(m);
    return m;
  };

  // static: sockets, cheekbones, stubble, crooked nose, plaster
  mesh([
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.021, 0.014, 0.012), [s * 0.031, 0.112, 0.086]), shadow)),
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.026, 0.012, 0.02), [s * 0.04, 0.088, 0.082], [0, 0, s * 0.25]), skin)),
    // bags under the eyes
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.017, 0.005, 0.008), [s * 0.031, 0.099, 0.094]), shadow)),
    // stubble over jaw and upper lip
    paint(place(ellipsoid(0.0615, 0.047, 0.0715), [0, 0.04, 0.027]), stubble),
    paint(place(ellipsoid(0.022, 0.008, 0.012), [0, 0.062, 0.092]), stubble),
    // nose: bridge, a bump where it was broken once, and the tip, a little off true
    paint(place(ellipsoid(0.009, 0.022, 0.012), [0.002, 0.096, 0.099], [-0.2, 0, 0.06]), skin),
    paint(place(ellipsoid(0.008, 0.006, 0.008), [0.004, 0.098, 0.108]), skin),
    paint(place(ellipsoid(0.014, 0.011, 0.012), [0.004, 0.075, 0.107]), skin),
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.007, 0.005, 0.006), [0.004 + s * 0.009, 0.071, 0.104]), shadow)),
    // plaster over the left eyebrow
    paint(place(ellipsoid(0.014, 0.006, 0.004), [-0.04, 0.137, 0.09], [0, 0, 0.35]), grey(190)),
  ]);

  // eyes
  const eyes = [-1, 1].map((s) => {
    const g = new Group();
    g.position.set(s * 0.031, 0.111, 0.0915);
    group.add(g);
    const ball = new Mesh(merge([paint(ellipsoid(0.0115, 0.0078, 0.006), white)]), mat);
    ball.userData.ink = false;
    const pupil = new Mesh(merge([paint(ellipsoid(0.0052, 0.0058, 0.003), dark)]), mat);
    pupil.position.z = 0.0045;
    pupil.userData.ink = false;
    // upper lid: skin cap that slides down to narrow the eye
    const lid = new Mesh(merge([paint(place(ellipsoid(0.0135, 0.0085, 0.0075), [0, 0, 0]), shadow)]), mat);
    lid.userData.ink = false;
    const lower = new Mesh(merge([paint(place(ellipsoid(0.013, 0.004, 0.0068), [0, -0.0065, 0]), skin)]), mat);
    lower.userData.ink = false;
    g.add(ball, pupil, lid, lower);
    return { g, pupil, lid, lower, s };
  });

  // brows: thick, dark, can knit and drop
  const brows = [-1, 1].map((s) => {
    const m = new Mesh(merge([paint(place(limb(0.036, 0.006, 0.0045, 0.0015, 0.4, 8), [0, 0.018, 0], [0, 0, Math.PI / 2]), dark)]), mat);
    m.userData.ink = false;
    m.position.set(s * 0.031, 0.128, 0.094);
    group.add(m);
    return { m, s };
  });

  // mouth: two halves of the lip line (so the corners can go down), an inner opening, a lower lip
  const halves = [-1, 1].map((s) => {
    const m = new Mesh(merge([paint(place(ellipsoid(0.013, 0.0028, 0.004), [s * 0.012, 0, 0]), dark)]), mat);
    m.userData.ink = false;
    m.position.set(0, 0.043, 0.1);
    group.add(m);
    return { m, s };
  });
  const inner = new Mesh(merge([paint(ellipsoid(0.017, 0.01, 0.005), dark)]), mat);
  inner.userData.ink = false;
  inner.position.set(0, 0.04, 0.097);
  group.add(inner);
  const teeth = new Mesh(merge([paint(ellipsoid(0.013, 0.003, 0.004), grey(170))]), mat);
  teeth.userData.ink = false;
  teeth.position.set(0, 0.044, 0.1);
  group.add(teeth);
  const lowerLip = new Mesh(merge([paint(ellipsoid(0.017, 0.0045, 0.006), shadow)]), mat);
  lowerLip.userData.ink = false;
  lowerLip.position.set(0, 0.036, 0.098);
  group.add(lowerLip);

  const set = (e: Expression) => {
    const a = Math.max(0, e.anger - e.shock * 0.8);
    for (const b of brows) {
      // inner end down (anger) or the whole brow up (shock)
      b.m.rotation.z = b.s * (0.42 * a - 0.12 * e.shock) - b.s * 0.05;
      b.m.position.x = b.s * (0.031 - 0.004 * a);
      b.m.position.y = 0.128 - 0.006 * a + 0.009 * e.shock;
    }
    for (const eye of eyes) {
      // lids narrow with anger; wide with shock
      const close = 0.0018 + 0.0052 * a - 0.0035 * e.shock;
      eye.lid.position.y = 0.0062 - close;
      eye.lid.rotation.z = eye.s * 0.25 * a; // the narrowed, slanted look
      eye.lower.position.y = 0.0015 * a;
      eye.pupil.position.x = e.lookX * 0.0035;
      eye.pupil.position.y = e.lookY * 0.0025 - 0.0005;
    }
    const open = Math.max(e.open, e.shock * 0.6);
    for (const h of halves) {
      // corners down when he sneers or grits his teeth
      h.m.rotation.z = -h.s * (0.18 * e.sneer + 0.08 * a);
      h.m.position.y = 0.043 + (h.s > 0 ? 0.004 * e.sneer : 0) + open * 0.003;
    }
    inner.scale.set(0.6 + 0.4 * open + 0.3 * e.sneer, 0.05 + open * 1.0, 1);
    inner.position.y = 0.038 - open * 0.006;
    teeth.visible = open > 0.15 || e.sneer > 0.5;
    teeth.position.y = 0.043 - open * 0.002;
    lowerLip.position.y = 0.035 - open * 0.013;
  };
  set(calmFace());
  return { group, set };
}
