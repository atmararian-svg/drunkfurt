/**
 * Raw input, kept outside React. The rig polls it every frame.
 */
const keys = new Set<string>();
let lookDX = 0;
let lookDY = 0;
/** Pointer position in -1..1, used for the pre-step-out parallax. */
const pointer = { x: 0, y: 0 };
let locked = false;
let attached = 0;

const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
const onBlur = () => keys.clear();
const onMouseMove = (e: MouseEvent) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  // Pointer lock is the primary mode; holding the button and dragging is the
  // fallback for browsers or embeds that refuse the lock.
  if (locked || e.buttons & 1) {
    // Ignore the occasional huge spike some browsers emit right after locking.
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    lookDX += e.movementX;
    lookDY += e.movementY;
  }
};
const lockListeners = new Set<(locked: boolean) => void>();
const onLockChange = () => {
  locked = document.pointerLockElement != null;
  lockListeners.forEach((l) => l(locked));
};

export const input = {
  attach() {
    if (attached++ > 0) return;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
  },
  detach() {
    if (--attached > 0) return;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onLockChange);
  },
  isDown: (...codes: string[]) => codes.some((c) => keys.has(c)),
  consumeLook() {
    const d = { x: lookDX, y: lookDY };
    lookDX = 0;
    lookDY = 0;
    return d;
  },
  /** Feed synthetic look deltas (pixels), e.g. for automated inspection. */
  injectLook(dx: number, dy: number) {
    lookDX += dx;
    lookDY += dy;
  },
  pointer,
  get locked() {
    return locked;
  },
  requestLock(el: HTMLElement) {
    if (document.pointerLockElement === el) return;
    try {
      // unadjustedMovement avoids OS acceleration where supported; fall back otherwise.
      const p = (el.requestPointerLock as (o?: unknown) => Promise<void> | void).call(el, {
        unadjustedMovement: true,
      });
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => el.requestPointerLock());
      }
    } catch {
      el.requestPointerLock();
    }
  },
  onLockChange(l: (locked: boolean) => void) {
    lockListeners.add(l);
    return () => {
      lockListeners.delete(l);
    };
  },
};
