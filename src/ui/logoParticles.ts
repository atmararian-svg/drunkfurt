import { TOUCH } from './touch';

/**
 * The DRUNKFURT logo as a field of points that the pointer pushes away and that gather back (the
 * header's logo, and the phone page's): after the supplied LogoParticleDistortion (Framer), its
 * physics kept as they were, scaled from its 800 px logo to this one's size, and the way back 40 %
 * quicker (return 0.014, was 0.01).
 *
 * Drawn on a 2D canvas, not WebGL: a second WebGL context on this page has hung it before (the
 * letter's), and the logo's thousand-odd points cost a 2D canvas nothing. The points move only
 * while the pointer is near or they are still on their way back: then the loop stops, and the
 * logo is one still picture until the pointer comes near again (no frame is spent on it at rest).
 * Its frames keep to 60 a second, as the rest of the page (render/frameRate.ts).
 */
const REF_LOGO = 720; // the supplied component's logo across (its 800 px canvas at 0.9)
const PHYS = {
  /** In the reference's px, scaled to this logo's size. */
  radius: 350,
  force: 0.0027,
  maxMove: 100,
  /** Pulled back by this share of the way each frame (0.01 in the reference; 40 % quicker). */
  ret: 0.014,
  damping: 0.82,
  /** The pull lasts this many frames after the pointer last moved near. */
  frames: 300,
};
/**
 * Points every `step` css px of the logo (the logo's width over SAMPLES: 1 px in the header's 165 px logo,
 * where coarser points lost its thin middle letters; 2 on the phone's), each a little wider than the gap,
 * so the field reads as the logo. At rest the logo is drawn whole, sharp; it breaks into its points as
 * the pointer comes, and is whole again once they are all home.
 */
const SAMPLES = 230;
const DOT_OVER = 1.15;

export function mountLogoParticles(host: HTMLElement, svg: string, colour = '#fff') {
  const canvas = document.createElement('canvas');
  canvas.className = 'logo-dots';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  let alive = true;
  let raf = 0;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let k = 1; // this logo's size over the reference's
  let STEP = 1;
  let DOT = 1;
  let n = 0;
  let pos = new Float32Array(0);
  let org = new Float32Array(0);
  let vel = new Float32Array(0);
  let image: HTMLImageElement | null = null;
  let pull = 0;
  const mouse = { x: -1e5, y: -1e5 };
  let last = -Infinity;

  /** The logo's points: where it is drawn, sampled every STEP px. */
  const build = () => {
    const r = host.getBoundingClientRect();
    if (!image || r.width < 2 || r.height < 2) return false;
    // (the screen's own density, up to 3: a phone's logo drawn at 2 and stretched read as pixels)
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    k = W / REF_LOGO;
    STEP = Math.max(1, W / SAMPLES);
    DOT = STEP * DOT_OVER;
    const cols = Math.max(1, Math.floor(W / STEP));
    const rows = Math.max(1, Math.floor(H / STEP));
    const probe = document.createElement('canvas');
    probe.width = cols;
    probe.height = rows;
    const p = probe.getContext('2d', { willReadFrequently: true });
    if (!p) return false;
    p.drawImage(image, 0, 0, cols, rows);
    const px = p.getImageData(0, 0, cols, rows).data;
    const at: number[] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (px[(y * cols + x) * 4 + 3] > 110) at.push((x + 0.5) * STEP, (y + 0.5) * STEP);
    n = at.length / 2;
    org = Float32Array.from(at);
    pos = Float32Array.from(at);
    vel = new Float32Array(at.length);
    return true;
  };

  /** At rest: the logo itself, sharp (its picture made at the canvas's own size, `sharp`). */
  let sharp: HTMLImageElement | null = null;
  const drawWhole = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const src = sharp ?? image;
    if (src) ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  };
  /** The drawing as a picture of exactly w × h px (a browser may make an SVG image at its own size and stretch it). */
  const picture = (w: number, h: number) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      const sized = white.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${h}">`);
      im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
    });
  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colour;
    const h = DOT / 2;
    for (let i = 0; i < n * 2; i += 2) ctx.fillRect(pos[i] - h, pos[i + 1] - h, DOT, DOT);
  };

  /** One step of the reference's physics; returns whether anything is still moving. */
  const step = () => {
    if (pull > 0) pull--;
    const radius = PHYS.radius * k;
    const r2 = radius * radius;
    const force = PHYS.force * k;
    const maxMove = PHYS.maxMove * k;
    let moving = pull > 0;
    for (let i = 0; i < n * 2; i += 2) {
      const x = pos[i];
      const y = pos[i + 1];
      const ox = org[i];
      const oy = org[i + 1];
      let vx = vel[i];
      let vy = vel[i + 1];
      if (pull > 0) {
        const dx = mouse.x - x;
        const dy = mouse.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2 && d2 > 0) {
          // (the reference's -r²/d² along the line from the pointer, without its atan2, cos and sin)
          const f = (-r2 / d2) * force;
          const d = Math.sqrt(d2);
          vx += (f * dx) / d;
          vy += (f * dy) / d;
        }
      }
      vx *= PHYS.damping;
      vy *= PHYS.damping;
      const tx = x + vx + (ox - x) * PHYS.ret;
      const ty = y + vy + (oy - y) * PHYS.ret;
      const offx = tx - ox;
      const offy = ty - oy;
      const off = Math.sqrt(offx * offx + offy * offy);
      if (off > maxMove) {
        const s = maxMove / off;
        pos[i] = ox + offx * s;
        pos[i + 1] = oy + offy * s;
        vx *= 0.7;
        vy *= 0.7;
      } else {
        pos[i] = tx;
        pos[i + 1] = ty;
      }
      vel[i] = vx;
      vel[i + 1] = vy;
      if (!moving && (off > 0.05 || Math.abs(vx) + Math.abs(vy) > 0.01)) moving = true;
    }
    return moving;
  };

  const frame = (now: number) => {
    raf = 0;
    if (!alive) return;
    // (60 a second at most)
    if (now - last < 12) {
      raf = requestAnimationFrame(frame);
      return;
    }
    last = now;
    const moving = step();
    if (!moving) {
      // home: exactly in place, the logo whole again, and the loop stops
      pos.set(org);
      vel.fill(0);
      drawWhole();
      return;
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!raf && n) raf = requestAnimationFrame(frame);
  };

  const near = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const x = clientX - r.left;
    const y = clientY - r.top;
    const reach = PHYS.radius * k;
    // only near the logo: elsewhere on the page the pointer costs it nothing
    if (x < -reach || y < -reach || x > r.width + reach || y > r.height + reach) return;
    mouse.x = x;
    mouse.y = y;
    pull = PHYS.frames;
    wake();
  };
  const onMove = (e: PointerEvent) => near(e.clientX, e.clientY);
  // (on a touch screen the finger is the pointer: where it touches and drags)
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) near(t.clientX, t.clientY);
  };
  // (the finger lifted: the points stop being pushed almost at once and gather back, the logo sharp again
  // in a moment, rather than held in points for the pull's 300 frames)
  const onTouchEnd = () => {
    pull = Math.min(pull, 12);
  };

  const ready = () => {
    if (!alive || !build()) return;
    const w = canvas.width;
    const h = canvas.height;
    picture(w, h).then(
      (im) => {
        if (!alive || canvas.width !== w || canvas.height !== h) return;
        sharp = im;
        host.classList.add('has-dots');
        if (!raf) drawWhole();
      },
      () => undefined,
    );
  };
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    image = img;
    ready();
  };
  // white, whatever the drawing's own colour (the header's logo is in currentColor)
  const white = svg.replace(/currentColor/g, '#fff');
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(white)}`;
  host.append(canvas);
  const ro = new ResizeObserver(() => {
    if (!image) return;
    cancelAnimationFrame(raf);
    raf = 0;
    pull = 0;
    ready();
  });
  ro.observe(host);
  window.addEventListener('pointermove', onMove, { passive: true });
  if (TOUCH) {
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('touchstart', onTouch);
    window.removeEventListener('touchmove', onTouch);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    canvas.remove();
    host.classList.remove('has-dots');
  };
}
