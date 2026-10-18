import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CapsuleGeometry, Color, CylinderGeometry, Group, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, BoxGeometry } from 'three';
import { damp, mulberry32 } from '../../core/math';
import { playerState } from '../../player/playerState';
import { BENCH_Z } from './props';
import { MAST_X } from './layout';

/**
 * Fellow travellers, deliberately few and mostly distant. They are read as
 * silhouettes against the light, so they are built from simple volumes and
 * animated with a light procedural walk cycle.
 */
type Behaviour =
  | { kind: 'walk'; x: number; z0: number; z1: number; speed: number; pause: number; suitcase?: boolean }
  | { kind: 'cross'; z: number; x0: number; x1: number; speed: number; offset: number }
  | { kind: 'stand'; x: number; z: number; yaw: number; phone?: boolean; smoke?: boolean }
  | { kind: 'sit'; x: number; z: number; yaw: number };

interface Person {
  b: Behaviour;
  height: number;
  coat: boolean;
  shade: number;
}

const PEOPLE: Person[] = [
  { b: { kind: 'walk', x: 7.7, z0: -31, z1: -96, speed: 1.05, pause: 3, suitcase: true }, height: 1.78, coat: true, shade: 0 },
  { b: { kind: 'walk', x: 2.7, z0: -86, z1: -44, speed: 1.25, pause: 5 }, height: 1.84, coat: false, shade: 1 },
  { b: { kind: 'walk', x: 3.5, z0: -72, z1: -18, speed: 1.35, pause: 7 }, height: 1.7, coat: true, shade: 2 },
  { b: { kind: 'walk', x: 6.6, z0: 24, z1: 78, speed: 1.2, pause: 4 }, height: 1.76, coat: false, shade: 0 },
  { b: { kind: 'stand', x: 8.6, z: -42, yaw: Math.PI / 2, phone: true }, height: 1.72, coat: true, shade: 3 },
  { b: { kind: 'stand', x: 8.2, z: -25.6, yaw: Math.PI * 0.8, smoke: true }, height: 1.81, coat: true, shade: 0 },
  { b: { kind: 'sit', x: MAST_X - 0.5, z: BENCH_Z[1] + 0.4, yaw: Math.PI / 2 }, height: 1.75, coat: true, shade: 1 },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({
    b: { kind: 'cross' as const, z: -106 - i * 3.3, x0: -24, x1: 46, speed: 1.1 + (i % 3) * 0.15, offset: i * 0.37 },
    height: 1.68 + (i % 4) * 0.05,
    coat: i % 2 === 0,
    shade: i % 4,
  })),
];

const SHADES = ['#121212', '#1a1a1a', '#262626', '#3b3b3a'];

function useParts() {
  return useMemo(
    () => ({
      torso: new CapsuleGeometry(0.17, 0.42, 4, 10),
      coat: new CylinderGeometry(0.2, 0.27, 0.62, 12, 1, true),
      head: new SphereGeometry(0.105, 14, 10),
      leg: new CapsuleGeometry(0.065, 0.74, 4, 8),
      arm: new CapsuleGeometry(0.05, 0.56, 4, 8),
      case: new BoxGeometry(0.24, 0.62, 0.42),
      phone: new BoxGeometry(0.07, 0.13, 0.01),
      mats: SHADES.map((c) => new MeshStandardMaterial({ color: c, roughness: 0.85 })),
      skin: new MeshStandardMaterial({ color: '#4a4542', roughness: 0.7 }),
      glow: new MeshBasicMaterial({ color: new Color('#dfe6ee').multiplyScalar(1.4) }),
      ember: new MeshBasicMaterial({ color: new Color('#c9c3b8').multiplyScalar(1.8) }),
    }),
    [],
  );
}

type Rig = {
  root: Group;
  legL: Group;
  legR: Group;
  armL: Group;
  armR: Group;
  head: Group;
};

function Figure({ person, parts, register }: { person: Person; parts: ReturnType<typeof useParts>; register: (r: Rig) => void }) {
  const refs = useRef<Partial<Rig>>({});
  const s = person.height / 1.78;
  const mat = parts.mats[person.shade];
  const set = (k: keyof Rig) => (g: Group | null) => {
    if (!g) return;
    refs.current[k] = g;
    if (Object.keys(refs.current).length === 6) register(refs.current as Rig);
  };
  const b = person.b;
  return (
    <group ref={set('root')}>
      <group scale={s}>
        <mesh geometry={parts.torso} material={mat} position={[0, 1.24, 0]} scale={[1, 1, 0.68]} castShadow />
        {person.coat && <mesh geometry={parts.coat} material={mat} position={[0, 0.86, 0]} scale={[1, 1, 0.72]} castShadow />}
        <group ref={set('head')} position={[0, 1.6, 0]}>
          <mesh geometry={parts.head} material={parts.skin} position={[0, 0.07, 0]} castShadow />
          <mesh geometry={parts.head} material={mat} position={[0, 0.11, -0.012]} scale={[1.04, 0.72, 1.04]} />
        </group>
        <group ref={set('legL')} position={[-0.09, 0.92, 0]}>
          <mesh geometry={parts.leg} material={mat} position={[0, -0.45, 0]} castShadow />
        </group>
        <group ref={set('legR')} position={[0.09, 0.92, 0]}>
          <mesh geometry={parts.leg} material={mat} position={[0, -0.45, 0]} castShadow />
        </group>
        <group ref={set('armL')} position={[-0.22, 1.46, 0]}>
          <mesh geometry={parts.arm} material={mat} position={[0, -0.32, 0]} castShadow />
          {b.kind === 'stand' && b.phone && <mesh geometry={parts.phone} material={parts.glow} position={[0.02, -0.64, 0.05]} />}
        </group>
        <group ref={set('armR')} position={[0.22, 1.46, 0]}>
          <mesh geometry={parts.arm} material={mat} position={[0, -0.32, 0]} castShadow />
          {b.kind === 'walk' && b.suitcase && <mesh geometry={parts.case} material={parts.mats[1]} position={[0.08, -0.62, -0.42]} castShadow />}
          {b.kind === 'stand' && b.smoke && <mesh material={parts.ember} position={[0, -0.66, 0.03]}><sphereGeometry args={[0.008, 6, 4]} /></mesh>}
        </group>
      </group>
    </group>
  );
}

interface Sim {
  z: number;
  dir: number;
  yaw: number;
  phase: number;
  pauseLeft: number;
  speed: number;
}

export function Passengers() {
  const parts = useParts();
  const rigs = useRef<(Rig | null)[]>([]);
  const sims = useMemo<Sim[]>(() => {
    const rnd = mulberry32(3);
    return PEOPLE.map(({ b }) => ({
      z: b.kind === 'walk' ? b.z0 + (b.z1 - b.z0) * rnd() * 0.3 : 0,
      dir: 1,
      yaw: 0,
      phase: rnd() * 10,
      pauseLeft: 0,
      speed: 0,
    }));
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    PEOPLE.forEach((p, i) => {
      const r = rigs.current[i];
      if (!r) return;
      const sim = sims[i];
      const b = p.b;
      let moving = false;
      if (b.kind === 'walk') {
        const target = sim.dir > 0 ? b.z1 : b.z0;
        const heading = Math.sign(target - sim.z) || 1;
        // give way to the visitor
        const dx = playerState.position.x - b.x;
        const dz = (playerState.position.z - sim.z) * heading;
        const blocked = Math.abs(dx) < 0.9 && dz > 0 && dz < 1.6;
        if (sim.pauseLeft > 0) sim.pauseLeft -= dt;
        else if (!blocked) moving = true;
        sim.speed = damp(sim.speed, moving ? b.speed : 0, 4, dt);
        sim.z += heading * sim.speed * dt;
        if (Math.abs(target - sim.z) < 0.2) {
          sim.dir *= -1;
          sim.pauseLeft = b.pause;
        }
        const yawTarget = heading < 0 ? Math.PI : 0;
        sim.yaw = sim.pauseLeft > 0 && sim.speed < 0.1 ? damp(sim.yaw, yawTarget + Math.PI, 2, dt) : damp(sim.yaw, yawTarget, 3, dt);
        r.root.position.set(b.x, 0, sim.z);
        r.root.rotation.y = sim.yaw;
      } else if (b.kind === 'cross') {
        const span = b.x1 - b.x0;
        const x = b.x0 + ((t * b.speed + b.offset * span) % span);
        r.root.position.set(x, 0, b.z);
        r.root.rotation.y = Math.PI / 2;
        sim.speed = b.speed;
        moving = true;
      } else if (b.kind === 'stand') {
        r.root.position.set(b.x + Math.sin(t * 0.4 + i) * 0.01, 0, b.z);
        r.root.rotation.y = b.yaw + Math.sin(t * 0.13 + i) * 0.12;
        r.head.rotation.y = Math.sin(t * 0.21 + i * 2) * 0.35;
        r.head.rotation.x = b.phone ? 0.45 : 0;
        if (b.phone) r.armL.rotation.x = -1.1;
        if (b.smoke) {
          // slow drag every ~9 s
          const cyc = (t + i * 3) % 9;
          const up = cyc < 2.2 ? Math.sin((cyc / 2.2) * Math.PI) : 0;
          r.armR.rotation.x = -0.3 - up * 1.75;
          r.armR.rotation.z = up * 0.35;
        }
      } else {
        r.root.position.set(b.x, 0, b.z);
        r.root.rotation.y = b.yaw;
        r.root.position.y = -0.42;
        r.legL.rotation.x = r.legR.rotation.x = -1.45;
        r.head.rotation.x = 0.25 + Math.sin(t * 0.17) * 0.05;
        r.armL.rotation.x = r.armR.rotation.x = -0.55;
      }
      if (b.kind === 'walk' || b.kind === 'cross') {
        sim.phase += (sim.speed * dt * Math.PI) / 0.72;
        const k = Math.min(1, sim.speed / 0.8);
        const sw = Math.sin(sim.phase) * 0.42 * k;
        r.legL.rotation.x = sw;
        r.legR.rotation.x = -sw;
        r.armL.rotation.x = -sw * 0.7;
        r.armR.rotation.x = b.kind === 'walk' && b.suitcase ? 0.18 : sw * 0.7;
        r.root.position.y = Math.abs(Math.cos(sim.phase)) * 0.025 * k;
      }
    });
  });

  return (
    <group>
      {PEOPLE.map((p, i) => (
        <Figure key={i} person={p} parts={parts} register={(r) => (rigs.current[i] = r)} />
      ))}
    </group>
  );
}
