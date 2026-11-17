import { clamp } from '../../core/math';
import { BEAT } from './beats';
import { ATTACKER_START } from './layout';

/** Where he stops: square in front of you, a little over an arm's length away. */
export const STRANGER_STOP: [number, number] = [6.55, -35.25];

/** The stranger's way from the doorway to you, along the right sidewalk (validated in tests). */
export const STRANGER_ROUTE: [number, number][] = [ATTACKER_START, [7.7, -49.5], [6.85, -40.5], STRANGER_STOP];

const segLen = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const LENS = STRANGER_ROUTE.slice(1).map((p, i) => segLen(STRANGER_ROUTE[i], p));
export const ROUTE_LEN = LENS.reduce((a, b) => a + b, 0);

export function routeAt(s: number) {
  let i = 0;
  while (i < LENS.length - 1 && s > LENS[i]) s -= LENS[i++];
  const a = STRANGER_ROUTE[i];
  const b = STRANGER_ROUTE[i + 1];
  const u = clamp(s / LENS[i], 0, 1);
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);

/**
 * Distance along his route at walk progress u (0..1), as a share of it: a walking pace, even (it peaked
 * at its very start before, at 1.8 × the average, and he set off at a run), picked up over the first
 * 15 % and slowed to a stop in front of you over the last 25 %.
 */
const PACE_TABLE = (() => {
  const n = 400;
  const v = (u: number) => Math.max(0, Math.min(1, u / 0.15, (1 - u) / 0.25));
  const t = [0];
  for (let i = 1; i <= n; i++) t.push(t[i - 1] + (v((i - 0.5) / n) * 1) / n);
  const total = t[n];
  return t.map((x) => x / total);
})();
const routeEase = (u: number) => {
  const x = clamp(u, 0, 1) * (PACE_TABLE.length - 1);
  const i = Math.min(PACE_TABLE.length - 2, Math.floor(x));
  return PACE_TABLE[i] + (PACE_TABLE[i + 1] - PACE_TABLE[i]) * (x - i);
};
export const routeS = (u: number) => routeEase(clamp(u, 0, 1)) * ROUTE_LEN;
const PEAK_RATE = Math.max(...Array.from({ length: 200 }, (_, i) => routeEase((i + 1) / 200) - routeEase(i / 200))) * 200;
/** How much he is walking (0 standing … 1 full pace), from how fast the route moves him at u. */
export function walkPace(u: number) {
  if (u <= 0 || u >= 1) return 0;
  const rate = (routeEase(Math.min(1, u + 0.005)) - routeEase(Math.max(0, u - 0.005))) / 0.01;
  return clamp(Math.sqrt(rate / PEAK_RATE) * 1.3, 0, 1);
}

/** His place on the ground at a local progress, before any lunge (for the camera to track). */
export const strangerGroundAt = (local: number) => routeAt(routeS(ramp(local, BEAT.strangerMoves, BEAT.stop)));
