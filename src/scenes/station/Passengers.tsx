import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, Group, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { buildFigure, Joints } from '../../characters/figure';
import { Pose, activityPose, applyPose, dampPose, restPose, walkPose } from '../../characters/pose';
import { clamp } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { playerState } from '../../player/playerState';
import { PEOPLE, createCrowd, stepCrowd, validateCrowd } from './crowd';

/**
 * The people of the station: illustrated figures (characters/figure.ts) posed
 * by what they are doing (characters/pose.ts) at the positions the crowd
 * simulation gives them (crowd.ts).
 */
export function Passengers() {
  const crowd = useMemo(() => createCrowd(), []);
  const { figures, root } = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    mat.userData.comic = { halftone: 0.6 };
    const screen = new MeshBasicMaterial({ color: new Color('#dfe6ee').multiplyScalar(1.5) });
    const root = new Group();
    const figures = PEOPLE.map((p) => {
      const j = buildFigure(p.look, mat, screen);
      root.add(j.root);
      return { j, pose: restPose(), target: restPose(), seed: hashName(p.name) };
    });
    return { figures, root };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const problems = validateCrowd();
    if (problems.length) console.warn('[crowd] route problems:\n' + problems.join('\n'));
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    stepCrowd(crowd, dt, localProgress('station'), playerState.position);
    crowd.state.forEach((st, i) => {
      const def = crowd.people[i];
      const f = figures[i];
      const j: Joints = f.j;
      j.root.position.set(st.x, 0, st.z);
      j.root.rotation.y = st.yaw;
      const b = def.b;
      const walker = b.kind === 'lane' || b.kind === 'scroll';
      const k = walker ? clamp(st.speed / 1.0, 0, 1) : 0;
      const activity = b.kind === 'stand' || b.kind === 'sit' ? b.activity : b.kind === 'scroll' ? b.idle ?? 'pockets' : def.look.carry === 'suitcase' ? 'suitcase' : 'pockets';
      activityPose(f.target, activity, t, f.seed);
      if (k > 0.02 || (walker && st.turn > 0.3)) {
        // blend into the gait as they get going; the cycle is locked to distance walked
        const walk = f.target;
        const idle: Pose = { ...walk };
        walkPose(walk, st.phase, Math.max(k, clamp(st.turn / 3, 0, 0.35)), def.gait ?? { swing: 0.8, lean: 0.03, stride: 1 }, def.look.height / 1.75);
        // keep the head of a walker roughly forward, but let idle glances fade out
        for (const key of Object.keys(walk) as (keyof Pose)[]) walk[key] = idle[key] + (walk[key] - idle[key]) * Math.min(1, k * 3 + 0.4);
        // walking poses follow the phase directly (no lag), idle details ease in
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

function hashName(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000;
  return h;
}
