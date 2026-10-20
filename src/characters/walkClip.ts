import { Object3D, Quaternion, Vector3 } from 'three';
import data from './walkCycle.json';
import type { Joints } from './figure';

/**
 * The walk, from motion capture: one cycle of a captured walk (the supplied
 * "Mr Man Walking" Mixamo clip), baked by tools/bakewalk.mjs into a form that
 * does not depend on the rig it came from:
 *
 *  - pelvis, chest and head as rotations away from standing upright;
 *  - every limb segment (thigh, shin, foot, upper arm, forearm, hand) as a
 *    direction in character space (facing +z, -x side = "L");
 *  - hip sway and which foot carries weight.
 *
 * Any of our skeletons (the drawn people, the stranger's fitted rig) is posed
 * by turning each joint so its own segment points the captured way, so limb
 * lengths and rest poses never need to match the source. Phase 0 is the -x
 * foot's heel strike; the phase advances by distance walked (crowd.ts).
 */
type V3 = [number, number, number];
type Q4 = [number, number, number, number];
interface Side { thigh: V3; shin: V3; foot: Q4; upper: V3; fore: V3; hand: V3; stance: number }
interface Frame { hips: Q4; chest: Q4; head: Q4; hx: number; hy: number; L: Side; R: Side }
const clip = data as unknown as { duration: number; speed: number; stride: number; leg: number; frames: Frame[] };
const N = clip.frames.length;

/** The captured walk's own pace (m/s) and the distance it covers per cycle (two steps). */
export const WALK = { speed: clip.speed, stride: clip.stride, leg: clip.leg };

/** Share of the cycle each foot is down, as phase windows [start, end) in radians (may wrap). */
function window(side: 'L' | 'R') {
  const s = clip.frames.map((f) => f[side].stance);
  let start = s.findIndex((v, i) => v === 1 && s[(i - 1 + N) % N] === 0);
  if (start < 0) start = 0;
  let len = 0;
  while (len < N && s[(start + len) % N] === 1) len++;
  return { start: (start / N) * Math.PI * 2, length: (len / N) * Math.PI * 2 };
}
export const STANCE_WINDOW = { L: window('L'), R: window('R') };
/** Phase at which the left (-x) foot is in the middle of its stance: where a walk starts from standing. */
export const START_PHASE = STANCE_WINDOW.L.start + STANCE_WINDOW.L.length / 2;

/** Where in its stance a foot is (0 touch-down … 1 lift-off), or -1 while it swings. */
export function stanceProgress(phase: number, side: 'L' | 'R') {
  const w = STANCE_WINDOW[side];
  const TAU = Math.PI * 2;
  const d = (((phase - w.start) % TAU) + TAU) % TAU;
  return d < w.length ? d / w.length : -1;
}

/**
 * Stride for a walking speed. Slower walkers take shorter steps rather than
 * the captured long ones at a slower beat: the amplitude of the cycle scales
 * with pace (down to 55%), and so does the distance per cycle.
 */
export const strideAmplitude = (speed: number) => Math.min(1, Math.max(0.55, speed / WALK.speed));
export const strideFor = (speed: number, leg = WALK.leg) => WALK.stride * strideAmplitude(speed) * (leg / WALK.leg);

// ---------------------------------------------------------------------------

const QA = new Quaternion();
const QB = new Quaternion();
const QP = new Quaternion();
const QW = new Quaternion();
const QR = new Quaternion();
const D = new Vector3();
const R = new Vector3();
const C = new Vector3();
const DOWN = new Vector3(0, -1, 0);

function frameAt(phase: number) {
  const u = ((((phase / (Math.PI * 2)) % 1) + 1) % 1) * N;
  const i = Math.floor(u) % N;
  return { a: clip.frames[i], b: clip.frames[(i + 1) % N], t: u - Math.floor(u) };
}
const lerp3 = (a: V3, b: V3, t: number, out: Vector3) => out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t).normalize();
const slerpQ = (a: Q4, b: Q4, t: number, out: Quaternion) => out.fromArray(a).slerp(QB.fromArray(b), t);

/** Turns joint `j` (blend `w`) so that its segment, `rest` in its own frame, points along `dirWorld`. */
function aim(j: Object3D, rest: Vector3, dirWorld: Vector3, w: number) {
  j.parent!.updateWorldMatrix(true, false);
  j.parent!.getWorldQuaternion(QP);
  QW.copy(QP).multiply(j.quaternion);
  C.copy(rest).applyQuaternion(QW).normalize();
  QR.setFromUnitVectors(C, dirWorld).multiply(QW);
  QA.copy(QP).invert().multiply(QR);
  j.quaternion.slerp(QA, w);
  j.updateMatrixWorld(true);
}

export interface WalkSample {
  stanceL: number;
  stanceR: number;
}

/**
 * Poses a skeleton in the captured walk at `phase`, blended by `amount` over
 * whatever pose it already has (an idle stance, a planted stance). `amount`
 * below 1 also shortens the steps (see strideAmplitude). Call after the base
 * pose is applied; the hips are re-grounded on the lower foot. `holdR` leaves
 * the right arm as it is (holding something). Returns which feet carry
 * weight, for feet.ts.
 */
export function applyWalk(j: Joints, phase: number, amount: number, opts: { holdR?: boolean; keepHead?: boolean } = {}): WalkSample {
  const { a, b, t } = frameAt(phase);
  const w = Math.max(0, Math.min(1, amount));
  j.root.updateMatrixWorld(true);
  // the character's frame: where "forward" and "up" are for this person
  const body = j.body.getWorldQuaternion(new Quaternion());
  const toWorld = (v: Vector3) => v.applyQuaternion(body);
  // pelvis, chest, head: rotations away from upright, in character space
  const hipsQ = slerpQ(a.hips, b.hips, t, new Quaternion());
  const chestQ = slerpQ(a.chest, b.chest, t, new Quaternion());
  const headQ = slerpQ(a.head, b.head, t, new Quaternion());
  // a captured rotation away from upright, in character space, becomes the joint's world orientation
  // (our joints stand upright, unrotated, in their rest pose)
  const setWorld = (j0: Object3D, qChar: Quaternion) => {
    j0.parent!.updateWorldMatrix(true, false);
    j0.parent!.getWorldQuaternion(QP);
    QA.copy(QP).invert().multiply(QW.copy(body).multiply(qChar));
    j0.quaternion.slerp(QA, w);
    j0.updateMatrixWorld(true);
  };
  setWorld(j.hips, hipsQ);
  setWorld(j.spine, chestQ);
  if (!opts.keepHead) setWorld(j.head, headQ);
  // hip sway (the capture's, scaled to this person's legs)
  const s = j.body.scale.y;
  const legs = (j.kneeL.position.length() + j.ankleL.position.length()) * s;
  const k = legs / WALK.leg;
  j.hips.position.x += ((a.hx + (b.hx - a.hx) * t) * k * w) / s;
  j.hips.updateMatrixWorld(true);
  // limbs: parents first, each segment along its captured direction
  const limb = (side: 'L' | 'R') => {
    const A = a[side];
    const Bf = b[side];
    const hip = side === 'L' ? j.hipL : j.hipR;
    const knee = side === 'L' ? j.kneeL : j.kneeR;
    const ankle = side === 'L' ? j.ankleL : j.ankleR;
    const sh = side === 'L' ? j.shL : j.shR;
    const el = side === 'L' ? j.elL : j.elR;
    const wr = side === 'L' ? j.wrL : j.wrR;
    aim(hip, R.copy(knee.position).normalize(), toWorld(lerp3(A.thigh, Bf.thigh, t, D)), w);
    aim(knee, R.copy(ankle.position).normalize(), toWorld(lerp3(A.shin, Bf.shin, t, D)), w);
    setWorld(ankle, slerpQ(A.foot, Bf.foot, t, new Quaternion()));
    // an arm that holds something (a suitcase handle) keeps its own pose
    if (side === 'R' && opts.holdR) return;
    aim(sh, R.copy(el.position).normalize(), toWorld(lerp3(A.upper, Bf.upper, t, D)), w);
    aim(el, R.copy(wr.position).normalize(), toWorld(lerp3(A.fore, Bf.fore, t, D)), w);
    aim(wr, DOWN, toWorld(lerp3(A.hand, Bf.hand, t, D)), w * 0.6);
  };
  limb('L');
  limb('R');
  // stand on the lower foot
  const yL = j.ankleL.getWorldPosition(new Vector3()).y;
  const yR = j.ankleR.getWorldPosition(new Vector3()).y;
  const floor = j.root.getWorldPosition(new Vector3()).y + j.ankleHeight * s;
  j.hips.position.y += (floor - Math.min(yL, yR)) / s;
  j.root.updateMatrixWorld(true);
  const st = (side: 'L' | 'R') => (t < 0.5 ? a[side].stance : b[side].stance);
  return { stanceL: w > 0.05 ? st('L') : 1, stanceR: w > 0.05 ? st('R') : 1 };
}

/**
 * Measures how the captured walk lands on a particular skeleton: where each
 * foot is (relative to the body, facing +z) just after it touches down, and
 * how far the body must travel per cycle for a planted foot to stay put. For a
 * walk that is a pure function of position (the stranger's), these make the
 * pinned feet agree with the walk instead of being dragged onto a guess.
 * Leaves the skeleton posed; pose it again afterwards.
 */
/** Where in its stance a foot counts as down (pinned from here). */
export const TOUCH = 0.04;

export function calibrateWalk(j: Joints) {
  const pos = j.root.position.clone();
  const yaw = j.root.rotation.y;
  j.root.position.set(0, 0, 0);
  j.root.rotation.set(0, 0, 0);
  const at = (phase: number, side: 'L' | 'R') => {
    // from the rig's rest place each time (applyWalk adds the sway to wherever the hips are)
    j.hips.position.set(j.hipsRest.x, j.hips.position.y, j.hipsRest.z);
    applyWalk(j, phase, 1);
    j.root.updateMatrixWorld(true);
    return (side === 'L' ? j.ankleL : j.ankleR).getWorldPosition(new Vector3());
  };
  const foot = { L: new Vector3(), R: new Vector3() };
  let stride = 0;
  for (const side of ['L', 'R'] as const) {
    const w = STANCE_WINDOW[side];
    // just after touch-down: where the foot is pinned from
    foot[side].copy(at(w.start + w.length * TOUCH, side));
    // the planted foot moves back past the hips as fast as the body must move forward
    const a = at(w.start + w.length * 0.3, side);
    const b = at(w.start + w.length * 0.7, side);
    stride += ((a.z - b.z) / (w.length * 0.4)) * Math.PI * 2 * 0.5;
  }
  j.root.position.copy(pos);
  j.root.rotation.y = yaw;
  j.root.updateMatrixWorld(true);
  return { stride, foot };
}
