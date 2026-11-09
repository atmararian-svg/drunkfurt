import clip from './fightClip.json';
import { STRANGER_STOP } from './strangerRoute';

/**
 * The fight you see once you defend: the supplied two-man "rapid punching" animation, baked onto
 * the walking man's skeleton for both of you (tools/bakeFight.mjs → fightClip.json). You throw a
 * flurry while he covers up, then an uppercut throws him onto his back.
 *
 * Each man's frames are in his own frame of reference: his hips start over its origin and he faces
 * +z, the other man `clip.gap` metres ahead. He stays where he stopped (STRANGER_STOP), and you
 * stand `gap` metres back along the line from him to where your eyes were.
 */
export type Fighter = 'puncher' | 'guard';

export const FIGHT_BONES: readonly string[] = clip.bones;
/** Length of the clip (s). */
export const CLIP_LEN = (clip.frames - 1) / clip.fps;

/**
 * Moments of the clip (s): every blow of the flurry that lands, the uppercut, and when he hits
 * the pavement (read off the source: the fist's closest pass to his head, chest or guard).
 */
export const CLIP = {
  flurry: [0.7, 0.9, 1.1, 1.27, 1.43, 1.57, 1.8, 2.0, 2.1, 2.3, 2.4],
  uppercut: 3.0,
  land: 3.82,
} as const;

/**
 * Only the last two blows of the sequence are played: the clip starts a moment before the
 * second-to-last blow, and the swing from it into the uppercut is quickened so the two land
 * as far apart as the two recorded exhales (0.28 s); after the uppercut it runs at its own pace.
 */
export const CLIP_FROM = 2.15;
/** The two blows (clip time), and how far apart they land in the fight (s). */
const BLOW_A = 2.4;
const BLOW_B = CLIP.uppercut;
export const BLOW_GAP = 0.28;
/** Fight time (s from the clip's start in the fight) → clip time. */
export function clipAt(ft: number) {
  const a = BLOW_A - CLIP_FROM;
  if (ft <= a) return CLIP_FROM + Math.max(0, ft);
  if (ft <= a + BLOW_GAP) return BLOW_A + ((ft - a) / BLOW_GAP) * (BLOW_B - BLOW_A);
  return Math.min(CLIP_LEN, BLOW_B + (ft - a - BLOW_GAP));
}
/** Clip time → fight time (for timing things to the clip's moments). */
export function fightAt(clipT: number) {
  const a = BLOW_A - CLIP_FROM;
  if (clipT <= BLOW_A) return clipT - CLIP_FROM;
  if (clipT <= BLOW_B) return a + ((clipT - BLOW_A) / (BLOW_B - BLOW_A)) * BLOW_GAP;
  return a + BLOW_GAP + (clipT - BLOW_B);
}

/** Your eyes before the fight (layout.VISITOR_STOP at EYE): the line from them to him sets where you stand. */
const EYES: [number, number] = [6.5, -34];
const dx = STRANGER_STOP[0] - EYES[0];
const dz = STRANGER_STOP[1] - EYES[1];
const len = Math.hypot(dx, dz);
/** Unit vector from you to him (ground plane). */
export const FIGHT_DIR = { x: dx / len, z: dz / len };
/** Where each man's frame sits on the street and which way it faces. */
export const FIGHT_FRAME = {
  puncher: { x: STRANGER_STOP[0] - FIGHT_DIR.x * clip.gap, z: STRANGER_STOP[1] - FIGHT_DIR.z * clip.gap, yaw: Math.atan2(FIGHT_DIR.x, FIGHT_DIR.z) },
  guard: { x: STRANGER_STOP[0], z: STRANGER_STOP[1], yaw: Math.atan2(-FIGHT_DIR.x, -FIGHT_DIR.z) },
};

const rows: Record<Fighter, number[][]> = { puncher: clip.puncher, guard: clip.guard };
const out: Record<Fighter, Float32Array> = {
  puncher: new Float32Array(clip.puncher[0].length),
  guard: new Float32Array(clip.guard[0].length),
};

/** One man's frame at clip time `t` (s), between the baked frames (rotations normalised by the rig). */
export function fightRow(who: Fighter, t: number): Float32Array {
  const r = rows[who];
  const f = Math.min(r.length - 1, Math.max(0, t * clip.fps));
  const i = Math.min(r.length - 2, Math.floor(f));
  const u = f - i;
  const a = r[i];
  const b = r[i + 1];
  const o = out[who];
  o[0] = a[0] + (b[0] - a[0]) * u;
  o[1] = a[1] + (b[1] - a[1]) * u;
  o[2] = a[2] + (b[2] - a[2]) * u;
  for (let q = 3; q < a.length; q += 4) {
    // shortest way round: flip the second rotation if the two are on opposite sides
    const s = a[q] * b[q] + a[q + 1] * b[q + 1] + a[q + 2] * b[q + 2] + a[q + 3] * b[q + 3] < 0 ? -1 : 1;
    for (let c = 0; c < 4; c++) o[q + c] = a[q + c] + (s * b[q + c] - a[q + c]) * u;
  }
  return o;
}
