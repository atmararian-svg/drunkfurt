import { NoColorSpace } from 'three';
import { mulberry32 } from '../../core/math';
import { blotches, canvasTexture, grain } from '../../materials/textures';

/**
 * Drunkfurt's city, drawn by hand (procedurally): facades are line drawings
 * with wobbly ink, the way the reference illustrates buildings, so the
 * illustration lives in the surfaces as well as in the post-process.
 */
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const INK = '#141414';

/** A hand-drawn line: slightly wandering, never ruler-straight. */
function inkLine(ctx: CanvasRenderingContext2D, pts: [number, number][], rnd: () => number, width = 3, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * (0.85 + rnd() * 0.3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const j = 1.4;
    const px = x + (rnd() - 0.5) * j;
    const py = y + (rnd() - 0.5) * j;
    if (i === 0) ctx.moveTo(px, py);
    else {
      // subdivide so long lines bend a little
      const [qx, qy] = pts[i - 1];
      const mx = (qx + x) / 2 + (rnd() - 0.5) * 2.2;
      const my = (qy + y) / 2 + (rnd() - 0.5) * 2.2;
      ctx.quadraticCurveTo(mx, my, px, py);
    }
  });
  ctx.stroke();
}

function inkRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, width = 3) {
  inkLine(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], rnd, width);
}

/**
 * Upper floors of a 19th-century city block: 4 bays × 5 floors (12 m × 17 m).
 * Variants change window shape, ornament and tone.
 */
export const facade = (variant: number) =>
  canvasTexture(`city-facade-${variant}`, 768, 1088, (ctx, w, h) => {
    const rnd = mulberry32(300 + variant * 17);
    const tones = ['#9c9a95', '#8b8984', '#a9a6a0', '#7f7d79'];
    ctx.fillStyle = tones[variant % tones.length];
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 10, 'rgba(0,0,0,0.08)', 180, 310 + variant);
    const floors = 5;
    const fh = h / floors;
    const bw = w / 4;
    for (let f = 0; f < floors; f++) {
      const y0 = f * fh;
      // cornice / string course
      inkLine(ctx, [[0, y0 + 6], [w, y0 + 6]], rnd, f === 0 ? 5 : 2.5);
      if (f === 0) inkLine(ctx, [[0, y0 + 16], [w, y0 + 16]], rnd, 2);
      for (let b = 0; b < 4; b++) {
        const x0 = b * bw;
        const ww = bw * 0.46;
        const wh = fh * (f === 4 ? 0.5 : 0.58);
        const wx = x0 + (bw - ww) / 2;
        const wy = y0 + fh * 0.22;
        const lit = rnd();
        // window opening
        ctx.fillStyle = lit < 0.08 ? '#e9dfc6' : lit < 0.1 ? '#d9b92a' : '#1d1d1f';
        ctx.fillRect(wx, wy, ww, wh);
        if (lit < 0.1) {
          // curtains: someone is home
          ctx.fillStyle = 'rgba(40,36,30,0.55)';
          ctx.fillRect(wx, wy, ww * 0.22, wh);
          ctx.fillRect(wx + ww * 0.78, wy, ww * 0.22, wh);
        }
        inkRect(ctx, wx, wy, ww, wh, rnd, 3);
        // mullion and transom
        inkLine(ctx, [[wx + ww / 2, wy], [wx + ww / 2, wy + wh]], rnd, 2);
        inkLine(ctx, [[wx, wy + wh * 0.3], [wx + ww, wy + wh * 0.3]], rnd, 1.6);
        // frame and sill
        inkRect(ctx, wx - 9, wy - 9, ww + 18, wh + 18, rnd, 2);
        inkLine(ctx, [[wx - 14, wy + wh + 12], [wx + ww + 14, wy + wh + 12]], rnd, 4);
        // lintel ornament: triangle, arch or flat
        const kind = (variant + f) % 3;
        if (f < 3) {
          if (kind === 0) inkLine(ctx, [[wx - 14, wy - 14], [wx + ww / 2, wy - 40], [wx + ww + 14, wy - 14], [wx - 14, wy - 14]], rnd, 2.5);
          else if (kind === 1) {
            ctx.strokeStyle = INK;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(wx + ww / 2, wy - 6, ww / 2 + 12, Math.PI * 1.05, Math.PI * 1.95);
            ctx.stroke();
          } else inkLine(ctx, [[wx - 16, wy - 18], [wx + ww + 16, wy - 18]], rnd, 4);
        }
        // the odd balcony on the second floor
        if (f === 3 && (b + variant) % 3 === 0) {
          inkRect(ctx, wx - 22, wy + wh + 10, ww + 44, 26, rnd, 2.5);
          for (let k = 0; k <= 6; k++) inkLine(ctx, [[wx - 22 + (k * (ww + 44)) / 6, wy + wh + 10], [wx - 22 + (k * (ww + 44)) / 6, wy + wh + 36]], rnd, 1.5);
        }
      }
    }
    // pilasters between bays, very light
    for (let b = 1; b < 4; b++) inkLine(ctx, [[b * bw, 20], [b * bw, h]], rnd, 1.2, 'rgba(20,20,20,0.5)');
    grain(ctx, w, h, 8, 320 + variant);
  });

/** Slate mansard roof: dark, with drawn courses. */
export const slate = () =>
  canvasTexture('city-slate', 256, 256, (ctx, w, h) => {
    const rnd = mulberry32(41);
    ctx.fillStyle = '#2c2c2d';
    ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 18) inkLine(ctx, [[0, y], [w, y]], rnd, 1.6, '#151515');
    grain(ctx, w, h, 8, 42);
  });

const SHOPS = [
  { name: 'KIOSK', lit: true, yellow: true },
  { name: 'BAR', lit: true },
  { name: '', lit: false },
  { name: 'HOTEL', lit: true },
  { name: 'PIZZA', lit: false },
  { name: 'LAUNDRY', lit: true },
  { name: '', lit: false },
  { name: 'BAKERY', lit: false },
  { name: 'OPEN 24/7', lit: true, yellow: true },
  { name: 'PAWN SHOP', lit: false },
];

/** Ground-floor shopfronts, 8 m per shop, 4.2 m tall; 10 shops per repeat. */
export const shopfronts = (seed: number) =>
  canvasTexture(`city-shops-${seed}`, 4096, 256, (ctx, w, h) => {
    const rnd = mulberry32(500 + seed);
    ctx.fillStyle = '#5f5e5a';
    ctx.fillRect(0, 0, w, h);
    const sw = w / SHOPS.length;
    for (let i = 0; i < SHOPS.length; i++) {
      const s = SHOPS[(i + seed * 3) % SHOPS.length];
      const x = i * sw;
      // fascia with the name
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 14, 18, sw - 28, 46);
      if (s.name) {
        ctx.fillStyle = s.yellow ? '#f5d21a' : s.lit ? '#efeadb' : '#77756f';
        ctx.font = `700 32px ${SANS}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(s.name, x + 28, 42);
      }
      // window
      ctx.fillStyle = s.lit ? '#d9d2bf' : '#1f1f21';
      ctx.fillRect(x + 22, 80, sw * 0.62, h - 92);
      if (s.lit) {
        ctx.fillStyle = 'rgba(30,28,24,0.6)';
        for (let k = 0; k < 3; k++) ctx.fillRect(x + 40 + k * 60 + rnd() * 20, 150 + rnd() * 30, 30, h - 150);
      }
      inkRect(ctx, x + 22, 80, sw * 0.62, h - 92, rnd, 3);
      // door
      ctx.fillStyle = '#121212';
      ctx.fillRect(x + sw * 0.7, 86, sw * 0.2, h - 86);
      inkRect(ctx, x + sw * 0.7, 86, sw * 0.2, h - 86, rnd, 3);
      inkLine(ctx, [[x + 4, 12], [x + 4, h]], rnd, 3);
    }
    grain(ctx, w, h, 8, 520 + seed);
  });

/** Asphalt: dark, with a few drawn cracks and patched seams. */
export const asphalt = () =>
  canvasTexture('city-asphalt', 512, 512, (ctx, w, h) => {
    const rnd = mulberry32(61);
    ctx.fillStyle = '#3c3c3c';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 16, 'rgba(0,0,0,0.12)', 140, 62);
    for (let i = 0; i < 6; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      inkLine(ctx, [[x, y], [x + (rnd() - 0.5) * 80, y + rnd() * 60], [x + (rnd() - 0.5) * 120, y + 40 + rnd() * 80]], rnd, 1.6, 'rgba(15,15,15,0.7)');
    }
    grain(ctx, w, h, 10, 63);
  });

/** Wet patches: low roughness where water lies (selective gloss), rough elsewhere. */
export const asphaltWet = () =>
  canvasTexture(
    'city-asphalt-wet',
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#e6e6e6';
      ctx.fillRect(0, 0, w, h);
      const rnd = mulberry32(71);
      for (let i = 0; i < 9; i++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 40 + rnd() * 90);
        g.addColorStop(0, 'rgba(40,40,40,1)');
        g.addColorStop(0.7, 'rgba(60,60,60,0.8)');
        g.addColorStop(1, 'rgba(230,230,230,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, 60 + rnd() * 90, 30 + rnd() * 50, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { color: false },
  );

/** Paving slabs with soft, drawn joints. `slab` = slabs per tile edge. */
export const paving = (key: string, base: string, slab: number) =>
  canvasTexture(`city-paving-${key}`, 512, 512, (ctx, w, h) => {
    const rnd = mulberry32(key.length * 31);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 6, 'rgba(0,0,0,0.06)', 150, 81);
    const s = w / slab;
    for (let i = 0; i <= slab; i++) {
      inkLine(ctx, [[i * s, 0], [i * s, h]], rnd, 2, 'rgba(25,25,25,0.45)');
      inkLine(ctx, [[0, i * s], [w, i * s]], rnd, 2, 'rgba(25,25,25,0.45)');
    }
    grain(ctx, w, h, 6, 82);
  });

/** Office tower glazing: window bands, mostly dark, some lit late-working floors. */
export const towerWindows = (seed: number, lit = 0.12, yellow = false) =>
  canvasTexture(`city-tower-${seed}`, 256, 512, (ctx, w, h) => {
    const rnd = mulberry32(900 + seed);
    ctx.fillStyle = '#1d1e21';
    ctx.fillRect(0, 0, w, h);
    const rows = 32;
    const cols = 12;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const on = rnd() < lit * (r % 7 === 3 ? 3 : 1);
        ctx.fillStyle = on ? (yellow && rnd() < 0.5 ? '#c9a92a' : '#c9c4b4') : '#2a2b2f';
        ctx.fillRect(c * (w / cols) + 3, r * (h / rows) + 4, w / cols - 6, h / rows - 9);
      }
  });

/** Light reflected in wet asphalt: a soft vertical streak, brightest at the far end. */
export const streak = () =>
  canvasTexture(
    'city-streak',
    64,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.filter = 'blur(6px)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.45, w * 0.32, h * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    { repeat: false },
  );

/** Night sky over a city: dark, with a dull glow on the horizon. */
export const citySky = () =>
  canvasTexture(
    'city-sky',
    16,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#08090b');
      g.addColorStop(0.5, '#111216');
      g.addColorStop(0.78, '#2a2926');
      g.addColorStop(1, '#3a3732');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );

/** Tram-shelter advertisement. */
export const adPanel = () =>
  canvasTexture(
    'city-ad',
    256,
    384,
    (ctx, w, h) => {
      ctx.fillStyle = '#f1f0e9';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111';
      ctx.font = `400 48px Anton, Impact, ${SANS}`;
      ctx.fillText('DRUNKFURT', 18, 86);
      ctx.fillStyle = '#f5d21a';
      ctx.fillRect(18, 104, 120, 10);
      ctx.fillStyle = '#111';
      ctx.font = `500 21px ${SANS}`;
      ['The city that', 'never sleeps', 'it off.'].forEach((l, i) => ctx.fillText(l, 18, 160 + i * 28));
      ctx.font = `400 13px ${SANS}`;
      ctx.fillText('Please mind the gap. And the people.', 18, h - 26);
    },
    { repeat: false },
  );

/** Kiosk sign. */
export const kioskSign = () =>
  canvasTexture(
    'city-kiosk-sign',
    512,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#f5d21a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111';
      ctx.font = `700 70px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KIOSK', w / 2, h / 2 + 4);
    },
    { repeat: false },
  );

export const noColor = (t: { colorSpace: string }) => {
  t.colorSpace = NoColorSpace;
  return t;
};
