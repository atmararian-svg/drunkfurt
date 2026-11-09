import { onFrameDrawn } from '../render/FrameGrab';
import { drawPixelated } from './pixelReveal';

/**
 * The fight's coarse pixels: the scene-transition effect (pixelReveal.ts),
 * reused at a steady block size instead of a reveal; once you defend, the
 * same layer also blurs (the blocks drawn up smoothed) and darkens, which is
 * what hides the fight. One canvas over the
 * stage, under the page's printed matter; after every drawn frame the 3D
 * canvas is shrunk to one pixel per block and drawn back up, unsmoothed.
 *
 * `setScenePixels(block)` is called every frame by the overlay with a block
 * size that is a pure function of the scroll progress (overlay `combatPixels`),
 * so there is nothing to get stuck: at 1 (or below) the canvas is removed and
 * the frame watcher stopped; above it they are (re)made. No second shader pass,
 * no timers.
 */
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let stopWatching: (() => void) | null = null;
const tiny = document.createElement('canvas');
let block = 1;
/** Below this block size (px) the layer fades out over the picture instead of its blocks shrinking further. */
const FADE_BELOW = 4;
let soft = 0;
let dark = 0;

const draw = (src: HTMLCanvasElement) => {
  if (!canvas || !ctx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  // (the last of it is a fade, not blocks shrinking to one pixel: near 1 they shimmer, and then the
  // layer going would be a visible cut back to the picture)
  drawPixelated(ctx, tiny, src, Math.max(block, FADE_BELOW), w, h, soft);
  canvas.style.opacity = block >= FADE_BELOW ? '1' : Math.max(0, (block - 1) / (FADE_BELOW - 1)).toFixed(3);
  if (dark > 0.005) {
    ctx.fillStyle = `rgba(5, 5, 6, ${Math.min(1, dark).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
};

/** `next`: block size (CSS px); `blur` 0 … 1: the blocks smoothed over (a blur); `shade` 0 … 1: a dark layer over it. */
export function setScenePixels(next: number, blur = 0, shade = 0) {
  block = next;
  soft = blur;
  dark = shade;
  if (next <= 1.02 && blur <= 0.01 && shade <= 0.005) {
    stopWatching?.();
    stopWatching = null;
    canvas?.remove();
    canvas = null;
    ctx = null;
    return;
  }
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'scene-pixels';
  canvas.setAttribute('aria-hidden', 'true');
  ctx = canvas.getContext('2d');
  // right after the stage, so it lies over the 3D picture and under everything printed on it
  const stage = document.querySelector('.stage');
  if (stage) stage.after(canvas);
  else document.body.appendChild(canvas);
  stopWatching = onFrameDrawn(draw);
}
