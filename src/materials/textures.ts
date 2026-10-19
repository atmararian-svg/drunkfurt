import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import { mulberry32 } from '../core/math';

/**
 * Procedural canvas textures. Everything here is generated at runtime, so the
 * project needs no external image assets (and no licensing questions).
 */
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const cache = new Map<string, Texture>();

function canvasTexture(
  key: string,
  w: number,
  h: number,
  draw: Draw,
  opts: { color?: boolean; repeat?: boolean; anisotropy?: number } = {},
) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = opts.color === false ? NoColorSpace : SRGBColorSpace;
  t.wrapS = t.wrapT = opts.repeat === false ? ClampToEdgeWrapping : RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = opts.anisotropy ?? 8;
  cache.set(key, t);
  return t;
}

/** Adds per-pixel grain in-place. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const rnd = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Soft blotches for dirt/wear. */
function blotches(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  color: string,
  maxR: number,
  seed: number,
) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = maxR * (0.2 + rnd() * 0.8);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ---------------------------------------------------------------------------
// Surfaces

/** Platform paving: 4×4 slabs per tile (texture covers 2.4 m × 2.4 m). */
export const platformPaving = () =>
  canvasTexture('paving', 1024, 1024, (ctx, w, h) => {
    const rnd = mulberry32(7);
    ctx.fillStyle = '#5d5d5b';
    ctx.fillRect(0, 0, w, h);
    const n = 2;
    const s = w / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = 92 + Math.floor(rnd() * 5);
        ctx.fillStyle = `rgb(${v},${v},${v - 2})`;
        ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
    // comic print: flat fills, so wear is kept to a few faint marks
    blotches(ctx, w, h, 8, 'rgba(30,30,30,0.06)', 120, 11);
    // gum spots, the most honest detail of any German platform
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${40 + rnd() * 30},${40 + rnd() * 30},${40 + rnd() * 30},0.55)`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 2 + rnd() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // soft joints: the floor is a surface, not a grid
    ctx.strokeStyle = 'rgba(30,30,30,0.45)';
    ctx.lineWidth = 5;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
    grain(ctx, w, h, 6, 13);
  });

/** Roughness for the paving: joints rough, slab centres slightly polished by feet. */
export const platformRoughness = () =>
  canvasTexture(
    'paving-rough',
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#b8b8b8';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, 50, 'rgba(70,70,70,0.35)', 90, 21);
      const s = w / 4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s, 0);
        ctx.lineTo(i * s, h);
        ctx.moveTo(0, i * s);
        ctx.lineTo(w, i * s);
        ctx.stroke();
      }
      grain(ctx, w, h, 40, 22);
    },
    { color: false },
  );

export const concrete = () =>
  canvasTexture('concrete', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#7a7a78';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 12, 'rgba(40,40,40,0.07)', 90, 31);
    grain(ctx, w, h, 6, 33);
  });

export const ballast = () =>
  canvasTexture('ballast', 512, 512, (ctx, w, h) => {
    const rnd = mulberry32(41);
    ctx.fillStyle = '#2b2a29';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const v = 30 + rnd() * 70;
      ctx.fillStyle = `rgb(${v},${v * 0.98},${v * 0.95})`;
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 2 + rnd() * 5;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    blotches(ctx, w, h, 20, 'rgba(10,10,10,0.35)', 90, 42);
    grain(ctx, w, h, 20, 43);
  });

/** Roof glazing seen from below: night sky glow broken by glazing bars. */
export const roofGlazing = () =>
  canvasTexture('glazing', 256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#22252b');
    g.addColorStop(1, '#1a1c21');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 4, 'rgba(0,0,0,0.06)', 110, 51); // soot
    ctx.fillStyle = '#0d0d0e';
    ctx.fillRect(0, 0, w, 10); // transverse bar
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(w / 2, 0, 5, h);
  });

/** Soft radial falloff for light pools and glows. */
export const radialGlow = () =>
  canvasTexture(
    'glow',
    256,
    256,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );

/** Rectangular soft spill (light falling out of a train window). */
export const windowSpill = () =>
  canvasTexture(
    'spill',
    128,
    256,
    (ctx, w, h) => {
      ctx.filter = 'blur(14px)';
      ctx.fillStyle = '#fff';
      ctx.fillRect(28, 24, w - 56, h - 48);
      ctx.filter = 'none';
    },
    { repeat: false },
  );

// ---------------------------------------------------------------------------
// Train

/**
 * One window bay of an intercity coach seen from outside: the dark window band,
 * a glazed pane, and a suggestion of the interior (ceiling light, luggage rack,
 * seat backs). Repeats every bay along the car.
 */
export const trainWindowBay = (lit: boolean, variant = 0) =>
  canvasTexture(`bay-${lit}-${variant}`, 512, 256, (ctx, w, h) => {
    const rnd = mulberry32(61 + variant * 13);
    ctx.fillStyle = '#121213';
    ctx.fillRect(0, 0, w, h);
    const px = 34; // pillar half
    const top = 22;
    const bot = h - 18;
    // pane
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, top, w - px * 2, bot - top, 18);
    ctx.clip();
    if (lit) {
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, '#d8d2c5');
      g.addColorStop(0.18, '#9c978d');
      g.addColorStop(0.55, '#5a5650');
      g.addColorStop(1, '#2c2a27');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // ceiling light strip
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, top + 4, w, 9);
      // luggage rack
      ctx.fillStyle = 'rgba(30,30,30,0.7)';
      ctx.fillRect(0, top + 40, w, 8);
      // seat backs
      for (let i = 0; i < 3; i++) {
        const x = px + 30 + i * 150;
        ctx.fillStyle = 'rgba(28,28,30,0.92)';
        ctx.beginPath();
        ctx.roundRect(x, top + 110, 92, bot - top - 100, 22);
        ctx.fill();
        if (rnd() < 0.18) {
          // a lone passenger's head
          ctx.fillStyle = 'rgba(18,18,18,0.95)';
          ctx.beginPath();
          ctx.ellipse(x + 46 + rnd() * 30, top + 104, 20, 25, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.fillStyle = '#1d1e20';
      ctx.fillRect(0, 0, w, h);
    }
    // reflection streak
    const r = ctx.createLinearGradient(0, 0, w, h);
    r.addColorStop(0.2, 'rgba(255,255,255,0)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.07)');
    r.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.strokeStyle = '#080808';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(px, top, w - px * 2, bot - top, 18);
    ctx.stroke();
  });

// ---------------------------------------------------------------------------
// Signage. Fonts are system sans-serif (Helvetica/Arial) to avoid font downloads.

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** Station name sign, mounted parallel to the tracks. */
export const stationNameSign = () =>
  canvasTexture(
    'sign-name',
    1024,
    160,
    (ctx, w, h) => {
      ctx.fillStyle = '#161616';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d9d8d2';
      ctx.lineWidth = 6;
      ctx.strokeRect(9, 9, w - 18, h - 18);
      ctx.fillStyle = '#f1f0e9';
      ctx.font = `600 84px ${SANS}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('Frankfurt (Main) Hbf', w / 2, h / 2 + 4);
    },
    { repeat: false },
  );

/** Platform number cube face. */
export const trackNumberSign = (n: number) =>
  canvasTexture(
    `sign-track-${n}`,
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#141414';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f1f0e9';
      ctx.font = `700 170px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), w / 2, h / 2 + 18);
      ctx.font = `500 30px ${SANS}`;
      ctx.fillText('Gleis', w / 2, 34);
    },
    { repeat: false },
  );

/** Platform section letter (Gleisabschnitt), yellow on black. */
export const sectionSign = (letter: string) =>
  canvasTexture(
    `sign-section-${letter}`,
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f5d21a';
      ctx.font = `700 92px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, w / 2, h / 2 + 6);
    },
    { repeat: false },
  );

export interface BoardInfo {
  track: number;
  time: string;
  train: string;
  via: string;
  destination: string;
}

/** Hanging destination display (Zugzielanzeiger). Static part. */
export const destinationBoard = (info: BoardInfo) =>
  canvasTexture(
    `board-${info.track}-${info.train}`,
    1024,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#0c0c0d';
      ctx.fillRect(0, 0, w, h);
      // track number block
      ctx.fillStyle = '#f1f0e9';
      ctx.fillRect(0, 0, 190, h);
      ctx.fillStyle = '#0c0c0d';
      ctx.font = `700 150px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(info.track), 95, h / 2 + 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f1f0e9';
      ctx.font = `600 46px ${SANS}`;
      ctx.fillText(info.time, 222, 52);
      ctx.fillStyle = '#b9b8b2';
      ctx.font = `500 34px ${SANS}`;
      ctx.fillText(info.train, 222, 102);
      ctx.fillStyle = '#9a9994';
      ctx.font = `400 28px ${SANS}`;
      ctx.fillText(info.via, 370, 52);
      ctx.fillStyle = '#f1f0e9';
      ctx.font = `700 64px ${SANS}`;
      ctx.fillText(info.destination, 370, 112);
      // ticker lane background
      ctx.fillStyle = '#f5d21a';
      ctx.fillRect(190, h - 70, w - 190, 70);
    },
    { repeat: false },
  );

/** Scrolling ticker strip for the destination display (yellow lane). */
export const tickerStrip = (text: string) =>
  canvasTexture(`ticker-${text}`, 2048, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f5d21a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    ctx.font = `600 38px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, h / 2 + 2);
  });

/** Yellow departure timetable poster (DB "Abfahrt" Aushang). */
export const departurePoster = () =>
  canvasTexture(
    'poster-abfahrt',
    256,
    384,
    (ctx, w, h) => {
      const rnd = mulberry32(71);
      ctx.fillStyle = '#f5d21a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111';
      ctx.font = `700 34px ${SANS}`;
      ctx.fillText('Abfahrt', 16, 44);
      ctx.font = `400 12px ${SANS}`;
      ctx.fillText('Frankfurt (Main) Hbf', 16, 64);
      ctx.fillRect(16, 74, w - 32, 2);
      for (let row = 0; row < 22; row++) {
        const y = 92 + row * 13;
        ctx.fillRect(16, y, 26, 6);
        const cols = 3 + Math.floor(rnd() * 3);
        for (let c = 0; c < cols; c++) ctx.fillRect(52 + c * 46, y, 20 + rnd() * 22, 5);
      }
    },
    { repeat: false },
  );

/** Station clock face (German platform clock: plain baton markers, no numerals). */
export const clockFace = () =>
  canvasTexture(
    'clock',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f1f0e9';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.translate(w / 2, h / 2);
      for (let i = 0; i < 60; i++) {
        const big = i % 5 === 0;
        ctx.fillRect(-(big ? 4 : 1.5), -118, big ? 8 : 3, big ? 26 : 9);
        ctx.rotate(Math.PI / 30);
      }
    },
    { repeat: false },
  );

/** Small enamel-style sign with a single line of text. */
export const smallSign = (text: string, opts: { bg?: string; fg?: string; w?: number } = {}) =>
  canvasTexture(
    `small-${text}-${opts.bg}`,
    opts.w ?? 512,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = opts.bg ?? '#141414';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = opts.fg ?? '#f1f0e9';
      ctx.font = `600 54px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3);
    },
    { repeat: false },
  );

/** Diagonal hazard stripes (yellow/black). */
export const hazardStripes = () =>
  canvasTexture('hazard', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f5d21a';
    for (let x = -h; x < w + h; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 24, h);
      ctx.lineTo(x + 24 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  });

/** Distant city glow behind the open end of the hall. */
export const skyGradient = () =>
  canvasTexture(
    'sky',
    16,
    256,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#07080a');
      g.addColorStop(0.55, '#0e0f12');
      g.addColorStop(0.8, '#1f1e1d');
      g.addColorStop(1, '#262422');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { repeat: false },
  );

/** Lit facade/shopfront strip for the concourse. */
export const shopfronts = () =>
  canvasTexture('shopfronts', 2048, 256, (ctx, w, h) => {
    const rnd = mulberry32(81);
    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, w, h);
    const names = ['Reisezentrum', 'Bäckerei', 'Presse', 'Apotheke', 'Café', 'Kiosk', 'Imbiss'];
    let x = 20;
    let i = 0;
    while (x < w - 120) {
      const sw = 220 + rnd() * 160;
      const lit = 120 + rnd() * 80;
      ctx.fillStyle = `rgb(${lit},${lit},${lit * 0.96})`;
      ctx.fillRect(x, 70, sw, h - 70);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k = 1; k < 4; k++) ctx.fillRect(x + (sw / 4) * k, 70, 4, h - 70);
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(x, 18, sw, 44);
      ctx.fillStyle = i === 0 ? '#f5d21a' : '#e8e7e1';
      ctx.font = `600 30px ${SANS}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(names[i % names.length], x + 14, 41);
      x += sw + 26;
      i++;
    }
  });

/** Snack vending machine front: a lit grid of anonymous products. */
export const vendingFront = () =>
  canvasTexture(
    'vending',
    256,
    512,
    (ctx, w, h) => {
      const rnd = mulberry32(91);
      ctx.fillStyle = '#d8d6cf';
      ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 5; c++) {
          const v = 40 + rnd() * 150;
          ctx.fillStyle = rnd() < 0.08 ? '#f5d21a' : `rgb(${v},${v},${v})`;
          ctx.fillRect(14 + c * 46, 20 + r * 74, 34, 48);
          ctx.fillStyle = '#555';
          ctx.fillRect(10 + c * 46, 72 + r * 74, 42, 3);
        }
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, h - 40, w, 40);
    },
    { repeat: false },
  );

/** Glazed gable screen at the head of the hall, softly lit from the concourse. */
export const gableGlazing = () =>
  canvasTexture(
    'gable',
    1024,
    512,
    (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3a3b3d');
      g.addColorStop(1, '#8b8a86');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, 30, 'rgba(0,0,0,0.25)', 120, 101);
      ctx.fillStyle = '#121212';
      for (let x = 0; x <= w; x += w / 24) ctx.fillRect(x - 3, 0, 6, h);
      for (let y = h; y >= 0; y -= h / 9) ctx.fillRect(0, y - 4, w, 8);
      ctx.fillStyle = '#0c0c0c';
      for (let x = 0; x <= w; x += w / 6) ctx.fillRect(x - 9, 0, 18, h);
    },
    { repeat: false },
  );

/** Large concourse departure board (Abfahrt), white type on black. */
export const bigDepartureBoard = () =>
  canvasTexture(
    'big-board',
    2048,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#0b0b0c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f1f0e9';
      ctx.font = `700 64px ${SANS}`;
      ctx.fillText('Abfahrt', 40, 76);
      ctx.fillStyle = '#f5d21a';
      ctx.fillText('Departure', 330, 76);
      const rows = [
        ['23:51', 'S 8', 'Wiesbaden Hbf', '102'],
        ['23:55', 'RE 50', 'Hanau Hbf', '11'],
        ['23:58', 'ICE 1125', 'München Hbf', '9'],
        ['00:04', 'RB 58', 'Aschaffenburg Hbf', '13'],
        ['00:12', 'ICE 1590', 'Berlin Hbf   +25', '8'],
        ['00:20', 'IC 2023', 'Passau Hbf', '6'],
      ];
      ctx.font = `500 46px ${SANS}`;
      rows.forEach((r, i) => {
        const y = 150 + i * 58;
        ctx.fillStyle = '#f1f0e9';
        ctx.fillText(r[0], 40, y);
        ctx.fillText(r[1], 220, y);
        ctx.fillText(r[2], 470, y);
        ctx.fillStyle = r[2].includes('+') ? '#f5d21a' : '#f1f0e9';
        if (r[2].includes('+')) ctx.fillText('+25', 470 + ctx.measureText('Berlin Hbf   ').width, y);
        ctx.fillStyle = '#f1f0e9';
        ctx.fillText(r[3], w - 140, y);
      });
    },
    { repeat: false },
  );
