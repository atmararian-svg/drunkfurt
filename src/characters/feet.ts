import { Object3D, Quaternion, Vector3 } from 'three';
import type { Joints } from './figure';
import type { Pose } from './pose';

/**
 * Foot contact. The gait (pose.ts) moves the legs by joint angles; on its own
 * that lets a foot drift whenever the body does something the cycle did not
 * plan for: speeding up, slowing down, stopping, turning on the spot. Here a
 * foot that carries weight is pinned where it touched down: its ankle stays on
 * that spot and the leg is solved to reach it (two-bone IK, knee towards the
 * front). When the foot lifts, it is released and blends back to the swing
 * the gait gives it. A foot is only pinned once it is actually down, so it
 * never freezes in the air.
 */
export interface FootLock {
  planted: boolean;
  /** Ankle position (world) and foot heading while pinned. */
  anchor: Vector3;
  yaw: number;
  /** 1 pinned … 0 free; eases off over a tenth of a second at lift-off. */
  w: number;
  /** The foot has swung since it was last pinned (it may touch down again). */
  swung: boolean;
}
export interface Footing {
  L: FootLock;
  R: FootLock;
}

export const createFooting = (): Footing => ({
  L: { planted: false, anchor: new Vector3(), yaw: 0, w: 0, swung: true },
  R: { planted: false, anchor: new Vector3(), yaw: 0, w: 0, swung: true },
});

const A = new Vector3();
const B = new Vector3();
const C = new Vector3();
const T = new Vector3();
const U = new Vector3();
const W = new Vector3();
const B1 = new Vector3();
const D0 = new Vector3();
const D1 = new Vector3();
const F = new Vector3();
const Q = new Quaternion();
const QP = new Quaternion();
const QW = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** Rotates a joint (in world terms) by q, keeping its children attached. */
function turnWorld(j: Object3D, q: Quaternion) {
  j.getWorldQuaternion(QW);
  j.parent!.getWorldQuaternion(QP);
  j.quaternion.copy(QP.invert().multiply(q.multiply(QW)));
  j.updateMatrixWorld(true);
}

function setWorldQuaternion(j: Object3D, q: Quaternion) {
  j.parent!.getWorldQuaternion(QP);
  j.quaternion.copy(QP.invert().multiply(q));
  j.updateMatrixWorld(true);
}

/**
 * Two-bone IK in world space: places the end joint `c` (child of `b`, child
 * of `a`) at `target`, bending `b` towards `pole`. The bones keep their
 * lengths; an unreachable target is approached as far as the limb allows.
 */
export function twoBone(a: Object3D, b: Object3D, c: Object3D, target: Vector3, pole: Vector3) {
  a.getWorldPosition(A);
  b.getWorldPosition(B);
  c.getWorldPosition(C);
  const l1 = A.distanceTo(B);
  const l2 = B.distanceTo(C);
  U.subVectors(target, A);
  const d = Math.min(Math.max(U.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  U.normalize();
  W.copy(pole).addScaledVector(U, -pole.dot(U));
  if (W.lengthSq() < 1e-8) W.set(0, 0, 1).addScaledVector(U, -U.z);
  W.normalize();
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  B1.copy(A).addScaledVector(U, cosA * l1).addScaledVector(W, Math.sqrt(1 - cosA * cosA) * l1);
  // upper bone onto its solved direction, then the lower bone onto the target
  turnWorld(a, Q.setFromUnitVectors(D0.subVectors(B, A).normalize(), D1.subVectors(B1, A).normalize()));
  b.getWorldPosition(B);
  c.getWorldPosition(C);
  T.copy(A).addScaledVector(U, d);
  turnWorld(b, Q.setFromUnitVectors(D0.subVectors(C, B).normalize(), D1.subVectors(T, B).normalize()));
}

/** Heading of a foot (world), from the ankle's forward axis. */
function footYaw(ankle: Object3D) {
  ankle.getWorldQuaternion(QW);
  F.set(0, 0, 1).applyQuaternion(QW);
  return Math.atan2(F.x, F.z);
}

/**
 * Pins the weight-bearing feet. Call after the pose is applied and the root is
 * placed. `groundY` is the floor under the person, `dt` the frame time.
 */
export function plantFeet(j: Joints, p: Pose, f: Footing, dt: number, groundY = 0) {
  j.root.updateMatrixWorld(true);
  const s = j.body.scale.y;
  const ankleY = groundY + j.ankleHeight * s;
  const legs = [
    { lock: f.L, hip: j.hipL, knee: j.kneeL, ankle: j.ankleL, stance: p.stanceL, side: -1 },
    { lock: f.R, hip: j.hipR, knee: j.kneeR, ankle: j.ankleR, stance: p.stanceR, side: 1 },
  ];
  // 1. touch-down and lift-off
  for (const L of legs) {
    const lock = L.lock;
    const stance = p.seat === 0 && L.stance > 0.5;
    L.ankle.getWorldPosition(C);
    if (!stance) lock.swung = true;
    // touch-down: pin it once the ankle is (nearly) at standing height, once per step
    if (stance && !lock.planted && lock.swung && C.y <= ankleY + 0.012) {
      lock.planted = true;
      lock.swung = false;
      lock.anchor.copy(C);
      lock.yaw = footYaw(L.ankle);
      lock.w = 1;
    }
    // lift-off, or the body has gone too far from the foot to keep it there
    if (lock.planted && (!stance || lock.anchor.distanceTo(C) > 0.45)) lock.planted = false;
    if (!lock.planted) lock.w = Math.max(0, lock.w - dt / 0.1);
    // a pinned foot settles onto the floor (it is pinned where it touched, a few millimetres up)
    else lock.anchor.y = Math.max(ankleY, lock.anchor.y - dt * 0.12);
  }
  placeFeet(j, { L: f.L, R: f.R }, groundY);
}

/** Where a foot should be: on `anchor` (world ankle position) with weight `w`, keeping heading `yaw` (or its own). */
export interface FootTarget {
  anchor: Vector3;
  w: number;
  yaw?: number;
}

/**
 * Puts feet on their targets: the pelvis comes down as far as a pinned foot
 * needs to reach the ground, each leg is solved onto its foot (knee forwards),
 * the feet keep their own attitude (flat, heel strike, push-off) and the given
 * heading, and a free foot that the lowered pelvis took below the floor is
 * lifted back onto it. Shared by the crowd (pinned where they touched down)
 * and the stranger (pinned where his route puts them).
 */
export function placeFeet(j: Joints, targets: { L?: FootTarget; R?: FootTarget }, groundY = 0) {
  j.root.updateMatrixWorld(true);
  const s = j.body.scale.y;
  const ankleY = groundY + j.ankleHeight * s;
  const fwd = new Vector3(Math.sin(j.root.rotation.y), 0, Math.cos(j.root.rotation.y));
  const legs = [
    { t: targets.L, hip: j.hipL, knee: j.kneeL, ankle: j.ankleL, side: -1 },
    { t: targets.R, hip: j.hipR, knee: j.kneeR, ankle: j.ankleR, side: 1 },
  ];
  let drop = 0;
  for (const L of legs) {
    if (!L.t || L.t.w <= 0) continue;
    L.ankle.getWorldPosition(C);
    T.copy(C).lerp(L.t.anchor, L.t.w);
    L.hip.getWorldPosition(A);
    L.knee.getWorldPosition(B);
    const reach = (A.distanceTo(B) + B.distanceTo(C)) * 0.995;
    const h = Math.hypot(T.x - A.x, T.z - A.z);
    if (h >= reach) continue;
    drop = Math.max(drop, A.y - T.y - Math.sqrt(reach * reach - h * h));
  }
  if (drop > 0) {
    j.hips.position.y -= Math.min(drop, 0.12) / s;
    j.root.updateMatrixWorld(true);
  }
  for (const L of legs) {
    L.ankle.getWorldPosition(C);
    const pinned = !!L.t && L.t.w > 0;
    if (!pinned && C.y >= ankleY - 0.002) continue;
    const yawFK = footYaw(L.ankle);
    const footQ = L.ankle.getWorldQuaternion(new Quaternion());
    if (pinned) T.copy(C).lerp(L.t!.anchor, L.t!.w);
    else T.set(C.x, ankleY, C.z);
    const pole = new Vector3().copy(fwd).addScaledVector(UP.clone().cross(fwd), L.side < 0 ? 0.15 : -0.15);
    twoBone(L.hip, L.knee, L.ankle, T.clone(), pole);
    let dy = pinned && L.t!.yaw !== undefined ? L.t!.yaw - yawFK : 0;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy)) * (pinned ? L.t!.w : 0);
    setWorldQuaternion(L.ankle, Q.setFromAxisAngle(UP, dy).multiply(footQ));
  }
}
