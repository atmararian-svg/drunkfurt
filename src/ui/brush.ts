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
 * The fight's conceal, after Framer's "Ignite Reveal" without the fire: the
 * dark spreads over the frame from a few points as an irregular, organic
 * front (distance from the points, broken up by fractal noise), its edge a
 * soft ash grey, and later recedes the same way, opening from other points.
 * `c` is the coverage (0 … 1; the share of the frame that is dark, exactly,
 * because the field is ranked); 'close' spreads it, 'open' is what is left of
 * it while it recedes. At 1 the frame is solid black, so nothing shows.
 */
interface Field {
  w: number;
  h: number;
  rank: Float32Array;
}
const fields = new Map<string, Field>();
const IGNITE = { cells: 220, edge: 0.07, ink: [10, 10, 10], ash: [70, 70, 68] };

function igniteField(w: number, h: number, seed: number): Field {
  const key = `${w}x${h}:${seed}`;
  const known = fields.get(key);
  if (known) return known;
  const rnd = mulberry32(seed);
  // value noise on a few lattices, summed (fBm)
  const lattice = (n: number) => {
    const g = Array.from({ length: (n + 2) * (n + 2) }, () => rnd());
    return (x: number, y: number) => {
      const fx = x * n;
      const fy = y * n;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[Math.min(n + 1, j) * (n + 2) + Math.min(n + 1, i)];
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const octaves = [lattice(4), lattice(9), lattice(19), lattice(41)];
  const seeds = Array.from({ length: 3 }, () => [0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7]);
  const aspect = w / h;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const v = y / (h - 1);
      let d = 9;
      for (const [sx, sy] of seeds) d = Math.min(d, Math.hypot((u - sx) * aspect, v - sy));
      let n = 0;
      let amp = 0.5;
      for (const o of octaves) {
        n += o(u, v) * amp;
        amp *= 0.5;
      }
      raw[y * w + x] = d + n * 0.55;
    }
  // ranked: a field value is the share of the frame below it, so coverage is area
  const order = Array.from(raw.keys()).sort((a, b) => raw[a] - raw[b]);
  const rank = new Float32Array(w * h);
  order.forEach((i, k) => (rank[i] = k / (order.length - 1)));
  const f = { w, h, rank };
  fields.set(key, f);
  return f;
}

let igniteTiny: HTMLCanvasElement | null = null;

export function drawIgnite(ctx: CanvasRenderingContext2D, W: number, H: number, c: number, mode: 'close' | 'open', seed = 11) {
  ctx.clearRect(0, 0, W, H);
  if (c <= 0.001) return;
  const [ir, ig, ib] = IGNITE.ink;
  if (c >= 0.999) {
    ctx.fillStyle = `rgb(${ir},${ig},${ib})`;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const gw = IGNITE.cells;
  const gh = Math.max(1, Math.round((gw * H) / W));
  // spreading and receding start from different points
  const field = igniteField(gw, gh, mode === 'close' ? seed : seed + 17);
  igniteTiny ??= document.createElement('canvas');
  const tiny = igniteTiny;
  if (tiny.width !== gw || tiny.height !== gh) {
    tiny.width = gw;
    tiny.height = gh;
  }
  const tctx = tiny.getContext('2d')!;
  const img = tctx.createImageData(gw, gh);
  const e = IGNITE.edge;
  const [ar, ag, ab] = IGNITE.ash;
  // closing: dark where the field is below the front; opening: the holes grow where it is below the front
  const front = mode === 'close' ? c * (1 + e) : (1 - c) * (1 + e) - e;
  for (let i = 0; i < field.rank.length; i++) {
    const f = field.rank[i];
    // 1 deep in the dark … 0 outside it, across the edge band
    const k = mode === 'close' ? Math.min(1, Math.max(0, (front - f) / e)) : Math.min(1, Math.max(0, (f - front) / e));
    // the edge is ash grey, thin and soft; deep inside, ink
    const ash = k > 0 && k < 1 ? Math.sin(k * Math.PI) * 0.7 : 0;
    img.data[i * 4] = ir + (ar - ir) * ash;
    img.data[i * 4 + 1] = ig + (ag - ig) * ash;
    img.data[i * 4 + 2] = ib + (ab - ib) * ash;
    img.data[i * 4 + 3] = Math.round(255 * Math.min(1, k * 1.6));
  }
  tctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tiny, 0, 0, gw, gh, 0, 0, W, H);
}

/**
 * The fight you do not see: the page goes black first (drawIgnite), then the two hits are
 * printed into the dark as comic sound effects (a jagged burst with a word on
 * it), each popping in as it lands. `t` in seconds of the fight; `beats` gives
 * when the black is complete and when each hit lands.
 */
export function drawHits(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, beats: { dark: number; hit1: number; hit2: number }) {
  ctx.clearRect(0, 0, W, H);
  if (t < 0) return;
  // (the dark itself is the conceal's, drawIgnite, under this)
  const u = Math.min(W, H);
  const word = (text: string, at: number, cx: number, cy: number, tilt: number, seed: number) => {
    const age = t - at;
    if (age < 0) return;
    // pops in a little too big, settles
    const pop = age < 0.1 ? 1.35 - 0.35 * (age / 0.1) : 1;
    const r = u * 0.2 * pop;
    const rnd = mulberry32(seed);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    // the burst: a jagged star in paper white with an ink edge
    ctx.beginPath();
    const n = 15;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r * (0.95 + rnd() * 0.25) : r * (0.55 + rnd() * 0.12);
      ctx.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#f1f0e9';
    ctx.fill();
    ctx.lineWidth = u * 0.008;
    ctx.strokeStyle = '#101010';
    ctx.stroke();
    // the word: heavy condensed letters in the yellow accent, inked
    ctx.font = `${Math.round(r * 0.62)}px Anton, Impact, 'Arial Narrow Bold', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = u * 0.014;
    ctx.strokeStyle = '#101010';
    ctx.strokeText(text, 0, r * 0.04);
    ctx.fillStyle = '#f5d21a';
    ctx.fillText(text, 0, r * 0.04);
    ctx.restore();
  };
  word('BAM!', beats.hit1, W * 0.36, H * 0.4, -0.16, 3);
  word('WHAM!', beats.hit2, W * 0.64, H * 0.6, 0.12, 8);
}

/**
 * Knocked out, from your own eyes: a white-red flash with the speed lines of
 * the hit, then black closing in from above and below in ragged ink, like
 * heavy eyelids. `t` in seconds; `dark` is when the frame is fully black.
 */
export function drawKnockout(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, dark: number) {
  ctx.clearRect(0, 0, W, H);
  if (t < 0) return;
  const rnd = mulberry32(5);
  if (t < 0.18) {
    const a = 1 - t / 0.18;
    ctx.fillStyle = `rgba(241,240,233,${0.95 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(213,58,50,${0.35 * a})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (t < 0.5) {
    const cx = W * 0.5;
    const cy = H * 0.48;
    ctx.strokeStyle = `rgba(12,12,12,${0.8 * (1 - t / 0.5)})`;
    for (let i = 0; i < 40; i++) {
      const ang = rnd() * Math.PI * 2;
      const r0 = Math.min(W, H) * (0.12 + rnd() * 0.1);
      ctx.lineWidth = 1 + rnd() * 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * W, cy + Math.sin(ang) * W);
      ctx.stroke();
    }
  }
  // eyelids: ragged black from top and bottom, closing (and flickering open once)
  const close = Math.min(1, Math.max(0, (t - 0.35) / (dark - 0.35)));
  const flutter = t > 0.9 && t < 1.15 ? 0.25 * Math.sin(((t - 0.9) / 0.25) * Math.PI) : 0;
  const c = Math.max(0, close - flutter);
  if (c > 0) {
    ctx.fillStyle = '#0c0c0c';
    for (const dir of [1, -1]) {
      const edge = dir > 0 ? (H / 2) * c * 1.05 : H - (H / 2) * c * 1.05;
      ctx.beginPath();
      ctx.moveTo(0, dir > 0 ? 0 : H);
      for (let k = 0; k <= 24; k++) {
        const x = (k / 24) * W;
        const sag = Math.sin((k / 24) * Math.PI) * H * 0.06 * dir;
        ctx.lineTo(x, edge + sag + (rnd() - 0.5) * H * 0.02);
      }
      ctx.lineTo(W, dir > 0 ? 0 : H);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (t >= dark) {
    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, 0, W, H);
  }
}

/**
 * Speed lines, as a comic draws them: tapered ink streaks radiating from a
 * clear centre (the vanishing point of the road ahead) out to the edges of the
 * frame. `k` (0..1) is how strong the rush is; `t` (seconds) moves the streaks
 * along, a new set every 1/24 s like hand-drawn frames.
 */
export function drawSpeedLines(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, t: number, cx = 0.5, cy = 0.42) {
  if (k <= 0) return;
  const rnd = mulberry32(1 + Math.floor(t * 24));
  const ox = W * cx;
  const oy = H * cy;
  const reach = Math.hypot(W, H) * 0.62;
  const count = Math.round(26 + 34 * k);
  ctx.save();
  ctx.fillStyle = '#101010';
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    // streaks hug the edges; the centre of the frame (the road) stays clear
    const inner = reach * (0.5 - 0.16 * k + rnd() * 0.22);
    const outer = reach * 1.05;
    const w = (0.004 + rnd() * 0.012) * reach * (0.6 + 0.6 * k);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ctx.globalAlpha = (0.35 + 0.5 * rnd()) * k;
    ctx.beginPath();
    ctx.moveTo(ox + ca * inner, oy + sa * inner);
    ctx.lineTo(ox + ca * outer - sa * w, oy + sa * outer + ca * w);
    ctx.lineTo(ox + ca * outer + sa * w, oy + sa * outer - ca * w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
