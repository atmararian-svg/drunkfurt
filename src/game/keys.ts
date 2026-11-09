import { GAME } from './mode';
import { look, walk } from './walk';

/**
 * The game's keyboard and mouse: which movement keys are down (W A S D and the arrows; ← → turn
 * when the mouse is not held), Shift to hurry, and the mouse's moves while the page holds the
 * pointer (a click on the page, or a step, asks for it; Escape lets it go, as the browser does).
 */
export const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  turnLeft: false,
  turnRight: false,
  run: false,
  any() {
    return this.forward || this.back || this.left || this.right || this.turnLeft || this.turnRight;
  },
};

const MAP: Record<string, keyof typeof keys> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
  ShiftLeft: 'run',
  ShiftRight: 'run',
};

/** The pointer is held by the page (the mouse turns the look). */
export const pointerHeld = () => document.pointerLockElement != null;

/** Asks for the pointer (from a click or a key: the browser needs one); not while something wants the cursor. */
export function holdPointer() {
  if (!GAME || pointerHeld()) return;
  const html = document.documentElement.classList;
  if (html.contains('is-reading') || html.contains('is-preloading') || html.contains('game-cursor')) return;
  try {
    const r = document.body.requestPointerLock?.() as unknown as Promise<void> | undefined;
    r?.catch?.(() => undefined);
  } catch {
    // (refused: the arrows still turn)
  }
}
export function releasePointer() {
  if (pointerHeld()) document.exitPointerLock();
}

export function mountGameKeys() {
  if (!GAME) return () => undefined;
  const down = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = MAP[e.code];
    if (!k) return;
    (keys as unknown as Record<string, boolean>)[k] = true;
    // (the arrows and the space bar never scroll the page here)
    if (e.code.startsWith('Arrow')) e.preventDefault();
    // (a step at all starts the story: a press shorter than a frame is not lost)
    if (k !== 'run') {
      walk.moved = true;
      holdPointer();
    }
  };
  const up = (e: KeyboardEvent) => {
    const k = MAP[e.code];
    if (k) (keys as unknown as Record<string, boolean>)[k] = false;
  };
  const clear = () => {
    for (const k of Object.values(MAP)) (keys as unknown as Record<string, boolean>)[k] = false;
  };
  const move = (e: MouseEvent) => {
    if (pointerHeld()) look(e.movementX, e.movementY);
  };
  const lockChange = () => document.documentElement.classList.toggle('pointer-held', pointerHeld());
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', clear);
  window.addEventListener('mousemove', move);
  document.addEventListener('pointerlockchange', lockChange);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', clear);
    window.removeEventListener('mousemove', move);
    document.removeEventListener('pointerlockchange', lockChange);
  };
}
