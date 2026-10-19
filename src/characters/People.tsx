import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, Group, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { clamp } from '../core/math';
import { playerState } from '../player/playerState';
import { Crowd, stepCrowd, validateCrowd } from './crowd';
import { Joints, buildFigure } from './figure';
import { Pose, activityPose, applyPose, dampPose, restPose, walkPose } from './pose';

interface Props {
  crowd: Crowd;
  /** Episode-local scroll progress, for scroll-driven people. */
  scroll: () => number;
  /** Time scale (1 = normal); the city's slow-motion climax runs everyone at 0.1. */
  timeScale?: () => number;
  /** Called after each step, e.g. to feed positions to a pigeon. */
  onStep?: (c: Crowd) => void;
  /** Steps the simulation; set false while the world is preloading out of sight. */
  enabled?: boolean;
}

/**
 * Renders a crowd simulated in characters/crowd.ts: illustrated figures
 * (figure.ts) posed by what they are doing (pose.ts) at the positions the
 * simulation gives them.
 */
export function People({ crowd, scroll, timeScale, onStep, enabled = true }: Props) {
  const { figures, root } = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    mat.userData.comic = { halftone: 0.6 };
    const screen = new MeshBasicMaterial({ color: new Color('#dfe6ee').multiplyScalar(1.5) });
    const root = new Group();
    const figures = crowd.people.map((p) => {
      const j = buildFigure(p.look, mat, screen);
      root.add(j.root);
      return { j, pose: restPose(), target: restPose(), seed: hashName(p.name) };
    });
    return { figures, root };
  }, [crowd]);
  const clock = useMemo(() => ({ t: 0 }), []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const problems = validateCrowd(crowd.people, crowd.nav);
    if (problems.length) console.warn('[crowd] route problems:\n' + problems.join('\n'));
  }, [crowd]);

  useFrame((_, rawDt) => {
    if (!enabled) return;
    const dt = Math.min(rawDt, 0.05) * (timeScale ? timeScale() : 1);
    clock.t += dt;
    const t = clock.t;
    stepCrowd(crowd, dt, scroll(), playerState.position);
    onStep?.(crowd);
    crowd.state.forEach((st, i) => {
      const def = crowd.people[i];
      const f = figures[i];
      const j: Joints = f.j;
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
        walkPose(walk, st.phase, Math.max(k, clamp(st.turn / 3, 0, 0.35)), def.gait ?? { swing: 0.8, lean: 0.03, stride: 1 }, def.look.height / 1.75);
        for (const key of Object.keys(walk) as (keyof Pose)[]) walk[key] = idle[key] + (walk[key] - idle[key]) * Math.min(1, k * 3 + 0.4);
        dampPose(f.pose, walk, 30, dt);
      } else {
        dampPose(f.pose, f.target, 5, dt);
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
    });
  });

  return <primitive object={root} />;
}

export function hashName(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000;
  return h;
}
