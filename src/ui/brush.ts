import { mulberry32 } from '../core/math';
import { Art, FIGHT_ART, FRAME } from './fightArt';

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
 * The fight you do not see: the street goes dark and blurred first (the pixel layer, ui/scenePixels.ts), then the two hits are
 * printed into the dark as comic sound effects (a jagged burst with a word on
 * it), each popping in as it lands. `t` in seconds of the fight; `beats` gives
 * when the black is complete and when each hit lands.
 */
export function drawHits(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, beats: { dark: number; hit1: number; hit2: number }) {
  ctx.clearRect(0, 0, W, H);
  if (t < 0) return;
  // (the dark itself is the street's own pixels, blurred and shaded, under this)
  // the design's own words (Figma "fight-scene"), placed as there on a 1920 × 1080 frame scaled to fit:
  // BAM from the top left with the first hit, POW from the bottom right with the second
  const k = Math.min(W / FRAME.w, H / FRAME.h);
  const word = (art: Art, at: number, anchor: 'tl' | 'br') => {
    const age = t - at;
    if (age < 0) return;
    // pops in a little too big, settles
    const pop = age < 0.1 ? 1.3 - 0.3 * (age / 0.1) : 1;
    const x = anchor === 'tl' ? art.x * k : W - (FRAME.w - art.x) * k;
    const y = anchor === 'tl' ? art.y * k : H - (FRAME.h - art.y) * k;
    ctx.save();
    ctx.translate(x + (art.w * k) / 2, y + (art.h * k) / 2);
    ctx.scale(k * pop, k * pop);
    ctx.translate(-art.w / 2, -art.h / 2);
    ctx.fillStyle = '#fefefe';
    ctx.fill(artPath(art));
    ctx.restore();
  };
  word(FIGHT_ART.BAM, beats.hit1, 'tl');
  word(FIGHT_ART.POW, beats.hit2, 'br');
}

const paths = new Map<Art, Path2D>();
const artPath = (art: Art) => {
  let p = paths.get(art);
  if (!p) paths.set(art, (p = new Path2D(art.d)));
  return p;
};

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
