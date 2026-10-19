import { mulberry32 } from '../core/math';

/**
 * Ink-brush wipes, drawn on a canvas: a handful of broad, ragged black strokes
 * that sweep across the frame like the next panel being inked in. `w` is the
 * coverage (0..1); 'close' strokes grow from the left, 'open' strokes pull away
 * to the right, revealing the next shot from the left.
 */
interface Stroke {
  y: number; // centre, 0..1
  h: number; // thickness, 0..1
  tilt: number; // radians
  delay: number; // 0..1
  top: number[]; // edge noise
  bottom: number[];
  bristles: { y: number; w: number }[];
}

const N = 64;

function makeStrokes(seed: number): Stroke[] {
  const rnd = mulberry32(seed);
  const strokes: Stroke[] = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const noise = () => {
      const a: number[] = [];
      let v = 0;
      for (let k = 0; k < N; k++) {
        v = v * 0.7 + (rnd() - 0.5) * 0.6;
        a.push(v);
      }
      return a;
    };
    strokes.push({
      y: (i + 0.5) / count + (rnd() - 0.5) * 0.04,
      h: 1.9 / count + rnd() * 0.05,
      tilt: (rnd() - 0.5) * 0.09,
      delay: rnd() * 0.8,
      top: noise(),
      bottom: noise(),
      bristles: Array.from({ length: 5 }, () => ({ y: rnd(), w: 0.6 + rnd() * 1.6 })),
    });
  }
  return strokes;
}

const cache = new Map<number, Stroke[]>();

export function drawBrushWipe(ctx: CanvasRenderingContext2D, W: number, H: number, w: number, mode: 'close' | 'open', seed = 7) {
  ctx.clearRect(0, 0, W, H);
  if (w <= 0.001) return;
  if (w >= 0.999) {
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  let strokes = cache.get(seed);
  if (!strokes) cache.set(seed, (strokes = makeStrokes(seed)));
  const span = W * 1.25;
  for (const s of strokes) {
    const p = Math.min(1, Math.max(0, (w - s.delay * 0.5) / (1 - s.delay * 0.5)));
    if (p <= 0) continue;
    // stroke extent along x
    let x0: number;
    let x1: number;
    if (mode === 'close') {
      x0 = -W * 0.08;
      x1 = x0 + span * p;
    } else {
      x1 = W * 1.08;
      x0 = x1 - span * p;
    }
    const cy = s.y * H;
    const half = (s.h * H) / 2;
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.rotate(s.tilt);
    ctx.translate(-W / 2, -cy);
    const lead = mode === 'close' ? x1 : x0;
    const dir = mode === 'close' ? 1 : -1;
    // the stroke thins towards its leading end, like a brush running out of ink
    const taper = (k: number) => {
      const u = mode === 'close' ? k / (N - 1) : 1 - k / (N - 1);
      return u < 0.82 ? 1 : 1 - ((u - 0.82) / 0.18) ** 1.6 * 0.75;
    };
    ctx.beginPath();
    for (let k = 0; k <= N - 1; k++) {
      const x = x0 + ((x1 - x0) * k) / (N - 1);
      ctx.lineTo(x, cy - half * taper(k) + s.top[k] * half * 0.35);
    }
    for (let k = N - 1; k >= 0; k--) {
      const x = x0 + ((x1 - x0) * k) / (N - 1);
      ctx.lineTo(x, cy + half * taper(k) + s.bottom[k] * half * 0.35);
    }
    ctx.closePath();
    ctx.fillStyle = '#0c0c0c';
    ctx.fill();
    // bristle trails: thin streaks running past the end of the stroke
    for (const b of s.bristles) {
      const y = cy - half * 0.4 + b.y * half * 0.8;
      const len = 30 + b.w * 70;
      ctx.beginPath();
      ctx.moveTo(lead - dir * 40, y - 2 - b.w);
      ctx.quadraticCurveTo(lead + dir * len * 0.5, y + (b.y - 0.5) * 8, lead + dir * len, y + (b.y - 0.5) * 14);
      ctx.quadraticCurveTo(lead + dir * len * 0.5, y + (b.y - 0.5) * 8 + 1, lead - dir * 40, y + 2 + b.w);
      ctx.fill();
    }
    // dry-brush streaks inside the stroke
    ctx.strokeStyle = 'rgba(40,40,40,0.55)';
    ctx.lineWidth = 1.2;
    for (const b of s.bristles) {
      const y = cy - half * 0.8 + b.y * half * 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 + (x1 - x0) * 0.1, y);
      ctx.lineTo(x0 + (x1 - x0) * (0.4 + b.w * 0.2), y + b.w * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The strike: a flash of paper, black strokes slamming across, a small burst of
 * red (the only red in the experience), then black. `t` in seconds.
 */
export function drawImpact(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  ctx.clearRect(0, 0, W, H);
  if (t < 0) return;
  const rnd = mulberry32(99);
  // paper flash
  if (t < 0.14) {
    ctx.fillStyle = `rgba(241,240,233,${0.9 * (1 - t / 0.14)})`;
    ctx.fillRect(0, 0, W, H);
  }
  // speed lines radiating from the point of impact
  const cx = W * 0.52;
  const cy = H * 0.5;
  if (t > 0.03 && t < 0.6) {
    ctx.strokeStyle = 'rgba(12,12,12,0.85)';
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r0 = Math.min(W, H) * (0.18 + rnd() * 0.12);
      const r1 = Math.max(W, H) * 0.9;
      ctx.lineWidth = 1 + rnd() * 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  // three heavy strokes, one after another
  const slams = [
    { a: -0.5, at: 0.06 },
    { a: 0.42, at: 0.16 },
    { a: -0.12, at: 0.27 },
  ];
  ctx.fillStyle = '#0c0c0c';
  for (const s of slams) {
    const p = Math.min(1, Math.max(0, (t - s.at) / 0.09));
    if (p <= 0) continue;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.a);
    const len = Math.max(W, H) * 1.3 * p;
    const th = Math.min(W, H) * 0.16;
    ctx.beginPath();
    ctx.moveTo(-len / 2, -th * 0.4);
    for (let k = 0; k <= 12; k++) ctx.lineTo(-len / 2 + (len * k) / 12, -th / 2 + (rnd() - 0.5) * th * 0.25);
    for (let k = 12; k >= 0; k--) ctx.lineTo(-len / 2 + (len * k) / 12, th / 2 + (rnd() - 0.5) * th * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // the red burst: small, sharp, gone quickly
  const rp = Math.min(1, Math.max(0, (t - 0.12) / 0.08));
  const rf = 1 - Math.min(1, Math.max(0, (t - 0.55) / 0.3));
  if (rp > 0 && rf > 0) {
    ctx.save();
    ctx.translate(cx + W * 0.02, cy - H * 0.02);
    ctx.rotate(0.3);
    ctx.globalAlpha = rf;
    ctx.fillStyle = '#d53a32';
    ctx.beginPath();
    const spikes = 11;
    const R = Math.min(W, H) * 0.11 * (0.6 + 0.4 * rp);
    for (let k = 0; k < spikes * 2; k++) {
      const r = k % 2 === 0 ? R * (0.9 + rnd() * 0.5) : R * 0.38;
      const a = (k / (spikes * 2)) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // ink closes over everything
  const black = Math.min(1, Math.max(0, (t - 0.42) / 0.4));
  if (black > 0) {
    ctx.fillStyle = `rgba(12,12,12,${black})`;
    ctx.fillRect(0, 0, W, H);
  }
}
