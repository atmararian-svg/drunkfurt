import { CanvasTexture, Color, Float32BufferAttribute, Group, Material, Mesh, MeshStandardMaterial, SRGBColorSpace, SphereGeometry } from 'three';
import { ellipsoid, merge, paint, place } from './anatomy';

/**
 * An expressive, drawn face for a character the camera gets close to.
 *
 * The features are inked on a canvas (the same hand the city's facades are
 * drawn with) and mapped onto patches that hug the front of the head from
 * anatomy.ts, so they read as crisp comic linework under any light, while the
 * head underneath keeps its real volume and shadows. The canvas is redrawn
 * only when the expression changes noticeably. A sculpted nose sits on top so
 * the profile still has one.
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

// Head shapes from anatomy.head(): skull and jaw ellipsoids (centre, radii).
const SKULL = { c: [0, 0.1, 0.004], r: [0.077, 0.1, 0.094] } as const;
const JAW = { c: [0, 0.048, 0.028], r: [0.06, 0.062, 0.07] } as const;
/** The face is drawn in head space over this window (metres), front projection. */
const WIN = { x0: -0.08, x1: 0.08, y0: 0.0, y1: 0.18 };
const PX = 512;

/** A patch of an ellipsoid facing +z, inflated a hair so it sits on the surface, UVs by front projection. */
function patch(e: typeof SKULL | typeof JAW, polar0: number, polar1: number, az: number, inflate: number) {
  const g = new SphereGeometry(1, 40, 24, Math.PI / 2 - az, az * 2, polar0, polar1 - polar0);
  g.scale(e.r[0] * inflate, e.r[1] * inflate, e.r[2] * inflate);
  g.translate(e.c[0], e.c[1], e.c[2]);
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - WIN.x0) / (WIN.x1 - WIN.x0);
    uv[i * 2 + 1] = (pos.getY(i) - WIN.y0) / (WIN.y1 - WIN.y0);
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

const shade = (v: number) => `rgb(${v},${v},${v})`;

/** Head-space metres to canvas pixels. */
const X = (x: number) => ((x - WIN.x0) / (WIN.x1 - WIN.x0)) * PX;
const Y = (y: number) => (1 - (y - WIN.y0) / (WIN.y1 - WIN.y0)) * PX;
const S = (m: number) => (m / (WIN.x1 - WIN.x0)) * PX;

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function stroke(ctx: CanvasRenderingContext2D, pts: [number, number][], w: number, color = '#141414') {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.stroke();
}

export interface FaceStyle {
  /** A short, dark beard over the jaw and upper lip instead of stubble. */
  beard?: boolean;
  /** Feather the edges to transparent (for a decal over a modelled face). */
  mask?: boolean;
}

function drawFace(ctx: CanvasRenderingContext2D, skin: number, e: Expression, style: FaceStyle = {}) {
  const a = Math.max(0, e.anger - e.shock * 0.8);
  const ink = '#141414';
  ctx.clearRect(0, 0, PX, PX);
  ctx.fillStyle = shade(skin);
  ctx.fillRect(0, 0, PX, PX);
  // cheek and temple shading: drawn planes, darker under the cheekbones
  for (const s of [-1, 1]) {
    const g = ctx.createRadialGradient(X(s * 0.05), Y(0.07), 0, X(s * 0.05), Y(0.07), S(0.05));
    g.addColorStop(0, 'rgba(20,20,20,0.28)');
    g.addColorStop(1, 'rgba(20,20,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PX, PX);
  }
  if (style.beard) {
    // beard: a dark mass over jaw, chin and upper lip, its edge broken into short strokes
    ctx.fillStyle = 'rgba(28,28,28,0.78)';
    ctx.beginPath();
    ctx.moveTo(X(-0.058), Y(0.085));
    ctx.quadraticCurveTo(X(-0.056), Y(-0.005), X(0), Y(-0.012));
    ctx.quadraticCurveTo(X(0.056), Y(-0.005), X(0.058), Y(0.085));
    ctx.lineTo(X(0.04), Y(0.07));
    ctx.quadraticCurveTo(X(0.02), Y(0.066), X(0.013), Y(0.062));
    ctx.lineTo(X(-0.013), Y(0.062));
    ctx.quadraticCurveTo(X(-0.02), Y(0.066), X(-0.04), Y(0.07));
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 260; i++) {
      const t = hash(i * 7.1) * Math.PI;
      const r = 0.055 + hash(i * 3.3) * 0.006;
      const x = Math.cos(t) * r;
      const y = 0.06 - Math.sin(t) * 0.07;
      stroke(ctx, [[x, y], [x * 1.03, y - 0.005]], 1.5, 'rgba(25,25,25,0.6)');
    }
  }

  // stubble: speckle over jaw, chin and upper lip, thinning towards the cheeks
  for (let i = 0; i < (style.beard ? 0 : 2600); i++) {
    const x = (hash(i) - 0.5) * 0.12;
    const y = 0.012 + hash(i + 0.5) * 0.058;
    const onJaw = (x / 0.058) ** 2 + ((y - 0.03) / 0.04) ** 2 < 1 && !(Math.abs(x) < 0.016 && y > 0.05 && y < 0.068);
    if (!onJaw) continue;
    ctx.fillStyle = `rgba(30,30,30,${0.25 + hash(i * 3) * 0.35})`;
    ctx.fillRect(X(x), Y(y), 2, 2);
  }

  // forehead creases: deeper with anger, raised with shock
  for (let k = 0; k < 3; k++) {
    const y = 0.152 + k * 0.007 + e.shock * 0.004;
    const depth = 0.25 + 0.5 * Math.max(a, e.shock);
    stroke(ctx, [[-0.035, y], [-0.012, y + 0.002], [0.012, y + 0.001], [0.035, y - 0.001]], 2 + depth * 2, `rgba(20,20,20,${0.25 + depth * 0.4})`);
  }
  // the frown line between the brows
  if (a > 0.3) {
    stroke(ctx, [[-0.004, 0.123], [-0.003, 0.136]], 3, `rgba(20,20,20,${a})`);
    stroke(ctx, [[0.004, 0.123], [0.003, 0.134]], 3, `rgba(20,20,20,${a * 0.8})`);
  }

  for (const s of [-1, 1]) {
    const cx = s * 0.031;
    const cy = 0.111;
    // socket shadow
    ctx.fillStyle = 'rgba(20,20,20,0.28)';
    ctx.beginPath();
    ctx.ellipse(X(cx), Y(cy + 0.002), S(0.021), S(0.014), 0, 0, Math.PI * 2);
    ctx.fill();
    // the eye: an almond, white, with a dark iris
    const w = 0.012;
    const h = 0.0058 * (1 + e.shock * 0.4);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X(cx - w), Y(cy));
    ctx.quadraticCurveTo(X(cx), Y(cy + h * 2), X(cx + w), Y(cy));
    ctx.quadraticCurveTo(X(cx), Y(cy - h * 1.6), X(cx - w), Y(cy));
    ctx.closePath();
    ctx.fillStyle = shade(205);
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(X(cx + e.lookX * 0.003), Y(cy - 0.0005 + e.lookY * 0.002), S(0.0048), 0, Math.PI * 2);
    ctx.fill();
    // upper lid comes down with anger, slanted towards the nose
    const lid = 0.0115 * a - 0.004 * e.shock;
    if (lid > 0) {
      ctx.fillStyle = shade(Math.max(20, skin - 30));
      ctx.beginPath();
      ctx.moveTo(X(cx - w - 0.002), Y(cy + h * 2.2));
      ctx.lineTo(X(cx + w + 0.002), Y(cy + h * 2.2));
      ctx.lineTo(X(cx + w + 0.002), Y(cy + h * 1.2 - lid * (s > 0 ? 0.6 : 1.0)));
      ctx.lineTo(X(cx - w - 0.002), Y(cy + h * 1.2 - lid * (s > 0 ? 1.0 : 0.6)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // lash line and a crease above; bags below
    const ly = cy + h * 1.2 - Math.max(0, lid) * 0.8;
    stroke(ctx, [[cx - w * 1.05, cy + 0.0006], [cx - w * 0.3, ly], [cx + w * 0.3, ly], [cx + w * 1.05, cy + 0.0006]], 4.5, ink);
    stroke(ctx, [[cx - w * 0.9, cy - 0.006], [cx, cy - 0.0075], [cx + w * 0.9, cy - 0.006]], 2, 'rgba(20,20,20,0.6)');
    stroke(ctx, [[cx - w * 0.6, cy - 0.0105], [cx + w * 0.7, cy - 0.0095]], 1.6, 'rgba(20,20,20,0.35)');
    // brow: thick, inner end pulled down and in with anger, both ends up with shock
    const inner = cy + 0.017 - 0.009 * a + 0.007 * e.shock;
    const outer = cy + 0.019 + 0.003 * a + 0.006 * e.shock;
    const bx = (u: number) => cx + s * (u - 0.5) * 0.026 - s * 0.003 * a;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(X(bx(0)), Y(inner + 0.0025));
    ctx.quadraticCurveTo(X(bx(0.5)), Y((inner + outer) / 2 + 0.0055), X(bx(1)), Y(outer + 0.0005));
    ctx.quadraticCurveTo(X(bx(0.55)), Y((inner + outer) / 2 + 0.0005), X(bx(0)), Y(inner - 0.0025));
    ctx.closePath();
    ctx.fill();
    // a scar through his left brow
    if (s < 0) stroke(ctx, [[cx - 0.004, inner + 0.008], [cx - 0.001, inner - 0.004]], 2, shade(Math.min(230, skin + 40)));
  }

  // nose: drawn shadow on one side and the nostril line (the sculpted tip sits above)
  stroke(ctx, [[0.007, 0.104], [0.008, 0.088], [0.012, 0.076]], 3, 'rgba(20,20,20,0.55)');
  stroke(ctx, [[-0.012, 0.07], [-0.006, 0.066], [0.0, 0.068], [0.006, 0.066], [0.013, 0.07]], 3, ink);
  // nasolabial folds, deeper as he snarls
  for (const s of [-1, 1]) stroke(ctx, [[s * 0.016, 0.072], [s * 0.022, 0.058], [s * 0.025, 0.045]], 2 + 3 * (e.sneer + a) * 0.5, `rgba(20,20,20,${0.35 + 0.4 * e.sneer})`);

  // mouth
  const open = Math.max(e.open, e.shock * 0.6);
  const my = 0.043;
  const mw = 0.019 + 0.004 * open;
  const corner = -0.004 * a - 0.006 * e.sneer + 0.002 * e.shock;
  const lift = 0.003 * e.sneer; // one side of the upper lip lifts
  if (open < 0.08) {
    stroke(ctx, [[-mw, my + corner], [-mw * 0.4, my + 0.0008], [0, my + 0.0005 + lift * 0.4], [mw * 0.5, my + 0.0008 + lift], [mw, my + corner]], 4.5, ink);
  } else {
    const h = 0.004 + 0.016 * open;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(X(-mw), Y(my + corner));
    ctx.quadraticCurveTo(X(0), Y(my + 0.003 + lift), X(mw), Y(my + corner));
    ctx.quadraticCurveTo(X(0), Y(my - h), X(-mw), Y(my + corner));
    ctx.closePath();
    ctx.fill();
    // teeth: a grey band under the upper lip (gritted when the mouth is only just open)
    ctx.fillStyle = shade(160);
    ctx.fillRect(X(-mw * 0.6), Y(my + 0.0015 + lift * 0.5), S(mw * 1.2), S(Math.min(0.004, h * 0.4)));
  }
  // lower lip shadow and chin crease
  stroke(ctx, [[-0.01, my - 0.007 - open * 0.012], [0.01, my - 0.007 - open * 0.012]], 2.5, 'rgba(20,20,20,0.45)');
  stroke(ctx, [[-0.008, 0.02 - open * 0.006], [0.0, 0.018 - open * 0.006], [0.008, 0.02 - open * 0.006]], 2, 'rgba(20,20,20,0.35)');
  if (style.mask) {
    // keep an oval over the face (brows to chin), feathered into the modelled head
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.78, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(X(0), Y(0.078));
    ctx.scale(S(0.064), S(0.082));
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Canvas-drawn face as a material, redrawn only when the expression changes noticeably. */
export function faceMaterial(skinShade: number, style: FaceStyle = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const material = new MeshStandardMaterial({
    map: tex,
    roughness: 0.8,
    transparent: !!style.mask,
    depthWrite: !style.mask,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  // the drawing is the shading here: clean band edges, no dots across the features
  material.userData.comic = { halftone: 0, mono: true };
  let last = '';
  const set = (e: Expression) => {
    const key = [e.anger, e.sneer, e.open, e.shock, e.lookX, e.lookY].map((v) => Math.round(v * 30)).join(',');
    if (key === last) return;
    last = key;
    drawFace(ctx, skinShade, e, style);
    tex.needsUpdate = true;
  };
  set(calmFace());
  return { material, set };
}

/** The drawing window in head space: decals scale their box to this. */
export const FACE_WINDOW = { width: WIN.x1 - WIN.x0, height: WIN.y1 - WIN.y0, centerY: (WIN.y0 + WIN.y1) / 2, eyeY: 0.111, mouthY: 0.043, eyeGap: 0.062 };

export function buildFace(skinShade: number, sculpt: Material): FaceRig {
  const group = new Group();
  const { material, set } = faceMaterial(skinShade);
  const upper = new Mesh(patch(SKULL, 0.42, 1.95, 1.05, 1.006), material);
  const lower = new Mesh(patch(JAW, 0.7, 2.6, 1.0, 1.008), material);
  for (const m of [upper, lower]) {
    m.userData.ink = false;
    group.add(m);
  }
  // a sculpted, slightly crooked nose so the head has a profile
  const skin = new Color().setStyle(shade(skinShade));
  const nose = new Mesh(
    merge([
      paint(place(ellipsoid(0.0075, 0.023, 0.009), [0.001, 0.093, 0.094], [-0.2, 0, 0.07]), skin),
      paint(place(ellipsoid(0.0115, 0.009, 0.009), [0.003, 0.074, 0.1]), skin),
    ]),
    sculpt,
  );
  nose.userData.ink = 'silhouette';
  group.add(nose);
  return { group, set };
}
