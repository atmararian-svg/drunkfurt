import { TOUCH } from './touch';

/**
 * The trail under the pointer: a liquid dither of glyphs that follows the
 * pointer and the path it took, thinning and melting away behind it. After
 * "ASCII Flow Trail" (a Framer component supplied with the brief: glyph set
 * Floyd–Steinberg, Bayer thresholds, screen blend of the trail), made denser
 * and smoother for the page:
 *
 *  - the pointer is followed with a time-based ease (the same at any frame
 *    rate), and the trail is laid along the whole way it moved each frame, a
 *    point every few pixels, so a fast flick leaves an unbroken stroke, not
 *    a row of blots;
 *  - the trail ages in seconds and narrows as it goes, so the tail is a
 *    smooth taper of the movement;
 *  - only the cells near the trail are worked out, in a grid; nothing is
 *    drawn when the pointer rests and the trail has gone.
 *
 * Grey glyphs drawn with `mix-blend-mode: difference`: a negative of the page
 * under them (light over the dark night, dark over the white screens).
 * Not on touch screens, not with reduced motion.
 */
const CELL = 11;
/** Radius of the stroke at the pointer (CSS px); it narrows to TAPER of that at the end of the tail. */
const RADIUS = 78;
const TAPER = 0.35;
/** How long a point of the trail lasts (s). */
const TAIL_S = 0.85;
/** Spacing of the trail's points along the path (CSS px). */
const STEP = 5;
/** How quickly the head follows the pointer (1/s): high is tight, low is loose and liquid. */
const FOLLOW = 22;
const STRENGTH = 0.85;
const MAX_POINTS = 600;
const GREY = '150, 150, 150';
/** Glyphs from empty to full (the brief's Floyd–Steinberg set, inverted). */
const GLYPHS = [' ', '▩', '▨', '▧', '▦', '▥', '▤', '▣'];
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
/** Alpha levels the glyphs are drawn in (one fill style per level, not per glyph). */
const LEVELS = 6;

export function mountDitherCursor() {
  if (TOUCH || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const canvas = document.createElement('canvas');
  canvas.className = 'dither-cursor';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let W = 0;
  let H = 0;
  let cols = 0;
  let rows = 0;
  let field = new Float32Array(0);
  const size = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cols = Math.ceil(W / CELL);
    rows = Math.ceil(H / CELL);
    field = new Float32Array(cols * rows);
  };
  size();

  const target = { x: 0, y: 0, on: false };
  const head = { x: 0, y: 0 };
  let laid = { x: 0, y: 0 };
  const pts: { x: number; y: number; t: number }[] = [];
  let raf = 0;
  let last = performance.now();
  let idle = true;

  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!target.on) {
      // (back on the page: the trail starts where the pointer is, not from where it left)
      head.x = laid.x = e.clientX;
      head.y = laid.y = e.clientY;
    }
    target.x = e.clientX;
    target.y = e.clientY;
    target.on = true;
    if (idle) {
      idle = false;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const leave = () => (target.on = false);

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    // the head eases after the pointer; the trail is laid along the way it went, every STEP px
    if (target.on) {
      const k = 1 - Math.exp(-FOLLOW * dt);
      head.x += (target.x - head.x) * k;
      head.y += (target.y - head.y) * k;
      const dx = head.x - laid.x;
      const dy = head.y - laid.y;
      const d = Math.hypot(dx, dy);
      const n = Math.floor(d / STEP);
      for (let i = 1; i <= n; i++) pts.push({ x: laid.x + (dx * i) / n, y: laid.y + (dy * i) / n, t: t - dt * (1 - i / n) });
      if (n > 0) laid = { x: head.x, y: head.y };
      // resting: the head keeps its glow
      if (n === 0 && (pts.length === 0 || t - pts[pts.length - 1].t > 0.05)) pts.push({ x: head.x, y: head.y, t });
    }
    while (pts.length && (t - pts[0].t > TAIL_S || pts.length > MAX_POINTS)) pts.shift();

    ctx.clearRect(0, 0, W, H);
    if (!pts.length) {
      if (!target.on) {
        idle = true;
        return;
      }
      raf = requestAnimationFrame(frame);
      return;
    }
    // the field: each point stamps a soft disc (screen blend), narrower and fainter as it ages
    let c0 = cols;
    let c1 = 0;
    let r0 = rows;
    let r1 = 0;
    for (const p of pts) {
      const life = 1 - (t - p.t) / TAIL_S;
      const R = RADIUS * (TAPER + (1 - TAPER) * life);
      const a = Math.max(0, Math.floor((p.x - R) / CELL));
      const b = Math.min(cols - 1, Math.floor((p.x + R) / CELL));
      const c = Math.max(0, Math.floor((p.y - R) / CELL));
      const e = Math.min(rows - 1, Math.floor((p.y + R) / CELL));
      if (a > b || c > e) continue;
      c0 = Math.min(c0, a);
      c1 = Math.max(c1, b);
      r0 = Math.min(r0, c);
      r1 = Math.max(r1, e);
      const w = life * life * STRENGTH * 0.5;
      for (let row = c; row <= e; row++) {
        const cy = row * CELL + CELL / 2 - p.y;
        for (let col = a; col <= b; col++) {
          const cx = col * CELL + CELL / 2 - p.x;
          const q = 1 - Math.hypot(cx, cy) / R;
          if (q <= 0) continue;
          const v = q * q * (3 - 2 * q) * w;
          const i = row * cols + col;
          field[i] = 1 - (1 - field[i]) * (1 - v);
        }
      }
    }
    // the glyphs: a slow turbulence over the field, Bayer thresholds, grouped by alpha level
    ctx.font = `${CELL + 1}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const byLevel: number[][] = Array.from({ length: LEVELS }, () => []);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * cols + col;
        let v = field[i];
        field[i] = 0;
        if (v <= 0.01) continue;
        v += Math.sin(col * 0.11 + t * 1.7) * Math.cos(row * 0.11 + t * 1.2) * 0.08;
        const th = BAYER[row % 4][col % 4] / 16;
        v = v > th ? Math.min(1, v * 1.15) : v * 0.5;
        if (v <= 0.03) continue;
        const g = Math.min(GLYPHS.length - 1, 1 + Math.floor(v * (GLYPHS.length - 1)));
        byLevel[Math.min(LEVELS - 1, Math.floor(v * LEVELS))].push(i, g);
      }
    }
    for (let l = 0; l < LEVELS; l++) {
      const list = byLevel[l];
      if (!list.length) continue;
      ctx.fillStyle = `rgba(${GREY}, ${((l + 1) / LEVELS).toFixed(3)})`;
      for (let j = 0; j < list.length; j += 2) {
        const i = list[j];
        const col = i % cols;
        const row = (i - col) / cols;
        ctx.fillText(GLYPHS[list[j + 1]], col * CELL + CELL / 2, row * CELL + CELL / 2);
      }
    }
    raf = requestAnimationFrame(frame);
  };

  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);
  window.addEventListener('resize', size);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', move);
    document.documentElement.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    window.removeEventListener('resize', size);
    canvas.remove();
  };
}
