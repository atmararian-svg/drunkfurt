import { clamp, damp } from '../core/math';
import { BODY } from './anatomy';
import type { Joints } from './figure';

/**
 * Body poses as joint angles (radians). Conventions, for a figure facing +z:
 *  - shoulder/hip pitch: negative swings the limb forward
 *  - elbow: negative bends the forearm forward; knee: positive bends the shin back
 *  - spine pitch / head pitch: positive leans / looks down
 *  - roll (z) on shoulders: positive lifts the arm sideways (mirrored per side)
 */
export interface Pose {
  hipsX: number; // weight shift, sideways (m)
  hipsDrop: number; // extra lowering (m), e.g. relaxed knee
  pelvisYaw: number;
  pelvisRoll: number;
  spinePitch: number;
  spineYaw: number;
  spineRoll: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  shLp: number; shLr: number; shLy: number; elL: number; wrLp: number; wrLr: number;
  shRp: number; shRr: number; shRy: number; elR: number; wrRp: number; wrRr: number;
  hipLp: number; hipLr: number; kneeL: number; ankleL: number;
  hipRp: number; hipRr: number; kneeR: number; ankleR: number;
  /** Absolute hips height when sitting (m above ground, unscaled); 0 = grounded by the legs. */
  seat: number;
}

export const restPose = (): Pose => ({
  hipsX: 0, hipsDrop: 0, pelvisYaw: 0, pelvisRoll: 0,
  spinePitch: 0, spineYaw: 0, spineRoll: 0, headPitch: 0, headYaw: 0, headRoll: 0,
  shLp: 0.04, shLr: 0.06, shLy: 0, elL: -0.18, wrLp: 0, wrLr: 0,
  shRp: 0.04, shRr: 0.06, shRy: 0, elR: -0.18, wrRp: 0, wrRr: 0,
  hipLp: 0, hipLr: 0, kneeL: 0.04, ankleL: -0.04,
  hipRp: 0, hipRr: 0, kneeR: 0.04, ankleR: -0.04,
  seat: 0,
});

const KEYS = Object.keys(restPose()) as (keyof Pose)[];

export function copyPose(out: Pose, a: Pose) {
  for (const k of KEYS) out[k] = a[k];
  return out;
}

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function dampPose(cur: Pose, target: Pose, lambda: number, dt: number) {
  for (const k of KEYS) cur[k] = damp(cur[k], target[k], lambda, dt);
}

// ---------------------------------------------------------------------------
// Deterministic timing helpers

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * An occasional event: in each window of `period` seconds there is a chance
 * `p` that something happens for `dur` seconds at a random moment. Returns a
 * smooth 0..1 envelope. Deterministic in (t, seed), so people never sync up.
 */
export function moment(t: number, seed: number, period: number, dur: number, p = 0.7) {
  const k = Math.floor(t / period);
  if (hash(k * 13.7 + seed) > p) return 0;
  const start = k * period + hash(k * 7.3 + seed * 3.1) * (period - dur);
  const u = (t - start) / dur;
  if (u <= 0 || u >= 1) return 0;
  const e = Math.sin(u * Math.PI);
  return e * e * (3 - 2 * e);
}

/** A slow value in -1..1 that changes direction at irregular times. */
export function drift(t: number, seed: number, period: number) {
  const k = Math.floor(t / period);
  const u = t / period - k;
  const a = hash(k + seed * 17.1) * 2 - 1;
  const b = hash(k + 1 + seed * 17.1) * 2 - 1;
  const s = u * u * (3 - 2 * u);
  return a + (b - a) * s;
}

// ---------------------------------------------------------------------------
// Activities

export type Activity = 'wait' | 'pockets' | 'phone' | 'call' | 'talk' | 'listen' | 'board' | 'smoke' | 'adjust' | 'sit' | 'sitPhone' | 'suitcase';

/** Standing: weight on one leg, the other knee relaxed, breathing, glances. */
function standBase(p: Pose, t: number, seed: number) {
  const w = drift(t, seed, 7 + hash(seed) * 5); // which leg carries the weight
  p.hipsX = w * 0.025;
  p.pelvisRoll = -w * 0.035;
  p.spineRoll = w * 0.02;
  // the free leg relaxes: knee bends, hip drops on that side
  const relaxL = clamp(w, 0, 1);
  const relaxR = clamp(-w, 0, 1);
  p.kneeL = 0.05 + relaxL * 0.16;
  p.hipLp = -relaxL * 0.06;
  p.ankleL = -0.05 - relaxL * 0.08;
  p.kneeR = 0.05 + relaxR * 0.16;
  p.hipRp = -relaxR * 0.06;
  p.ankleR = -0.05 - relaxR * 0.08;
  p.hipLr = 0.02;
  p.hipRr = 0.02;
  p.spinePitch = 0.02 + Math.sin(t * 1.1 + seed) * 0.008; // breathing
  // looking around now and then
  const glance = moment(t, seed + 1, 6, 2.2, 0.6);
  p.headYaw = glance * (hash(Math.floor(t / 6) + seed) - 0.5) * 1.4 + drift(t, seed + 9, 11) * 0.12;
  p.headPitch = 0.04 + drift(t, seed + 4, 13) * 0.05;
}

/** Writes the target pose for an activity at time t. */
export function activityPose(p: Pose, a: Activity, t: number, seed: number) {
  copyPose(p, restPose());
  if (a === 'sit' || a === 'sitPhone') {
    p.seat = 0.5;
    p.hipLp = p.hipRp = -1.48;
    p.hipLr = 0.08;
    p.hipRr = 0.1;
    p.kneeL = 1.42;
    p.kneeR = 1.5 + drift(t, seed, 9) * 0.1;
    p.ankleL = p.ankleR = 0.06;
    p.spinePitch = 0.12;
    if (a === 'sitPhone') {
      p.shRp = -0.55; p.shRr = 0.05; p.elR = -1.5; p.wrRp = -0.3;
      p.shLp = -0.4; p.elL = -1.3; p.shLr = 0.1;
      p.headPitch = 0.55 + moment(t, seed, 8, 1.5) * -0.45;
    } else {
      // forearms on thighs, looking along the platform
      p.shLp = p.shRp = -0.45;
      p.elL = p.elR = -0.9;
      p.headPitch = 0.12;
      p.headYaw = drift(t, seed + 2, 9) * 0.5;
    }
    return p;
  }

  standBase(p, t, seed);
  switch (a) {
    case 'pockets':
      // hands in coat pockets: arms slightly out and back, elbows bent
      p.shLp = p.shRp = 0.12;
      p.shLr = p.shRr = 0.16;
      p.elL = p.elR = -0.42;
      p.wrLp = p.wrRp = 0.2;
      break;
    case 'phone': {
      // phone held at chest height, head down; looks up briefly now and then
      const up = moment(t, seed + 5, 9, 1.8, 0.6);
      p.shRp = -0.5; p.shRr = 0.06; p.elR = -1.55; p.wrRp = -0.35;
      p.shLp = -0.32; p.shLr = 0.12; p.elL = -1.45; p.wrLp = -0.2;
      p.headPitch = 0.6 - up * 0.55;
      p.headYaw = up * 0.4 * (hash(Math.floor(t / 9) + seed) - 0.5);
      p.spinePitch = 0.08;
      // thumb scrolling: tiny wrist motion
      p.wrRr = Math.sin(t * 3.1 + seed) * 0.05;
      break;
    }
    case 'call': {
      // phone at the right ear, the free hand gesturing, body turning slowly
      p.shRp = -0.25; p.shRr = 0.62; p.shRy = -0.5; p.elR = -2.35; p.wrRp = -0.2;
      p.headRoll = 0.12;
      const g = moment(t, seed, 4.5, 1.8, 0.75);
      p.shLp = 0.05 - g * 0.55; p.shLr = 0.12 + g * 0.2; p.elL = -0.3 - g * 1.0; p.wrLr = g * 0.4;
      p.spineYaw = drift(t, seed + 3, 8) * 0.3;
      p.headPitch = 0.12 + drift(t, seed + 6, 5) * 0.1;
      break;
    }
    case 'talk':
    case 'listen': {
      // facing the other person; the talker gestures, the listener nods
      const talker = a === 'talk';
      const g1 = moment(t, seed, talker ? 3.2 : 7, talker ? 1.6 : 1.2, talker ? 0.85 : 0.5);
      const g2 = moment(t + 1.3, seed + 2, talker ? 4.1 : 9, 1.4, talker ? 0.6 : 0.35);
      p.shRp = 0.05 - g1 * 0.55; p.shRr = 0.1 + g1 * 0.18; p.elR = -0.25 - g1 * 1.15; p.wrRp = -g1 * 0.3; p.wrRr = g1 * 0.5;
      p.shLp = 0.06 - g2 * 0.45; p.shLr = 0.1 + g2 * 0.15; p.elL = -0.25 - g2 * 1.0; p.wrLr = -g2 * 0.4;
      if (!talker) {
        // arms folded most of the time
        const folded = 1 - g1;
        p.shLp = -0.25 * folded + p.shLp * (1 - folded); p.elL = -1.85 * folded + p.elL * (1 - folded); p.shLr = 0.1;
        p.shRp = -0.25 * folded + p.shRp * (1 - folded); p.elR = -1.75 * folded + p.elR * (1 - folded); p.shRr = 0.1;
        p.shLy = 0.5 * folded; p.shRy = -0.5 * folded;
      }
      const nod = moment(t, seed + 7, talker ? 5 : 2.6, 0.7, talker ? 0.3 : 0.8);
      p.headPitch = 0.06 + nod * 0.22 * Math.sin(t * 9);
      p.headYaw = drift(t, seed + 3, 6) * 0.15; // mostly looking at the other person
      p.headRoll = drift(t, seed + 8, 7) * 0.08;
      p.spinePitch = 0.03 + g1 * 0.04;
      break;
    }
    case 'board':
      // looking up at the departure board, one hand on the backpack strap
      p.headPitch = -0.48 + drift(t, seed, 6) * 0.06;
      p.headYaw = drift(t, seed + 1, 8) * 0.18;
      p.spinePitch = -0.04;
      p.shRp = -0.3; p.shRr = 0.05; p.elR = -1.95; p.wrRp = 0.3;
      p.shLp = 0.08; p.shLr = 0.08; p.elL = -0.22;
      break;
    case 'smoke': {
      const drag = moment(t, seed, 9, 2.4, 0.95);
      p.shLp = -0.18; p.shLr = 0.08; p.shLy = 0.55; p.elL = -1.65; // forearm across the body
      p.shRp = -0.1 - drag * 0.42; p.shRr = 0.08 + drag * 0.2; p.elR = -1.2 - drag * 1.05; p.wrRp = -0.2;
      p.headPitch = 0.0 - drag * 0.08;
      break;
    }
    case 'adjust': {
      // both hands pull the backpack straps every so often
      const pull = moment(t, seed, 10, 2.0, 0.8);
      p.shLp = 0.06 - pull * 0.3; p.shLr = 0.1; p.elL = -0.2 - pull * 1.7;
      p.shRp = 0.06 - pull * 0.32; p.shRr = 0.1; p.elR = -0.2 - pull * 1.75;
      p.spinePitch += pull * 0.06;
      p.headPitch += pull * 0.15;
      break;
    }
    case 'suitcase':
      // right hand resting on the extended handle
      p.shRp = -0.05; p.shRr = 0.28; p.elR = -0.35; p.wrRr = -0.2;
      p.shLp = 0.1; p.shLr = 0.16; p.elL = -0.42; // other hand in pocket
      break;
    case 'wait':
    default:
      // hands loosely clasped in front
      p.shLp = p.shRp = -0.12;
      p.shLr = p.shRr = 0.05;
      p.shLy = 0.35; p.shRy = -0.35;
      p.elL = p.elR = -0.72;
      break;
  }
  return p;
}

/**
 * Walking. `phase` advances with distance walked (2π per stride), `k` is 0..1
 * from standing to full pace. Built from the gait cycle rather than a sine on
 * each limb: heel strike with the knee nearly straight, a flexed knee in swing,
 * flat foot in stance with a push-off at the end, pelvis rotation and drop,
 * counter-rotating shoulders and arms that swing from the shoulder with a soft
 * elbow.
 */
export function walkPose(p: Pose, phase: number, k: number, style: { swing: number; lean: number; stride: number }) {
  const leg = (ph: number) => {
    // ph = 0 at heel strike, π at toe-off of the other leg / mid-swing begins
    const s = ((ph % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const hip = -0.36 * style.stride * Math.cos(s);
    const stance = s < Math.PI * 1.05;
    const knee = stance ? 0.12 * Math.sin((s / (Math.PI * 1.05)) * Math.PI) : 1.05 * Math.sin(((s - Math.PI * 1.05) / (Math.PI * 0.95)) * Math.PI) ** 1.2;
    // foot: flat during stance (cancel leg angles), toe-up at strike, push-off at the end of stance
    const strike = Math.exp(-((s - 0.0) ** 2) / 0.08) + Math.exp(-((s - Math.PI * 2) ** 2) / 0.08);
    const push = Math.exp(-((s - Math.PI * 0.95) ** 2) / 0.1);
    const footWorld = -0.22 * strike + 0.55 * push + (stance ? 0 : -0.1);
    return { hip: hip * k, knee: knee * k, ankle: (footWorld - hip - knee) * k };
  };
  const L = leg(phase);
  const R = leg(phase + Math.PI);
  p.hipLp = L.hip; p.kneeL = 0.03 + L.knee; p.ankleL = L.ankle;
  p.hipRp = R.hip; p.kneeR = 0.03 + R.knee; p.ankleR = R.ankle;
  p.hipLr = p.hipRr = 0.015;
  p.pelvisYaw = 0.09 * Math.sin(phase) * k;
  p.pelvisRoll = 0.035 * Math.sin(phase * 2 + 0.6) * k;
  p.spineYaw = -0.07 * Math.sin(phase) * k;
  p.spinePitch = (0.04 + style.lean) * k + 0.01;
  p.spineRoll = -0.015 * Math.sin(phase) * k;
  // arms opposite to the legs, swing lagging slightly, elbows soft and a bit more bent forward
  const armL = 0.3 * style.swing * Math.cos(phase + 0.25);
  const armR = -0.3 * style.swing * Math.cos(phase + 0.25);
  p.shLp = armL * k + 0.03; p.shLr = 0.07; p.elL = -0.22 - Math.max(0, -armL) * 0.6 * k;
  p.shRp = armR * k + 0.03; p.shRr = 0.07; p.elR = -0.22 - Math.max(0, -armR) * 0.6 * k;
  // head stays level: counter the bob and the twist
  p.headPitch = 0.05;
  p.headYaw = -p.spineYaw * 0.6;
  p.hipsX = 0.012 * Math.sin(phase) * k;
}

const tmpVec = { x: 0, y: 0 };
function legReach(hip: number, knee: number) {
  // vertical distance from hip joint to ankle for given hip pitch and knee bend
  tmpVec.y = BODY.thigh * Math.cos(hip) + BODY.shin * Math.cos(hip + knee);
  return tmpVec.y;
}

/** Applies a pose to the joints. Standing poses are grounded: the lower foot stays on the floor. */
export function applyPose(j: Joints, p: Pose) {
  if (p.seat > 0) {
    j.hips.position.set(0, p.seat, 0);
  } else {
    const reach = Math.max(legReach(p.hipLp, p.kneeL), legReach(p.hipRp, p.kneeR));
    j.hips.position.set(p.hipsX, reach + BODY.ankle - p.hipsDrop, 0);
  }
  j.hips.rotation.set(0, p.pelvisYaw, p.pelvisRoll);
  j.spine.rotation.set(p.spinePitch, p.spineYaw - p.pelvisYaw * 0.5, p.spineRoll - p.pelvisRoll * 0.8);
  j.head.rotation.set(p.headPitch - p.spinePitch * 0.6, p.headYaw, p.headRoll - p.spineRoll);
  j.shL.rotation.set(p.shLp, p.shLy, -p.shLr);
  j.shR.rotation.set(p.shRp, p.shRy, p.shRr);
  j.elL.rotation.set(p.elL, 0, 0);
  j.elR.rotation.set(p.elR, 0, 0);
  j.wrL.rotation.set(p.wrLp, 0, -p.wrLr);
  j.wrR.rotation.set(p.wrRp, 0, p.wrRr);
  j.hipL.rotation.set(p.hipLp, 0, -p.hipLr);
  j.hipR.rotation.set(p.hipRp, 0, p.hipRr);
  j.kneeL.rotation.set(p.kneeL, 0, 0);
  j.kneeR.rotation.set(p.kneeR, 0, 0);
  j.ankleL.rotation.set(p.ankleL, 0, 0);
  j.ankleR.rotation.set(p.ankleR, 0, 0);
}
