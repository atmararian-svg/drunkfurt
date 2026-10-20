import { Material, MeshBasicMaterial } from 'three';
import { clamp } from '../core/math';
import { SCROLL_PACE, type PersonDef, type PersonState } from './crowd';
import { createFooting, Footing, plantFeet } from './feet';
import { buildFigure, Joints } from './figure';
import { Pose, activityPose, applyPose, dampPose, legLengths, restPose } from './pose';
import { applyWalk, strideAmplitude } from './walkClip';

/** One animated person: the figure, its current and target poses, and its feet on the ground. */
export interface Person {
  j: Joints;
  pose: Pose;
  target: Pose;
  seed: number;
  footing: Footing;
  legs: { thigh: number; shin: number };
  /** How much they are walking (eases in as they set off and out as they stop). */
  walk: number;
}

export function createPerson(def: PersonDef, mat: Material, screen: MeshBasicMaterial): Person {
  const j = buildFigure(def.look, mat, screen);
  return { j, pose: restPose(), target: restPose(), seed: hashName(def.name), footing: createFooting(), legs: legLengths(j), walk: 0 };
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
  // the stance underneath (what they do when they stop), then the captured walk on top of it
  dampPose(f.pose, f.target, 5, dt);
  applyPose(j, f.pose);
  j.phone.visible = activity === 'phone' || activity === 'call' || activity === 'sitPhone';
  const moving = k > 0.02;
  const turning = walker && !moving && st.turn > 0.3;
  const want = moving ? 1 : turning ? 0.4 : 0;
  f.walk += (want - f.walk) * Math.min(1, dt * (want > f.walk ? 6 : 4));
  const rolling = !!j.suitcase && walker && moving;
  let stanceL = 1;
  let stanceR = 1;
  if (f.walk > 0.01) {
    // shorter steps when slower: the cycle advances by distance with a stride to match (crowd.ts)
    const amount = f.walk * (moving ? strideAmplitude(b.kind === 'scroll' ? SCROLL_PACE : st.speed) : 1);
    const w = applyWalk(j, st.phase, amount, { holdR: rolling });
    stanceL = w.stanceL;
    stanceR = w.stanceR;
  }
  f.pose.stanceL = stanceL;
  f.pose.stanceR = stanceR;
  if (j.suitcase) {
    if (rolling) {
      // rolled behind on its wheels, the right arm back holding the handle
      j.suitcase.position.set(0.24, 0, -0.5);
      j.suitcase.rotation.set(0.42, 0, 0);
      j.shR.rotation.set(0.45, 0, 0.07);
      j.elR.rotation.set(-0.08, 0, 0);
    } else {
      j.suitcase.position.set(0.36, 0, 0.06);
      j.suitcase.rotation.set(0, 0, 0);
    }
  }
  // feet that carry weight stay where they touched down
  if (pinFeet) plantFeet(j, f.pose, f.footing, dt);
}
