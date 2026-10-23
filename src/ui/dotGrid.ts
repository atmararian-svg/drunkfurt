/**
 * The preloader's print screen under the pointer: the supplied Framer
 * "DotGridBackground", ported from its React component to a plain canvas
 * with its own logic unchanged: a grid of dots; within `impactRadius` of the
 * pointer each dot leaves its place and orbits it on its own tilted orbit
 * (inclination, ascension, phase and a speed varied per dot, fixed when the
 * grid is built), larger and brighter the nearer it is, smaller and dimmer on
 * the far side of its orbit (depth); when the pointer leaves, the effect
 * decays smoothly over about two thirds of a second.
 *
 * Changed for the page: the colour is the comic's paper white, the grid
 * finer, and the dots' opacity scaled down (ALPHA) so the page stays
 * near-black; the frame loop only draws while something moves (pointer over
 * it or the effect decaying), otherwise the grid stands still as drawn.
 */
export interface DotGridOptions {
  dotColor: { r: number; g: number; b: number };
  dotSize: number;
  dotSpacing: number;
  orbitSpeed: number;
  impactRadius: number;
  scaleOnHover: number;
  enableRevolve: boolean;
}

const DEFAULTS: DotGridOptions = {
  dotColor: { r: 241, g: 240, b: 233 },
  dotSize: 1.6,
  dotSpacing: 12,
  orbitSpeed: 1.5,
  impactRadius: 130,
  scaleOnHover: 1.8,
  enableRevolve: true,
};
/** The page's dots are fainter than the component's (0.3 at rest, 1 under the pointer). */
const ALPHA = 0.32;

function smoothstep(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

interface Dot {
  bx: number;
  by: number;
  inclination: number;
  ascension: number;
  phase: number;
  speedMult: number;
}

export function mountDotGrid(canvas: HTMLCanvasElement, options: Partial<DotGridOptions> = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0;
  let H = 0;
  const mouse = { x: -9999, y: -9999 };
  let hovering = false;
  let leaveTs = 0;
  let prevTs = 0;
  let raf = 0;
  let globalAngle = 0;
  let dots: Dot[] = [];
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const { r, g, b } = cfg.dotColor;

  function buildDots() {
    const sp = cfg.dotSpacing;
    dots = [];
    const cols = Math.ceil(W / sp) + 2;
    const rows = Math.ceil(H / sp) + 2;
    for (let row = 0; row < rows; row++)
      for (let c = 0; c < cols; c++)
        dots.push({
          bx: c * sp,
          by: row * sp,
          inclination: Math.random() * Math.PI,
          ascension: Math.random() * Math.PI * 2,
          phase: Math.random() * Math.PI * 2,
          speedMult: 0.7 + Math.random() * 0.6,
        });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildDots();
    draw(performance.now(), 0);
  }

  /** One frame of the component's loop; returns whether anything is still moving. */
  function draw(ts: number, dt: number) {
    globalAngle += cfg.orbitSpeed * dt;
    ctx!.clearRect(0, 0, W, H);
    const timeSinceLeave = hovering ? 0 : Math.max(0, ts - leaveTs) / 1000;
    const decay = hovering ? 1 : smoothstep(Math.max(0, 1 - timeSinceLeave * 1.5));
    const mx = mouse.x;
    const my = mouse.y;
    const rest = `rgba(${r},${g},${b},${0.3 * ALPHA})`;
    ctx!.fillStyle = rest;
    const s0 = cfg.dotSize;
    for (const d of dots) {
      const dx = d.bx - mx;
      const dy = d.by - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!(dist < cfg.impactRadius && dist > 0) || decay <= 0) {
        // at rest: the plain grid (a square is indistinguishable from a disc at this size, and far cheaper)
        ctx!.fillRect(d.bx - s0 / 2, d.by - s0 / 2, s0, s0);
        continue;
      }
      const t = dist / cfg.impactRadius;
      const inf = smoothstep(1 - t) * decay;
      let x = d.bx;
      let y = d.by;
      let scale: number;
      let alpha: number;
      if (cfg.enableRevolve && !reduced) {
        const orbitR = (1 - t) * cfg.dotSpacing * 0.7 * inf;
        const theta = globalAngle * d.speedMult + d.phase;
        const cosA = Math.cos(d.ascension);
        const sinA = Math.sin(d.ascension);
        const cosI = Math.cos(d.inclination);
        const sinI = Math.sin(d.inclination);
        const lx = Math.cos(theta);
        const ly = Math.sin(theta) * cosI;
        const lz = Math.sin(theta) * sinI;
        x = d.bx + (lx * cosA - ly * sinA) * orbitR;
        y = d.by + (lx * sinA + ly * cosA) * orbitR;
        const depthScale = 0.75 + 0.25 * ((lz + 1) * 0.5);
        scale = (1 + (cfg.scaleOnHover - 1) * inf) * depthScale;
        alpha = (0.3 + 0.7 * inf) * depthScale;
      } else {
        scale = 1 + (cfg.scaleOnHover - 1) * inf;
        alpha = 0.3 + 0.7 * inf;
      }
      ctx!.beginPath();
      ctx!.arc(x, y, (s0 / 2) * scale, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(${r},${g},${b},${alpha * ALPHA})`;
      ctx!.fill();
      ctx!.fillStyle = rest;
    }
    return hovering || decay > 0;
  }

  function loop(ts: number) {
    const dt = Math.min((ts - (prevTs || ts)) / 1000, 0.05);
    prevTs = ts;
    raf = draw(ts, dt) ? requestAnimationFrame(loop) : 0;
    if (!raf) prevTs = 0;
  }
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(loop);
  };
  // the pointer is read from the page (the canvas lies under the preloader's text and takes no events)
  const host = canvas.parentElement ?? canvas;
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    hovering = true;
    wake();
  };
  const leave = () => {
    if (!hovering) return;
    hovering = false;
    leaveTs = performance.now();
    wake();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', leave);
  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerleave', leave);
  };
}
