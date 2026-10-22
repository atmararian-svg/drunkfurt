import { onFrameDrawn } from '../render/FrameGrab';

/**
 * The page-to-page transition of DRUNKFURT, after the supplied pixel loader
 * (Framer "ImagePixelLoader"): the incoming page arrives as coarse blocks
 * that grow finer, and in the last part the sharp page fades in over them
 * out of a slight blur.
 *
 * Adapted to a live 3D page: the "image" is the 3D canvas itself, copied
 * after each drawn frame (render/FrameGrab), shrunk to one pixel per block
 * (smoothed, so each block is that area's average colour) and drawn back up
 * without smoothing into an overlay canvas above everything. The sharp page
 * under it is the stage. Before the blocks resolve, they first come in over
 * the page being left (the copy of its last frame, or the preloader), block by
 * block in a scattered order drifting up the page going forward and down it
 * going back, so there is never a cut and never an empty frame between the
 * two pages.
 *
 * Every number of the look is in PIXEL_REVEAL, to be tuned in one place; the
 * reference's values are kept where they apply (28 px blocks to ~1.6, the
 * smooth curve, the sharp fade from 43% with up to 3 px of blur).
 */
export const PIXEL_REVEAL = {
  /** ms of the whole reveal. */
  duration: 1600,
  /** Block size at the start and at the end (CSS px). */
  from: 28,
  to: 1.6,
  /** Fraction of the reveal over which the blocks come in over the outgoing page. */
  cover: 0.26,
  /** How much the scatter drifts with the direction (0: pure scatter, 1: a hard wipe). */
  drift: 0.45,
  /** From this fraction on, the sharp page fades in over the blocks… */
  fadeStart: 0.43,
  /** …out of this much blur (px). */
  blur: 3,
};

export type RevealDirection = 'up' | 'down';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const stage = () => document.querySelector<HTMLElement>('.stage');

let active: { cancel: () => void } | null = null;

/**
 * Plays the reveal of the live stage over whatever is on screen now (the
 * outgoing page lies above the stage: `outgoing`, removed once the blocks
 * cover it; or a layer the caller removes in `onCovered`). Resolves when the
 * stage is sharp and the overlay gone. Only one runs at a time; starting
 * another finishes the one before at once.
 */
export function pixelReveal(dir: RevealDirection, opts: { outgoing?: HTMLElement | null; onCovered?: () => void } = {}): Promise<void> {
  active?.cancel();
  const el = stage();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const covered = () => {
    opts.outgoing?.remove();
    opts.onCovered?.();
  };
  if (!el || reduced) {
    covered();
    return Promise.resolve();
  }
  const P = PIXEL_REVEAL;
  const overlay = document.createElement('canvas');
  overlay.className = 'pixel-reveal';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
  const ctx = overlay.getContext('2d');
  const tiny = document.createElement('canvas');
  const tctx = tiny.getContext('2d');
  // one cell per block of the coarsest grid: which are in yet (alpha), for the cover phase
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  if (!ctx || !tctx || !mctx) {
    overlay.remove();
    covered();
    return Promise.resolve();
  }
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  overlay.width = Math.round(cssW * dpr);
  overlay.height = Math.round(cssH * dpr);
  const cols = Math.max(1, Math.round(cssW / P.from));
  const rows = Math.max(1, Math.round(cssH / P.from));
  mask.width = cols;
  mask.height = rows;
  // each cell's moment within the cover phase: scattered, drifting along the direction
  const at = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const along = dir === 'up' ? 1 - (y + 0.5) / rows : (y + 0.5) / rows;
      at[y * cols + x] = clamp((1 - P.drift) * hash(x + 1, y + 7) + P.drift * along, 0, 0.999);
    }
  const cells = mctx.createImageData(cols, rows);

  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    let isCovered = false;
    let finished = false;
    let raf = 0;
    const raw = (now = performance.now()) => clamp((now - t0) / P.duration, 0, 1);
    /** The live page, pixelated at this moment's block size, drawn into the overlay. */
    const draw = (src: HTMLCanvasElement) => {
      const r = raw();
      const block = P.from + (P.to - P.from) * smooth(r);
      const tw = Math.max(1, Math.round(cssW / block));
      const th = Math.max(1, Math.round(cssH / block));
      if (tiny.width !== tw || tiny.height !== th) {
        tiny.width = tw;
        tiny.height = th;
      }
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, tw, th);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, tw, th, 0, 0, overlay.width, overlay.height);
      if (!isCovered) {
        // only the cells that are in: the rest of the overlay stays clear, the outgoing page shows there
        const k = r / P.cover;
        for (let i = 0; i < at.length; i++) cells.data[i * 4 + 3] = at[i] < k ? 255 : 0;
        mctx.putImageData(cells, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0, cols, rows, 0, 0, overlay.width, overlay.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    const stopWatching = onFrameDrawn(draw);
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      stopWatching();
      if (!isCovered) covered();
      overlay.remove();
      el.style.filter = '';
      if (active === handle) active = null;
      resolve();
    };
    const handle = { cancel: finish };
    active = handle;
    // the clock: what does not depend on a frame being drawn (the cover, the sharp page's fade) runs here
    const tick = (now: number) => {
      const r = raw(now);
      if (!isCovered && r >= P.cover) {
        isCovered = true;
        covered();
      }
      const sharp = clamp((r - P.fadeStart) / (1 - P.fadeStart), 0, 1);
      // the sharp page is under the overlay, so its fade in is the overlay's fade out
      overlay.style.opacity = String(1 - sharp);
      el.style.filter = sharp > 0 && sharp < 1 ? `blur(${(P.blur * (1 - sharp)).toFixed(2)}px)` : '';
      if (r >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // whatever the frames do, the page is never left behind the overlay
    window.setTimeout(finish, P.duration + 1500);
  });
}
