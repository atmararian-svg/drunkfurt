/**
 * Pointer input, kept outside React. Only used for the subtle look-around:
 * the story itself is driven by scrolling.
 */
const pointer = { x: 0, y: 0, active: false };
let attached = 0;

const onMove = (e: PointerEvent) => {
  if (e.pointerType === 'touch') return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  pointer.active = true;
};
const onLeave = () => {
  pointer.active = false;
};

export const input = {
  attach() {
    if (attached++ > 0) return;
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
  },
  detach() {
    if (--attached > 0) return;
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
  },
  pointer,
};

/**
 * On a phone, the tilt is the pointer: tipping it left and right, up and down, turns the look as moving
 * the mouse does. The way it is held when it is first read is the middle; that middle follows slowly,
 * so holding it differently for a while does not leave the look turned. iOS asks for permission, which
 * can only be asked from a tap (`requestTilt` from a tap's handler).
 */
const TILT_RANGE = 18;
let tiltOn = false;
let base: { b: number; g: number } | null = null;
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const onTilt = (e: DeviceOrientationEvent) => {
  if (e.beta === null || e.gamma === null) return;
  // in landscape the phone's axes swap round
  const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
  let b = e.beta;
  let g = e.gamma;
  if (angle === 90) [b, g] = [-g, b];
  else if (angle === -90 || angle === 270) [b, g] = [g, -b];
  if (!base) base = { b, g };
  base.b += (b - base.b) * 0.004;
  base.g += (g - base.g) * 0.004;
  pointer.x = clamp1((g - base.g) / TILT_RANGE);
  pointer.y = clamp1((b - base.b) / TILT_RANGE);
  pointer.active = true;
};

function startTilt() {
  if (tiltOn) return;
  tiltOn = true;
  window.addEventListener('deviceorientation', onTilt);
}

/** Starts the tilt where no permission is asked (Android); true if it could. */
export function tryTilt() {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D) return false;
  if (typeof D.requestPermission === 'function') return false;
  startTilt();
  return true;
}

/** From a tap: asks for the tilt where it must be asked (iOS), then starts it. */
export function requestTilt() {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!D || tiltOn) return;
  if (typeof D.requestPermission !== 'function') return startTilt();
  D.requestPermission()
    .then((r) => r === 'granted' && startTilt())
    .catch(() => undefined);
}
