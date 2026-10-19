import { Matrix4, Quaternion, Vector3 } from 'three';
import { BODY } from './anatomy';
import type { Joints } from './figure';

const S = new Vector3();
const T = new Vector3();
const U = new Vector3();
const W = new Vector3();
const E = new Vector3();
const F = new Vector3();
const X = new Vector3();
const Y = new Vector3();
const Z = new Vector3();
const M = new Matrix4();
const Q = new Quaternion();

/** Shoulder-to-knuckles reach: upper arm, forearm, and the fist beyond the wrist. */
export const FIST_REACH = 0.1;

/**
 * Two-bone IK for an arm, so a fist (or hand) lands on a point in the world.
 * Works in the spine's space: the shoulder joint is fixed there, the target is
 * brought in, the elbow is placed in the plane given by `pole` (a direction in
 * spine space the elbow should bend towards, e.g. down and out for a punch),
 * and the shoulder orientation and elbow bend are written as rotations, so the
 * limb lengths never stretch. Call after the rest of the pose is applied.
 * Returns how close the target was to full extension (1 = arm straight).
 */
export function aimArm(j: Joints, side: -1 | 1, targetWorld: Vector3, pole: Vector3) {
  const sh = side < 0 ? j.shL : j.shR;
  const el = side < 0 ? j.elL : j.elR;
  const wr = side < 0 ? j.wrL : j.wrR;
  j.root.updateMatrixWorld(true);
  S.copy(sh.position); // shoulder in spine space
  T.copy(targetWorld);
  j.spine.worldToLocal(T);
  const L1 = BODY.upperArm;
  const L2 = BODY.foreArm + FIST_REACH;
  U.subVectors(T, S);
  let d = U.length();
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  U.normalize();
  // shoulder angle from the law of cosines
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  W.copy(pole).addScaledVector(U, -pole.dot(U)).normalize();
  E.copy(S).addScaledVector(U, Math.cos(a) * L1).addScaledVector(W, Math.sin(a) * L1);
  // directions of the two bones
  Y.subVectors(S, E).normalize(); // local +y of the shoulder points back up the upper arm
  F.copy(S).addScaledVector(U, d).sub(E).normalize(); // forearm direction
  // local +z: the side the forearm bends towards, perpendicular to the upper arm
  Z.copy(F).addScaledVector(Y, -F.dot(Y)).normalize();
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1);
  X.crossVectors(Y, Z).normalize();
  M.makeBasis(X, Y, Z);
  Q.setFromRotationMatrix(M);
  sh.quaternion.copy(Q);
  // the elbow bends about its own x axis; negative swings the forearm towards +z
  const cosB = Math.min(1, Math.max(-1, -Y.dot(F)));
  el.rotation.set(-Math.acos(cosB), 0, 0);
  wr.rotation.set(0, 0, 0);
  return d / (L1 + L2);
}
