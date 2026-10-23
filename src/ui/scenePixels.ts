import { onFrameDrawn } from '../render/FrameGrab';
import { drawPixelated } from './pixelReveal';

/**
 * The fight's coarse pixels: the scene-transition effect (pixelReveal.ts),
 * reused at a steady block size instead of a reveal. One canvas over the
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

const draw = (src: HTMLCanvasElement) => {
  if (!canvas || !ctx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  drawPixelated(ctx, tiny, src, block, w, h);
};

export function setScenePixels(next: number) {
  block = next;
  if (next <= 1.02) {
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
