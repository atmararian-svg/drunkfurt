import { Color, Group, Material, Mesh } from 'three';
import { Piece, ellipsoid, merge, paint, place } from './anatomy';

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

  // The head's front surface (skull and jaw ellipsoids from anatomy.head): features sit on it.
  const surf = (x: number, y: number) => {
    const sk = 1 - (x / 0.077) ** 2 - ((y - 0.1) / 0.1) ** 2;
    const jw = 1 - (x / 0.06) ** 2 - ((y - 0.048) / 0.062) ** 2;
    return Math.max(sk > 0 ? 0.004 + 0.094 * Math.sqrt(sk) : 0, jw > 0 ? 0.028 + 0.07 * Math.sqrt(jw) : 0);
  };
  const on = (x: number, y: number, out = 0) => [x, y, surf(x, y) + out] as [number, number, number];

  // static: shadowed eye sockets, stubble, a crooked nose, nasolabial creases, a small plaster
  mesh([
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.022, 0.013, 0.006), on(s * 0.031, 0.112, -0.002)), shadow)),
    // stubble: a darker shell over the jaw and upper lip
    paint(place(ellipsoid(0.0612, 0.046, 0.0712), [0, 0.04, 0.027]), stubble),
    // nose: straight bridge that kinks once, wide tip
    paint(place(ellipsoid(0.008, 0.024, 0.009), on(0.001, 0.094, -0.002), [-0.18, 0, 0.08]), skin),
    paint(place(ellipsoid(0.013, 0.01, 0.01), on(0.003, 0.074, 0.0)), skin),
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.006, 0.004, 0.004), on(0.003 + s * 0.009, 0.069, -0.001)), dark)),
    // creases from nose to mouth corners
    ...[-1, 1].map((s) => paint(place(ellipsoid(0.002, 0.015, 0.003), on(s * 0.022, 0.058, 0.0), [0, 0, s * 0.35]), shadow)),
    // plaster over the left eyebrow, greyed with dirt
    paint(place(ellipsoid(0.012, 0.005, 0.003), on(-0.042, 0.136, 0.0), [0, 0, 0.35]), grey(150)),
  ]);

  // eyes: a small white almond with a dark iris, a skin lid with a dark lash line
  const eyes = [-1, 1].map((s) => {
    const g = new Group();
    g.position.set(...on(s * 0.031, 0.111, -0.001));
    group.add(g);
    const ball = new Mesh(merge([paint(ellipsoid(0.0105, 0.0058, 0.003), white)]), mat);
    ball.userData.ink = false;
    const pupil = new Mesh(merge([paint(ellipsoid(0.0045, 0.0048, 0.0015), dark)]), mat);
    pupil.position.z = 0.0022;
    pupil.userData.ink = false;
    const lid = new Mesh(
      merge([
        paint(place(ellipsoid(0.0122, 0.0075, 0.0034), [0, 0.0045, 0.0006]), skin),
        paint(place(ellipsoid(0.0118, 0.0013, 0.0034), [0, -0.0026, 0.0012]), dark),
      ]),
      mat,
    );
    lid.userData.ink = false;
    const lower = new Mesh(merge([paint(place(ellipsoid(0.011, 0.0028, 0.0032), [0, -0.0062, 0.0006]), skin)]), mat);
    lower.userData.ink = false;
    g.add(ball, pupil, lid, lower);
    return { g, pupil, lid, lower, s };
  });

  // brows: thick, dark, can knit and drop
  const brows = [-1, 1].map((s) => {
    const m = new Mesh(merge([paint(place(ellipsoid(0.018, 0.0045, 0.004), [0, 0, 0]), dark)]), mat);
    m.userData.ink = false;
    m.position.set(...on(s * 0.031, 0.127, 0.0005));
    group.add(m);
    return { m, s };
  });

  // mouth: two halves of the lip line (so the corners can go down), an inner opening, a lower lip
  const mz = surf(0, 0.043);
  const halves = [-1, 1].map((s) => {
    const m = new Mesh(merge([paint(place(ellipsoid(0.012, 0.0022, 0.003), [s * 0.0105, 0, 0]), dark)]), mat);
    m.userData.ink = false;
    m.position.set(0, 0.043, mz + 0.001);
    group.add(m);
    return { m, s };
  });
  const inner = new Mesh(merge([paint(ellipsoid(0.016, 0.009, 0.003), dark)]), mat);
  inner.userData.ink = false;
  inner.position.set(0, 0.04, mz);
  group.add(inner);
  const teeth = new Mesh(merge([paint(ellipsoid(0.012, 0.0028, 0.003), grey(165))]), mat);
  teeth.userData.ink = false;
  teeth.position.set(0, 0.044, mz + 0.0012);
  group.add(teeth);
  const lowerLip = new Mesh(merge([paint(ellipsoid(0.015, 0.0035, 0.004), shadow)]), mat);
  lowerLip.userData.ink = false;
  lowerLip.position.set(0, 0.036, mz - 0.0005);
  group.add(lowerLip);

  const set = (e: Expression) => {
    const a = Math.max(0, e.anger - e.shock * 0.8);
    for (const b of brows) {
      // inner end down (anger) or the whole brow up (shock)
      b.m.rotation.z = b.s * (0.45 * a - 0.15 * e.shock) - b.s * 0.06;
      b.m.position.x = b.s * (0.031 - 0.004 * a);
      b.m.position.y = 0.127 - 0.006 * a + 0.008 * e.shock;
    }
    for (const eye of eyes) {
      // lids narrow with anger; wide with shock
      eye.lid.position.y = -0.001 - 0.0042 * a + 0.0035 * e.shock;
      eye.lid.rotation.z = eye.s * 0.3 * a; // the narrowed, slanted look
      eye.lower.position.y = 0.0016 * a;
      eye.pupil.position.x = e.lookX * 0.0035;
      eye.pupil.position.y = e.lookY * 0.0025 - 0.0005;
    }
    const open = Math.max(e.open, e.shock * 0.6);
    for (const h of halves) {
      // corners down when he sneers or grits his teeth
      h.m.rotation.z = -h.s * (0.22 * e.sneer + 0.1 * a);
      h.m.position.y = 0.043 + (h.s > 0 ? 0.003 * e.sneer : 0) + open * 0.002;
    }
    inner.scale.set(0.55 + 0.45 * open + 0.3 * e.sneer, 0.05 + open * 1.1, 1);
    inner.position.y = 0.039 - open * 0.006;
    teeth.visible = open > 0.12 || e.sneer > 0.45;
    teeth.position.y = 0.0435 - open * 0.0015;
    lowerLip.position.y = 0.036 - open * 0.012;
  };
  set(calmFace());
  return { group, set };
}
