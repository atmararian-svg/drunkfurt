import { Material, MeshBasicMaterial } from 'three';
import { clamp } from '../core/math';
import type { PersonDef, PersonState } from './crowd';
import { createFooting, Footing, plantFeet } from './feet';
import { buildFigure, Joints } from './figure';
import { Pose, activityPose, applyPose, dampPose, legLengths, restPose, walkPose } from './pose';

/** One animated person: the figure, its current and target poses, and its feet on the ground. */
export interface Person {
  j: Joints;
  pose: Pose;
  target: Pose;
  seed: number;
  footing: Footing;
  legs: { thigh: number; shin: number };
}

export function createPerson(def: PersonDef, mat: Material, screen: MeshBasicMaterial): Person {
  const j = buildFigure(def.look, mat, screen);
  return { j, pose: restPose(), target: restPose(), seed: hashName(def.name), footing: createFooting(), legs: legLengths(j) };
}

export function hashName(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000;
  return h;
}

/**
 * Poses one person for a frame from their simulated state (crowd.ts): what
 * they are doing where they stand, or the gait locked to the distance they
 * walked, then the feet pinned where they carry weight.
 */
export function animatePerson(f: Person, def: PersonDef, st: PersonState, t: number, dt: number, pinFeet = true) {
  const j = f.j;
  j.root.position.set(st.x, 0, st.z);
  j.root.rotation.y = st.yaw;
  const b = def.b;
  const walker = b.kind === 'lane' || b.kind === 'scroll';
  const k = walker ? clamp(st.speed / 1.0, 0, 1) : 0;
  const activity =
    b.kind === 'stand' || b.kind === 'sit'
      ? b.activity
      : b.kind === 'scroll'
        ? b.idle ?? 'pockets'
        : def.look.carry === 'suitcase'
          ? 'suitcase'
          : 'pockets';
  activityPose(f.target, activity, t, f.seed);
  if (k > 0.02 || (walker && st.turn > 0.3)) {
    // blend into the gait as they get going; the cycle is locked to distance walked
    const walk = f.target;
    const idle: Pose = { ...walk };
    walkPose(walk, st.phase, Math.max(k, clamp(st.turn / 3, 0, 0.35)), def.gait ?? { swing: 0.8, lean: 0.03, stride: 1 }, f.legs);
    const stanceL = walk.stanceL;
    const stanceR = walk.stanceR;
    for (const key of Object.keys(walk) as (keyof Pose)[]) walk[key] = idle[key] + (walk[key] - idle[key]) * Math.min(1, k * 3 + 0.4);
    dampPose(f.pose, walk, 30, dt);
    // which foot is down comes straight from the gait, never smoothed
    f.pose.stanceL = stanceL;
    f.pose.stanceR = stanceR;
  } else {
    dampPose(f.pose, f.target, 5, dt);
    f.pose.stanceL = f.pose.stanceR = 1;
  }
  applyPose(j, f.pose);
  j.phone.visible = activity === 'phone' || activity === 'call' || activity === 'sitPhone';
  if (j.suitcase) {
    if (walker && k > 0.02) {
      // rolled behind on its wheels
      j.suitcase.position.set(0.24, 0, -0.5);
      j.suitcase.rotation.set(0.42, 0, 0);
      f.pose.shRp = 0.45;
      f.pose.elR = -0.08;
      applyPose(j, f.pose);
    } else {
      j.suitcase.position.set(0.36, 0, 0.06);
      j.suitcase.rotation.set(0, 0, 0);
    }
  }
  // feet that carry weight stay where they touched down
  if (pinFeet) plantFeet(j, f.pose, f.footing, dt);
}
