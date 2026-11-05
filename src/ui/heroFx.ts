/**
 * The narrator's portrait and his thought box, printed: a comic halftone (Ben-Day dots) in the
 * portrait's own two inks, the blue and the red it is outlined in, laid out of register. It lives a
 * little: a slow wave runs through the dots, and near the pointer they swell and the two inks slide
 * apart, away from it, as a misprint does. On the box the same screen is faint, under the words.
 *
 * Two small 2D canvases, drawn at 30 fps and only while the box is on screen; nothing on the
 * graphics card's 3D page.
 */
const CELL = 7;
const BLUE = '57, 49, 226';
const RED = '223, 12, 32';
const REACH = 190;

const pointer = { x: -1e4, y: -1e4, t: 0 };
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.t = performance.now();
    },
    { passive: true },
  );
}

/** How much the pointer is felt at a page point (0…1), and the unit vector away from it (one object, reused: no garbage per dot). */
const p = { k: 0, ux: 0, uy: 0 };
function near(px: number, py: number) {
  const dx = px - pointer.x;
  const dy = py - pointer.y;
  const d = Math.hypot(dx, dy);
  if (d > REACH) {
    p.k = p.ux = p.uy = 0;
    return p;
  }
  const u = 1 - d / REACH;
  p.k = u * u * (3 - 2 * u);
  p.ux = d > 0 ? dx / d : 0;
  p.uy = d > 0 ? dy / d : 0;
  return p;
}

function fitCanvas(c: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  return dpr;
}

export function mountHeroFx(face: HTMLCanvasElement, box: HTMLElement, src: string) {
  listen();
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  // where the figure is (the portrait's alpha), sampled once per screen cell
  let mask: Float32Array | null = null;
  let cols = 0;
  let rows = 0;
  const boxCanvas = document.createElement('canvas');
  boxCanvas.className = 'hero-box-fx';
  boxCanvas.setAttribute('aria-hidden', 'true');
  box.prepend(boxCanvas);
  const fctx = face.getContext('2d')!;
  const bctx = boxCanvas.getContext('2d')!;

  const sample = (w: number, h: number) => {
    cols = Math.ceil(w / CELL) + 1;
    rows = Math.ceil(h / CELL) + 1;
    const c = document.createElement('canvas');
    c.width = cols;
    c.height = rows;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, cols, rows);
    const d = x.getImageData(0, 0, cols, rows).data;
    mask = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      // ink where the figure is dark (the shirt, the beard, the shadows), little on the lit skin
      const a = d[i * 4 + 3] / 255;
      const lum = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
      mask[i] = a * (0.12 + 0.88 * (1 - lum) * (1 - lum));
    }
  };

  const drawFace = (now: number) => {
    const r = face.getBoundingClientRect();
    if (!r.width || !img.complete || !img.naturalWidth) return;
    const dpr = fitCanvas(face, r.width, r.height);
    if (!mask) sample(r.width, r.height);
    const ctx = fctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.drawImage(img, 0, 0, r.width, r.height);
    const t = now / 1000;
    // the two inks, each its own pass, out of register with each other
    for (const [ink, side] of [[BLUE, -1], [RED, 1]] as const) {
      ctx.fillStyle = `rgba(${ink}, 0.42)`;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const m = mask![j * cols + i];
          if (m < 0.08) continue;
          const x = i * CELL + (j % 2) * (CELL / 2);
          const y = j * CELL;
          near(r.left + x, r.top + y);
          const wave = 0.5 + 0.5 * Math.sin(t * 1.3 - (x + y) * 0.022 + side * 0.6);
          // (near the pointer the dots grow with the ink that is there: the face stays readable)
          const rad = Math.min(CELL * 0.48, m * (0.35 + 0.5 * wave + p.k * 0.7) * CELL * 0.32 + p.k * CELL * 0.08);
          if (rad < 0.25) continue;
          const off = side * (0.8 + p.k * 2.6);
          const cx = x + p.ux * off + side * 0.8;
          const cy = y + p.uy * off;
          ctx.moveTo(cx + rad, cy);
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const drawBox = (now: number) => {
    const r = box.getBoundingClientRect();
    if (!r.width) return;
    const dpr = fitCanvas(boxCanvas, r.width, r.height);
    const ctx = bctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    const t = now / 1000;
    const c = Math.ceil(r.width / CELL) + 1;
    const rw = Math.ceil(r.height / CELL) + 1;
    for (const [ink, side, a] of [['0, 0, 0', 0, 0.07], [BLUE, -1, 0.22], [RED, 1, 0.22]] as const) {
      ctx.fillStyle = `rgba(${ink}, ${a})`;
      ctx.beginPath();
      for (let j = 0; j < rw; j++) {
        for (let i = 0; i < c; i++) {
          const x = i * CELL + (j % 2) * (CELL / 2);
          const y = j * CELL;
          near(r.left + x, r.top + y);
          let rad: number;
          if (side === 0) {
            // the paper's own screen: a fine dot, rising and falling in a slow diagonal wave
            const wave = 0.5 + 0.5 * Math.sin(t * 1.1 - (x - y) * 0.03);
            rad = 0.45 + wave * 0.9 + p.k * 1.4;
          } else {
            // the two inks show only where the pointer is, out of register
            if (p.k < 0.02) continue;
            rad = p.k * CELL * 0.36;
          }
          const off = side * p.k * 2.5;
          const cx = x + p.ux * off;
          const cy = y + p.uy * off;
          ctx.moveTo(cx + rad, cy);
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  };

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // only while the box is up (its own presence sets it visible), and at 30 fps
    if (face.style.visibility !== 'visible' && box.style.visibility !== 'visible') return;
    if (now - last < 33) return;
    last = now;
    drawFace(now);
    drawBox(now);
  };
  const resize = () => (mask = null);
  window.addEventListener('resize', resize);
  img.onload = () => (mask = null);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    boxCanvas.remove();
  };
}
