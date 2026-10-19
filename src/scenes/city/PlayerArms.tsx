import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { ellipsoid, fist, limb, merge, paint, place } from '../../characters/anatomy';
import { clamp, smoothstep } from '../../core/math';
import { BLOCK, blockTime, encounter } from './encounter';

const grey = (v: number) => new Color().setStyle(`rgb(${v},${v},${v})`);
const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** One of your forearms, sleeve and fist, pivot at the elbow, pointing along -y. */
function forearm(side: -1 | 1, mat: MeshStandardMaterial) {
  const sleeve = grey(34);
  const skin = grey(150);
  const g = new Group();
  const m = new Mesh(
    merge([
      paint(limb(0.27, 0.05, 0.043, 0.006, 0.25, 14), sleeve),
      paint(place(ellipsoid(0.05, 0.03, 0.05), [0, -0.255, 0]), sleeve), // cuff
      ...fist(side, skin).map((p) => place(p, [0, -0.27, 0])),
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
    return { rig, left, right };
  }, []);

  useFrame(() => {
    const bt = active ? blockTime() : -1;
    const on = bt >= 0 && bt < BLOCK.ink + 0.5 && encounter.state === 'impact';
    left.visible = right.visible = on;
    if (!on) return;
    rig.position.copy(camera.position);
    rig.quaternion.copy(camera.quaternion);

    // guard: the left forearm swings up from below the frame to stand across your face
    const up = smoothstep(ramp(bt, 0, BLOCK.guardUp));
    const absorb = Math.exp(-Math.max(0, bt - BLOCK.contact) * 9) * (bt > BLOCK.contact ? 1 : 0);
    const down = smoothstep(ramp(bt, BLOCK.counter + 0.1, BLOCK.counter + 0.35));
    left.position.set(lerp(-0.26, -0.11, up), lerp(-0.62, -0.2, up) - 0.25 * down, lerp(-0.3, -0.36, up) + 0.04 * absorb);
    // forearm nearly vertical, fist up, angled slightly across
    left.rotation.set(lerp(-0.4, -0.15, up), 0.1, lerp(0.9, Math.PI - 0.35, up));

    // counter: the right fist drives out, straight, then comes back
    const out = smoothstep(ramp(bt, BLOCK.counter, BLOCK.counterLands));
    const back = smoothstep(ramp(bt, BLOCK.counterLands + 0.06, BLOCK.counterLands + 0.35));
    const reach = out * (1 - back * 0.7);
    right.position.set(lerp(0.24, 0.08, reach), lerp(-0.55, -0.12, reach), lerp(-0.22, -0.5, reach));
    // forearm pointing ahead, knuckles first
    right.rotation.set(lerp(-0.9, -Math.PI / 2 + 0.08, reach), 0, lerp(-0.3, 0.06, reach));
    right.visible = bt > BLOCK.counter - 0.05;
  });

  return <primitive object={rig} />;
}
