import words from '../scenes/city/letterWords.json';

/**
 * The letter's sheet drawn on a plain 2D canvas (no WebGL context of its own: a second context, made
 * and taken down for each reading, or kept, stalled or hung the page on some graphics cards). The same
 * sheet as before: a grid whose points move between a lumpy crumpled ball and the flat page with its
 * creases and curled corners (the middle opening first), each facet shaded from its own normal with a
 * light that leans towards the pointer, the back plain paper; facets textured by affine mapping and
 * drawn back to front. Once flat it is one picture with its creases laid over it.
 *
 * Units: the sheet is ASPECT × 1, centred on 0; `h` px is one unit at the sheet's own depth.
 */
export const ASPECT = 1592 / 2000;
const GX = 12;
const GY = 15;
const PAPER = 'rgb(236, 231, 219)';
/** The composited page's size (px): faint and ink drawn into it, then mapped onto the facets. */
const PAGE_H = 1100;
const PAGE_W = Math.round(PAGE_H * ASPECT);

const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function n2(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * fx;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * fx;
  return a + (b - a) * fy;
}
function ridge(x: number, y: number) {
  let r = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    r += a * (1 - Math.abs(n2(x, y) * 2 - 1));
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return r;
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface SheetView {
  unfold: number;
  light: { x: number; y: number };
  /** The line being read, and how far along it the ink has come (0…1 of the width); 99: all in ink, -1: none. */
  line: number;
  x: number;
  pos: { x: number; y: number };
  rot: { x: number; y: number; z: number };
  scale: number;
  zoom: number;
  pan: { x: number; y: number };
  /** px per unit at depth 0, and the camera's distance (units). */
  h: number;
  dist: number;
}

export class LetterSheet {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private page = document.createElement('canvas');
  private pctx = this.page.getContext('2d')!;
  private crease = document.createElement('canvas');
  private ink: CanvasImageSource | null = null;
  private faint: CanvasImageSource | null = null;
  private pageKey = '';
  private dpr = 1;
  // per grid point: its uv, the flat position (with creases), the ball position, and its opening delay
  private pts: { u: number; v: number; fx: number; fy: number; fz: number; bx: number; by: number; bz: number; r: number }[] = [];
  // per grid point, per frame: screen x/y and depth
  private sx = new Float32Array((GX + 1) * (GY + 1));
  private sy = new Float32Array((GX + 1) * (GY + 1));
  private wz = new Float32Array((GX + 1) * (GY + 1));
  private wx = new Float32Array((GX + 1) * (GY + 1));
  private wy = new Float32Array((GX + 1) * (GY + 1));
  private order: { i: number; z: number }[] = [];

  constructor() {
    this.canvas.className = 'letter-canvas';
    this.page.width = PAGE_W;
    this.page.height = PAGE_H;
    for (let j = 0; j <= GY; j++) {
      for (let i = 0; i <= GX; i++) {
        const u = i / GX;
        const v = 1 - j / GY;
        const x = (u - 0.5) * ASPECT;
        const y = v - 0.5;
        let fz = (ridge(u * 5, v * 6) - 0.5) * 0.018;
        const corner = smooth(0.55, 1, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2);
        fz += corner * corner * 0.035;
        let dx = x * 1.7;
        let dy = y * 1.4;
        let dz = (n2(u * 7, v * 7) - 0.5) * 1.6 + 0.001;
        const l = Math.hypot(dx, dy, dz);
        dx /= l;
        dy /= l;
        dz /= l;
        const lump = 0.8 + 0.45 * n2(u * 9 + 3, v * 9 + 3) + 0.25 * ridge(u * 13, v * 13);
        const r = Math.hypot(u - 0.5, (v - 0.5) * 1.25);
        this.pts.push({ u, v, fx: x, fy: y, fz, bx: dx * 0.16 * lump, by: dy * 0.16 * lump, bz: dz * 0.16 * lump, r });
      }
    }
    for (let k = 0; k < GX * GY * 2; k++) this.order.push({ i: k, z: 0 });
  }

  setImages(ink: CanvasImageSource | null, faint: CanvasImageSource | null) {
    this.ink = ink;
    this.faint = faint;
    this.pageKey = '';
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Lets go of the drawing (between readings: a 1 px canvas, no images held). */
  empty() {
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.ink = this.faint = null;
    this.pageKey = '';
  }

  /** The page as read so far: the faint words, and in ink the lines said and the one being said up to x. */
  private compose(line: number, x: number) {
    const key = `${line}|${x.toFixed(3)}|${!!this.ink}|${!!this.faint}`;
    if (key === this.pageKey || !this.ink) return;
    this.pageKey = key;
    const p = this.pctx;
    p.clearRect(0, 0, PAGE_W, PAGE_H);
    p.drawImage(this.faint ?? this.ink, 0, 0, PAGE_W, PAGE_H);
    if (line < 0 || this.faint === null || this.faint === this.ink) {
      if (line >= 0 || !this.faint) p.drawImage(this.ink, 0, 0, PAGE_W, PAGE_H);
      return;
    }
    p.save();
    p.beginPath();
    (words.lines as [number, number][]).forEach(([a, b], i) => {
      const y0 = (a - 0.004) * PAGE_H;
      const y1 = (b + 0.004) * PAGE_H;
      if (i < line) p.rect(0, y0, PAGE_W, y1 - y0);
      else if (i === line) p.rect(0, y0, x * PAGE_W, y1 - y0);
    });
    p.clip();
    p.drawImage(this.ink, 0, 0, PAGE_W, PAGE_H);
    p.restore();
  }

  /** The creases of the flat sheet, as shade over it (once per light, page-sized). */
  private creaseKey = '';
  private creases(light: { x: number; y: number }) {
    const key = `${light.x.toFixed(2)}|${light.y.toFixed(2)}`;
    if (key === this.creaseKey) return;
    this.creaseKey = key;
    const c = this.crease;
    c.width = PAGE_W / 2;
    c.height = PAGE_H / 2;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    const cw = c.width / GX;
    const ch = c.height / GY;
    const L = norm(light.x * 0.8, light.y * 0.8, 1);
    for (let j = 0; j < GY; j++) {
      for (let i = 0; i < GX; i++) {
        for (const tri of [[0, 1, 2], [1, 3, 2]]) {
          const id = (a: number) => (j + (a >> 1)) * (GX + 1) + i + (a & 1);
          const q = tri.map((a) => this.pts[id(a)]);
          const n = normal(q[0].fx, q[0].fy, q[0].fz, q[1].fx, q[1].fy, q[1].fz, q[2].fx, q[2].fy, q[2].fz);
          // (the grid's winding faces -z: the printed side is towards the reader)
          const d = Math.max(0, -(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]));
          const shade = 0.86 + 0.18 * d;
          x.fillStyle = shade < 1 ? `rgba(0,0,0,${(1 - shade).toFixed(3)})` : `rgba(255,255,255,${(shade - 1).toFixed(3)})`;
          x.beginPath();
          tri.forEach((a, k) => {
            const px = (i + (a & 1)) * cw;
            const py = (j + (a >> 1)) * ch;
            if (k === 0) x.moveTo(px, py);
            else x.lineTo(px, py);
          });
          x.closePath();
          x.fill();
        }
      }
    }
  }

  private shadowCanvas: HTMLCanvasElement | null = null;
  private shadow() {
    if (this.shadowCanvas) return this.shadowCanvas;
    const c = document.createElement('canvas');
    const w = 124;
    const h = Math.round(w / ASPECT);
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.filter = 'blur(5px)';
    x.fillStyle = 'rgba(0, 0, 0, 0.6)';
    x.fillRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
    return (this.shadowCanvas = c);
  }

  render(view: SheetView) {
    const ctx = this.ctx;
    const W = this.canvas.width / this.dpr;
    const H = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.ink) return;
    this.compose(view.line, view.x);
    const { unfold, rot, pos, scale, h, dist, zoom, pan } = view;
    const f = (zoom - 1) / Math.max(1e-6, 2.4 - 1);
    const camX = pan.x * f;
    const camY = pan.y * f;
    const cx = Math.cos(rot.x), sxr = Math.sin(rot.x);
    const cy = Math.cos(rot.y), syr = Math.sin(rot.y);
    const cz = Math.cos(rot.z), szr = Math.sin(rot.z);
    const project = (k: number, px: number, py: number, pz: number) => {
      // scale, then rotate (Euler XYZ: Rx · Ry · Rz), then move
      let x = px * scale;
      let y = py * scale;
      let z = pz * scale;
      let t = x * cz - y * szr;
      y = x * szr + y * cz;
      x = t;
      t = x * cy + z * syr;
      z = -x * syr + z * cy;
      x = t;
      t = y * cx - z * sxr;
      z = y * sxr + z * cx;
      y = t;
      x += pos.x;
      y += pos.y;
      this.wx[k] = x;
      this.wy[k] = y;
      this.wz[k] = z;
      const persp = (dist / Math.max(0.05, dist - z)) * h * zoom;
      this.sx[k] = W / 2 + (x - camX) * persp;
      this.sy[k] = H / 2 - (y - camY) * persp;
    };

    // flat and open: one picture, with its creases
    if (unfold >= 0.999) {
      const corners: [number, number][] = [[0, 0], [GX, 0], [0, GY]];
      corners.forEach(([i, j], k) => {
        const p = this.pts[j * (GX + 1) + i];
        project(k, p.fx, p.fy, 0);
      });
      const a = (this.sx[1] - this.sx[0]) / PAGE_W;
      const b = (this.sy[1] - this.sy[0]) / PAGE_W;
      const c = (this.sx[2] - this.sx[0]) / PAGE_H;
      const d = (this.sy[2] - this.sy[0]) / PAGE_H;
      ctx.save();
      ctx.transform(a, b, c, d, this.sx[0], this.sy[0]);
      // its shadow (drawn once, small, and stretched: no blur per frame), a little below it
      const sh = this.shadow();
      ctx.drawImage(sh, -PAGE_W * 0.12, -PAGE_H * 0.12 + PAGE_H * 0.03, PAGE_W * 1.24, PAGE_H * 1.24);
      ctx.drawImage(this.page, 0, 0);
      this.creases(view.light);
      ctx.drawImage(this.crease, 0, 0, PAGE_W, PAGE_H);
      ctx.restore();
      return;
    }

    // the points between the ball and the flat sheet
    const flat = smooth(0.6, 1, unfold);
    this.pts.forEach((p, k) => {
      let u = Math.min(1, Math.max(0, unfold * 1.45 - p.r * 0.55));
      u = u * u * (3 - 2 * u);
      project(k, p.bx + (p.fx - p.bx) * u, p.by + (p.fy - p.by) * u, p.bz + (p.fz - p.bz) * u);
    });
    // facets, back to front
    const ids = (cell: number, tri: number) => {
      const i = cell % GX;
      const j = (cell / GX) | 0;
      const base = j * (GX + 1) + i;
      return tri === 0 ? [base, base + 1, base + GX + 1] : [base + 1, base + GX + 2, base + GX + 1];
    };
    for (const o of this.order) {
      const [a, b, c] = ids(o.i >> 1, o.i & 1);
      o.z = this.wz[a] + this.wz[b] + this.wz[c];
    }
    this.order.sort((p, q) => p.z - q.z);
    const L = norm(view.light.x * 0.8, view.light.y * 0.8, 1);
    for (const o of this.order) {
      const [a, b, c] = ids(o.i >> 1, o.i & 1);
      const n = normal(this.wx[a], this.wy[a], this.wz[a], this.wx[b], this.wy[b], this.wz[b], this.wx[c], this.wy[c], this.wz[c]);
      // facing the camera: the printed side (the grid's own winding gives it a -z normal when flat)
      const front = n[2] <= 0;
      const s = front ? -1 : 1;
      const d = Math.max(0, s * (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]));
      const shade = (0.55 + 0.6 * d) * (1 - flat) + (0.86 + 0.18 * d) * flat;
      const x0 = this.sx[a], y0 = this.sy[a], x1 = this.sx[b], y1 = this.sy[b], x2 = this.sx[c], y2 = this.sy[c];
      // (grown by half a pixel round its middle, so neighbours meet without hairlines)
      const mx = (x0 + x1 + x2) / 3;
      const my = (y0 + y1 + y2) / 3;
      const grow = (x: number, y: number): [number, number] => {
        const dx = x - mx;
        const dy = y - my;
        const l = Math.hypot(dx, dy) || 1;
        return [x + (dx / l) * 0.6, y + (dy / l) * 0.6];
      };
      const g = [grow(x0, y0), grow(x1, y1), grow(x2, y2)];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(g[0][0], g[0][1]);
      ctx.lineTo(g[1][0], g[1][1]);
      ctx.lineTo(g[2][0], g[2][1]);
      ctx.closePath();
      if (front) {
        ctx.clip();
        // the texture's three points onto the screen's three
        const pa = this.pts[a], pb = this.pts[b], pc = this.pts[c];
        const u0 = pa.u * PAGE_W, v0 = (1 - pa.v) * PAGE_H;
        const u1 = pb.u * PAGE_W, v1 = (1 - pb.v) * PAGE_H;
        const u2 = pc.u * PAGE_W, v2 = (1 - pc.v) * PAGE_H;
        const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
        if (Math.abs(det) > 1e-6) {
          const ma = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det;
          const mb = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det;
          const mc = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det;
          const md = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det;
          const me = x0 - ma * u0 - mc * v0;
          const mf = y0 - mb * u0 - md * v0;
          ctx.transform(ma, mb, mc, md, me, mf);
          const minU = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 2);
          const minV = Math.max(0, Math.floor(Math.min(v0, v1, v2)) - 2);
          const maxU = Math.min(PAGE_W, Math.ceil(Math.max(u0, u1, u2)) + 2);
          const maxV = Math.min(PAGE_H, Math.ceil(Math.max(v0, v1, v2)) + 2);
          ctx.drawImage(this.page, minU, minV, maxU - minU, maxV - minV, minU, minV, maxU - minU, maxV - minV);
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }
      } else {
        ctx.fillStyle = PAPER;
        ctx.fill();
      }
      if (Math.abs(shade - 1) > 0.01) {
        ctx.fillStyle = shade < 1 ? `rgba(0,0,0,${(1 - shade).toFixed(3)})` : `rgba(255,255,255,${(shade - 1).toFixed(3)})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function norm(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
function normal(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  return norm(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}
