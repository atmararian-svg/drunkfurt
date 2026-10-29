import { CanvasTexture, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { RED } from '../../ui/palette';

/**
 * The centre screen of the Mercedes' dashboard, right of the wheel. The
 * model's screen has no texture coordinates, so the picture goes on a plane
 * fitted to its face (found from the mesh itself: the side facing the
 * driver), laid just in front of it.
 *
 * What it shows, once the ignition is on: a console in the manner of the
 * cave's terminal (black, white capitals in JetBrains Mono, scan lines), the
 * car's navigation set for the address in the letter, and who is driving.
 * The lines type themselves in as the screen wakes, a red block caret at the
 * end. A small thing for whoever looks right on the way out of town.
 */
export const SCREEN_LINES = [
  'NAV / ROUTE SET',
  'DESTINATION: CRASIGOSTRASSE 24',
  'ETA 00:32',
  '',
  'DRIVER: ARIAN ATMAR',
  'SENIOR UI/UX DESIGNER',
  '6+ YEARS / 30+ PROJECTS',
  'MISSION: FIX THE WEBSITE PROBLEM',
];

const PX = { w: 1024 };
/** Characters typed per second once the screen is on. */
const TYPE_RATE = 34;

export interface CarScreen {
  mesh: Mesh;
  /** The screen's brightness (0 off … 1 on); `now` in ms, for the typing and the caret. */
  set(on: number, now: number): void;
}

/**
 * Fits a plane to the face of `screen` that looks along `towards` (in the
 * frame of `frame`, the car's root), and returns the console drawn on it.
 */
export function buildCarScreen(screen: Mesh, frame: Matrix4, towards: Vector3): CarScreen {
  const g = screen.geometry;
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const m = new Matrix4().multiplyMatrices(frame, screen.matrixWorld);
  const nm = new Matrix4().extractRotation(m);
  const v = new Vector3();
  const n = new Vector3();
  const want = towards.clone().normalize();
  // the face: the vertices whose normals look at the driver
  const front: Vector3[] = [];
  const normal = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i).applyMatrix4(nm).normalize();
    if (n.dot(want) < 0.6) continue;
    normal.add(n);
    front.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  }
  normal.normalize();
  const centre = front.reduce((a, p) => a.add(p), new Vector3()).divideScalar(Math.max(1, front.length));
  // the driver's left to right across it, and up the screen
  const right = new Vector3(-1, 0, 0).addScaledVector(normal, normal.x).normalize();
  const up = new Vector3().crossVectors(normal, right);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of front) {
    const d = p.clone().sub(centre);
    x0 = Math.min(x0, d.dot(right));
    x1 = Math.max(x1, d.dot(right));
    y0 = Math.min(y0, d.dot(up));
    y1 = Math.max(y1, d.dot(up));
  }
  // a little inside the glass's edge, so the bezel stays round it
  const w = (x1 - x0) * 0.94;
  const h = (y1 - y0) * 0.92;
  centre.addScaledVector(right, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2).addScaledVector(normal, 0.002);

  const canvas = document.createElement('canvas');
  canvas.width = PX.w;
  canvas.height = Math.max(64, Math.round((PX.w * h) / Math.max(w, 1e-3)));
  const ctx = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshBasicMaterial({ map: tex, color: 0x000000, toneMapped: false });
  mat.userData.comic = false;
  const mesh = new Mesh(new PlaneGeometry(w, h), mat);
  mesh.name = 'centre-screen';
  mesh.userData.ink = false;
  mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal));
  mesh.position.copy(centre);

  const total = SCREEN_LINES.reduce((a, l) => a + l.length, 0);
  const draw = (chars: number, caret: boolean) => {
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, W, H);
    const size = Math.round(H / 13);
    const lead = Math.round(size * 1.45);
    const left = Math.round(W * 0.06);
    let y = Math.round(H * 0.1) + size;
    let rest = chars;
    // the lines typed so far, the one being typed cut where it has got to; the caret after the last letter
    let end: [number, number] = [left, y];
    for (let i = 0; i < SCREEN_LINES.length; i++) {
      const line = SCREEN_LINES[i];
      const n = Math.min(line.length, rest);
      rest -= n;
      ctx.font = `${i === 0 ? 800 : 600} ${size}px 'JetBrains Mono', ui-monospace, monospace`;
      ctx.fillStyle = i === 0 ? '#ffffff' : '#d6d6d6';
      if (line) {
        const text = `> ${line.slice(0, n)}`;
        ctx.fillText(text, left, y);
        end = [left + ctx.measureText(text).width + 4, y];
      }
      if (n < line.length) break;
      y += lead;
    }
    if (caret) {
      ctx.fillStyle = RED;
      ctx.fillRect(end[0], end[1] - size * 0.8, size * 0.55, size * 0.95);
    }
    // scan lines over everything, as on the cave's screens
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 2);
    tex.needsUpdate = true;
  };

  let since = -1;
  let last = '';
  document.fonts?.ready.then(() => (last = ''));
  return {
    mesh,
    set(on, now) {
      mat.color.setScalar(0.85 * on);
      if (on <= 0.01) {
        since = -1;
        return;
      }
      if (since < 0) since = now;
      const chars = Math.min(total, Math.floor(((now - since) / 1000) * TYPE_RATE));
      const caret = Math.floor(now / 530) % 2 === 0;
      const key = `${chars}|${caret}`;
      if (key === last) return;
      last = key;
      draw(chars, caret);
    },
  };
}
