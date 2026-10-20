import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { Color, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { ellipsoid, limb, merge, paint, place } from '../../characters/anatomy';
import { hand } from '../../characters/shapes';
import { clamp, smoothstep } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { BLOCK, encounterAt } from './encounter';

const grey = (v: number) => new Color().setStyle(`rgb(${v},${v},${v})`);
const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DOWN = new Vector3(0, -1, 0);
const D = new Vector3();
const Q = new Quaternion();

/** Places a forearm with its elbow at `elbow` and its knuckles towards `fist` (camera space). */
function pose(g: Group, elbow: [number, number, number], fist: [number, number, number], roll = 0) {
  g.position.set(...elbow);
  D.set(fist[0] - elbow[0], fist[1] - elbow[1], fist[2] - elbow[2]).normalize();
  g.quaternion.setFromUnitVectors(DOWN, D);
  if (roll) g.quaternion.multiply(Q.setFromAxisAngle(DOWN, roll));
}
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** One of your forearms, sleeve and fist, pivot at the elbow, pointing along -y. */
function forearm(side: -1 | 1, mat: MeshStandardMaterial) {
  const sleeve = grey(34);
  const skin = grey(150);
  const g = new Group();
  const m = new Mesh(
    merge([
      paint(limb(0.27, 0.05, 0.043, 0.006, 0.25, 14), sleeve),
      paint(place(ellipsoid(0.05, 0.03, 0.05), [0, -0.255, 0]), sleeve), // cuff
      ...hand(side, skin, 1).map((p) => place(p, [0, -0.27, 0])),
    ]),
    mat,
  );
  m.userData.ink = 'silhouette';
  g.add(m);
  g.visible = false;
  return g;
}

/**
 * Your arms, seen from your own eyes, only during the block sequence: the left
 * forearm comes up to take his fist, then the right drives straight out into
 * his jaw. Positions are in camera space (x right, y up, -z ahead).
 */
export function PlayerArms({ active }: { active: boolean }) {
  const camera = useThree((s) => s.camera);
  const { rig, left, right } = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    mat.userData.comic = { halftone: 0.4 };
    const rig = new Group();
    const left = forearm(-1, mat);
    const right = forearm(1, mat);
    rig.add(left, right);
    left.userData.__arm = 'left';
    right.userData.__arm = 'right';
    return { rig, left, right };
  }, []);

  useFrame(() => {
    const view = encounterAt(localProgress('city'));
    const bt = active && view.outcome === 'blocked' ? view.t : -1;
    const on = bt >= 0 && bt < BLOCK.ink + 0.5;
    left.visible = right.visible = on;
    if (!on) return;
    rig.position.copy(camera.position);
    rig.quaternion.copy(camera.quaternion);

    // guard: the left forearm swings up from below the frame and stands across your face,
    // knuckles up, so his fist lands on the outside of it
    const up = smoothstep(ramp(bt, 0, BLOCK.guardUp));
    const absorb = bt > BLOCK.contact ? Math.exp(-(bt - BLOCK.contact) * 9) : 0;
    const down = smoothstep(ramp(bt, BLOCK.counter + 0.1, BLOCK.counter + 0.35));
    const push = 0.05 * absorb;
    const elbowL = mix3([-0.3, -0.75, -0.25], [-0.16, -0.3, -0.34 + push], up);
    const fistL = mix3([-0.32, -0.5, -0.35], [-0.03, 0.02, -0.38 + push], up);
    elbowL[1] -= 0.35 * down;
    fistL[1] -= 0.35 * down;
    pose(left, elbowL, fistL, 0.6);

    // counter: the right drives straight out from under the frame, then comes back a little
    const out = smoothstep(ramp(bt, BLOCK.counter, BLOCK.counterLands));
    const back = smoothstep(ramp(bt, BLOCK.counterLands + 0.06, BLOCK.counterLands + 0.35));
    const reach = out * (1 - back * 0.5);
    const elbowR = mix3([0.26, -0.55, -0.12], [0.12, -0.2, -0.42], reach);
    const fistR = mix3([0.2, -0.4, -0.35], [0.03, -0.04, -0.72], reach);
    pose(right, elbowR, fistR, -1.4);
    right.visible = bt > BLOCK.counter - 0.05;
  });

  return <primitive object={rig} />;
}
