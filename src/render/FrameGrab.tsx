import { useFrame, useThree } from '@react-three/fiber';

/**
 * A copy of the frame on screen, for the chapter transition (the outgoing
 * page it slides away). Asked for with `grabFrame()`; the copy is made at the
 * end of the next frame, after the composer has drawn it (priority 2), while
 * the canvas still holds the picture, so the renderer does not need to keep
 * its drawing buffer.
 */
let pending: ((c: HTMLCanvasElement) => void) | null = null;
/** Called after every drawn frame with the canvas, while it still holds the picture (see `onFrameDrawn`). */
const watchers = new Set<(src: HTMLCanvasElement) => void>();

export function grabFrame(): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    pending = resolve;
  });
}

/**
 * Watches the frames as they are drawn: `draw` gets the 3D canvas at the end
 * of each frame, when it can be copied (the pixel reveal draws from it).
 * Returns the function that stops watching.
 */
export function onFrameDrawn(draw: (src: HTMLCanvasElement) => void) {
  watchers.add(draw);
  return () => void watchers.delete(draw);
}

export function FrameGrab() {
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    watchers.forEach((w) => {
      try {
        w(gl.domElement);
      } catch (err) {
        console.warn('[frame]', err);
      }
    });
    if (!pending) return;
    const done = pending;
    pending = null;
    const src = gl.domElement;
    const copy = document.createElement('canvas');
    copy.width = src.width;
    copy.height = src.height;
    try {
      copy.getContext('2d')!.drawImage(src, 0, 0);
    } catch {
      // nothing to copy (a lost context): the transition slides a blank page away instead
    }
    done(copy);
  }, 2);
  return null;
}
