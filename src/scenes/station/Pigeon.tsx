import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Group, MeshStandardMaterial } from 'three';
import { damp, mulberry32 } from '../../core/math';
import { playerState } from '../../player/playerState';

/**
 * The city's oldest resident. Pecks at crumbs, potters about, and walks off
 * in mild indignation when the visitor gets too close.
 */
export function Pigeon({ home }: { home: [number, number] }) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const mats = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: '#5b5c5f', roughness: 0.8 }),
      wing: new MeshStandardMaterial({ color: '#3d3e41', roughness: 0.85 }),
      neck: new MeshStandardMaterial({ color: '#4c5552', roughness: 0.4, metalness: 0.3 }),
      dark: new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 }),
    }),
    [],
  );
  const st = useMemo(
    () => ({ x: home[0], z: home[1], yaw: 0.6, tx: home[0], tz: home[1], timer: 1, peck: 0, step: 0, rnd: mulberry32(9) }),
    [home],
  );

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const r = root.current;
    const h = head.current;
    if (!r || !h) return;
    const px = playerState.position.x - st.x;
    const pz = playerState.position.z - st.z;
    const near = Math.hypot(px, pz) < 2.4;
    st.timer -= dt;
    if (near) {
      // retreat away from the visitor, staying near home
      const l = Math.hypot(px, pz) || 1;
      st.tx = st.x - (px / l) * 1.5;
      st.tz = st.z - (pz / l) * 1.5;
      st.timer = 2;
    } else if (st.timer <= 0) {
      st.timer = 2 + st.rnd() * 4;
      st.tx = home[0] + (st.rnd() - 0.5) * 1.6;
      st.tz = home[1] + (st.rnd() - 0.5) * 1.6;
    }
    const dx = st.tx - st.x;
    const dz = st.tz - st.z;
    const dist = Math.hypot(dx, dz);
    const walking = dist > 0.05;
    if (walking) {
      const v = Math.min(dist, (near ? 0.9 : 0.35) * dt);
      st.x += (dx / dist) * v;
      st.z += (dz / dist) * v;
      st.yaw = damp(st.yaw, Math.atan2(dx, dz), 8, dt);
      st.step += dt * (near ? 14 : 9);
    }
    r.position.set(st.x, 0, st.z);
    r.rotation.y = st.yaw;
    if (walking) {
      // the characteristic head-bob
      h.position.z = 0.07 + Math.max(0, Math.sin(st.step)) * 0.025;
      h.rotation.x = 0;
    } else {
      st.peck = Math.max(0, st.peck - dt);
      if (st.peck === 0 && st.rnd() < dt * 0.9) st.peck = 0.35;
      const p = st.peck > 0 ? Math.sin((st.peck / 0.35) * Math.PI) : 0;
      h.rotation.x = p * 1.3;
      h.position.z = 0.07;
      h.rotation.y = Math.sin(clock.elapsedTime * 1.3) * 0.3 * (1 - p);
    }
  });

  return (
    <group ref={root}>
      <mesh material={mats.body} position={[0, 0.12, 0]} scale={[0.075, 0.07, 0.13]} castShadow>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      <mesh material={mats.wing} position={[0, 0.135, -0.03]} scale={[0.08, 0.05, 0.11]}>
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>
      <mesh material={mats.wing} position={[0, 0.12, -0.15]} rotation={[0.35, 0, 0]} scale={[0.05, 0.012, 0.08]}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
      <group ref={head} position={[0, 0.19, 0.07]}>
        <mesh material={mats.neck} position={[0, -0.02, 0]} scale={[0.04, 0.05, 0.04]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <mesh material={mats.body} position={[0, 0.03, 0.02]} scale={0.032}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <mesh material={mats.dark} position={[0, 0.025, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.007, 0.025, 6]} />
        </mesh>
      </group>
      {[-0.025, 0.025].map((x) => (
        <mesh key={x} material={mats.dark} position={[x, 0.03, 0.01]}>
          <cylinderGeometry args={[0.004, 0.004, 0.06, 4]} />
        </mesh>
      ))}
    </group>
  );
}
