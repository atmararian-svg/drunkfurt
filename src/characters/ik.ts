import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Joints } from './figure';

const S = new Vector3();
const T = new Vector3();
const U = new Vector3();
const W = new Vector3();
const E = new Vector3();
const A0 = new Vector3();
const B0 = new Vector3();
const C0 = new Vector3();
const A1 = new Vector3();
const B1 = new Vector3();
const C1 = new Vector3();
const F0 = new Vector3();
const D = new Vector3();
const M0 = new Matrix4();
const M1 = new Matrix4();
const Q = new Quaternion();
const QI = new Quaternion();

/** Distance from the wrist joint to the knuckles of a fist. */
export const FIST_REACH = 0.1;

/**
 * Two-bone IK for an arm, so a fist (or hand) lands on a point in the world.
 * Works for any rig: limb lengths and rest directions are read from the joints
 * themselves (straight-down procedural limbs, or a rig fitted to a scanned
 * mesh whose arms hang at an angle). The elbow is placed in the plane given by
 * `pole` (a direction in spine space the elbow should point towards), so the
 * limbs never stretch. Call after the rest of the pose is applied. Returns how
 * close the target was to full extension (1 = arm straight).
 */
export function aimArm(j: Joints, side: -1 | 1, targetWorld: Vector3, pole: Vector3) {
  const sh = side < 0 ? j.shL : j.shR;
  const el = side < 0 ? j.elL : j.elR;
  const wr = side < 0 ? j.wrL : j.wrR;
  j.root.updateMatrixWorld(true);
  S.copy(sh.position); // shoulder in spine space
  T.copy(targetWorld);
  j.spine.worldToLocal(T);
  // rest vectors: shoulder→elbow (in shoulder space) and elbow→knuckles (in elbow space)
  A0.copy(el.position);
  F0.copy(wr.position).add(D.set(0, -FIST_REACH, 0));
  const L1 = A0.length();
  const L2 = F0.length();
  U.subVectors(T, S);
  let d = U.length();
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  U.normalize();
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  W.copy(pole).addScaledVector(U, -pole.dot(U)).normalize();
  E.copy(S).addScaledVector(U, Math.cos(a) * L1).addScaledVector(W, Math.sin(a) * L1);
  // shoulder: map the rest frame (upper arm, bend direction) onto the solved one
  A0.normalize();
  B0.copy(F0).addScaledVector(A0, -F0.dot(A0));
  if (B0.lengthSq() < 1e-6) B0.set(0, 0, 1).addScaledVector(A0, -A0.z);
  B0.normalize();
  C0.crossVectors(A0, B0);
  A1.subVectors(E, S).normalize();
  B1.copy(S).addScaledVector(U, d).sub(E).normalize(); // forearm direction
  B1.addScaledVector(A1, -B1.dot(A1));
  if (B1.lengthSq() < 1e-6) B1.copy(W);
  B1.normalize();
  C1.crossVectors(A1, B1);
  M0.makeBasis(A0, B0, C0);
  M1.makeBasis(A1, B1, C1);
  Q.setFromRotationMatrix(M1.multiply(M0.invert()));
  sh.quaternion.copy(Q);
  // elbow: turn the rest forearm onto the solved forearm, expressed in the shoulder's frame
  D.copy(S).addScaledVector(U, d).sub(E).normalize().applyQuaternion(QI.copy(Q).invert());
  el.quaternion.setFromUnitVectors(F0.normalize(), D);
  wr.rotation.set(0, 0, 0);
  return d / (L1 + L2);
}
