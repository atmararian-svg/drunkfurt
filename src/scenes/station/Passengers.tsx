import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, Group, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import { clamp } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { playerState } from '../../player/playerState';
import { Look, PEOPLE, PersonDef, createCrowd, stepCrowd, validateCrowd } from './crowd';

/**
 * Renders the crowd simulated in crowd.ts. Figures are still built from simple
 * volumes (they print as silhouettes), but with adult proportions: hips at
 * ~0.53 of height, shoulders wider than hips, knees and elbows, feet, and a
 * slight forward lean while walking.
 */
const SHADES = ['#1d1d1d', '#2f2f2f', '#454543', '#6a6965'];

function useParts() {
  return useMemo(
    () => ({
      chest: new CapsuleGeometry(0.15, 0.3, 4, 12),
      pelvis: new CapsuleGeometry(0.13, 0.08, 4, 10),
      coat: new CylinderGeometry(0.19, 0.25, 0.66, 14, 1, true),
      neck: new CylinderGeometry(0.045, 0.05, 0.1, 8),
      head: new SphereGeometry(0.1, 16, 12),
      thigh: new CapsuleGeometry(0.068, 0.34, 4, 8),
      shin: new CapsuleGeometry(0.055, 0.36, 4, 8),
      foot: new BoxGeometry(0.1, 0.07, 0.25),
      upper: new CapsuleGeometry(0.052, 0.24, 4, 8),
      fore: new CapsuleGeometry(0.044, 0.24, 4, 8),
      hat: new CylinderGeometry(0.105, 0.11, 0.07, 14),
      brim: new CylinderGeometry(0.16, 0.16, 0.012, 16),
      suitcase: new BoxGeometry(0.22, 0.6, 0.4),
      handle: new BoxGeometry(0.02, 0.42, 0.02),
      backpack: new BoxGeometry(0.3, 0.4, 0.16),
      bag: new BoxGeometry(0.08, 0.26, 0.34),
      phone: new BoxGeometry(0.07, 0.13, 0.01),
      mats: SHADES.map((c) => {
        const m = new MeshStandardMaterial({ color: c, roughness: 0.9 });
        m.userData.comic = { halftone: 0.5 };
        return m;
      }),
      skin: new MeshStandardMaterial({ color: '#5a5450', roughness: 0.8 }),
      dark: new MeshStandardMaterial({ color: '#141414', roughness: 0.7 }),
      glow: new MeshBasicMaterial({ color: new Color('#dfe6ee').multiplyScalar(1.4) }),
      ember: new MeshBasicMaterial({ color: new Color('#c9c3b8').multiplyScalar(1.8) }),
    }),
    [],
  );
}
type Parts = ReturnType<typeof useParts>;

interface Rig {
  root: Group;
  body: Group;
  chest: Group;
  head: Group;
  hipL: Group;
  kneeL: Group;
  hipR: Group;
  kneeR: Group;
  shL: Group;
  elL: Group;
  shR: Group;
  elR: Group;
}

const HIP = 0.94; // hip height for a 1.78 m figure
const THIGH = 0.45;
const SHIN = 0.45;

function Leg({ parts, mat, side, set }: { parts: Parts; mat: MeshStandardMaterial; side: 1 | -1; set: (hip: Group | null, knee: Group | null) => void }) {
  const hip = useRef<Group>(null);
  const knee = useRef<Group>(null);
  useEffect(() => set(hip.current, knee.current), [set]);
  return (
    <group ref={hip} position={[side * 0.095, HIP, 0]}>
      <mesh geometry={parts.thigh} material={mat} position={[0, -THIGH / 2, 0]} castShadow />
      <group ref={knee} position={[0, -THIGH, 0]}>
        <mesh geometry={parts.shin} material={mat} position={[0, -SHIN / 2, 0]} castShadow />
        <mesh geometry={parts.foot} material={parts.dark} position={[0, -SHIN + 0.0, 0.06]} castShadow />
      </group>
    </group>
  );
}

function Arm({ parts, mat, side, set, children }: { parts: Parts; mat: MeshStandardMaterial; side: 1 | -1; set: (sh: Group | null, el: Group | null) => void; children?: React.ReactNode }) {
  const sh = useRef<Group>(null);
  const el = useRef<Group>(null);
  useEffect(() => set(sh.current, el.current), [set]);
  return (
    <group ref={sh} position={[side * 0.21, 0.4, 0]}>
      <mesh geometry={parts.upper} material={mat} position={[0, -0.15, 0]} castShadow />
      <group ref={el} position={[0, -0.3, 0]}>
        <mesh geometry={parts.fore} material={mat} position={[0, -0.14, 0]} castShadow />
        <mesh geometry={parts.head} material={parts.skin} position={[0, -0.3, 0]} scale={0.38} />
        {children}
      </group>
    </group>
  );
}

function Figure({ def, parts, register }: { def: PersonDef; parts: Parts; register: (r: Rig) => void }) {
  const r = useRef<Partial<Rig>>({});
  const look: Look = def.look;
  const mat = parts.mats[look.shade];
  const s = look.height / 1.78;
  const done = () => {
    if (Object.keys(r.current).length === 12) register(r.current as Rig);
  };
  const g = (k: keyof Rig) => (o: Group | null) => {
    if (o) {
      r.current[k] = o;
      done();
    }
  };
  const activity = def.b.kind === 'stand' ? def.b.activity : undefined;
  return (
    <group ref={g('root')}>
      <group ref={g('body')} scale={s}>
        <Leg parts={parts} mat={mat} side={-1} set={(h, k) => { if (h && k) { r.current.hipL = h; r.current.kneeL = k; done(); } }} />
        <Leg parts={parts} mat={mat} side={1} set={(h, k) => { if (h && k) { r.current.hipR = h; r.current.kneeR = k; done(); } }} />
        <mesh geometry={parts.pelvis} material={mat} position={[0, HIP + 0.02, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1.05, 0.8]} castShadow />
        <group ref={g('chest')} position={[0, HIP + 0.08, 0]}>
          <mesh geometry={parts.chest} material={mat} position={[0, 0.24, 0]} scale={[1.22, 1, 0.72]} castShadow />
          {look.build === 'coat' && (
            <mesh geometry={parts.coat} material={mat} position={[0, -0.12, 0]} scale={[1, 1, 0.74]} castShadow />
          )}
          {look.carry === 'backpack' && <mesh geometry={parts.backpack} material={parts.mats[(look.shade + 2) % 4]} position={[0, 0.25, -0.17]} castShadow />}
          <mesh geometry={parts.neck} material={parts.skin} position={[0, 0.5, 0]} />
          <group ref={g('head')} position={[0, 0.58, 0]}>
            <mesh geometry={parts.head} material={parts.skin} position={[0, 0.08, 0.005]} scale={[0.92, 1.08, 1]} castShadow />
            <mesh geometry={parts.head} material={parts.dark} position={[0, 0.12, -0.012]} scale={[0.96, 0.8, 0.98]} />
            {look.hat && (
              <>
                <mesh geometry={parts.hat} material={parts.dark} position={[0, 0.2, 0]} />
                <mesh geometry={parts.brim} material={parts.dark} position={[0, 0.17, 0]} />
              </>
            )}
          </group>
          <Arm parts={parts} mat={mat} side={-1} set={(a, b) => { if (a && b) { r.current.shL = a; r.current.elL = b; done(); } }}>
            {activity === 'phone' && <mesh geometry={parts.phone} material={parts.glow} position={[0.02, -0.3, 0.05]} rotation={[-0.5, 0, 0]} />}
            {look.carry === 'bag' && <mesh geometry={parts.bag} material={parts.dark} position={[-0.06, -0.36, 0]} castShadow />}
          </Arm>
          <Arm parts={parts} mat={mat} side={1} set={(a, b) => { if (a && b) { r.current.shR = a; r.current.elR = b; done(); } }}>
            {activity === 'smoke' && (
              <mesh material={parts.ember} position={[0, -0.32, 0.04]}>
                <sphereGeometry args={[0.008, 6, 4]} />
              </mesh>
            )}
          </Arm>
        </group>
      </group>
      {look.carry === 'suitcase' && (
        // rolled behind on its wheels, right hand on the handle (positioned per frame)
        <group name="suitcase" position={[0.3 * s, 0, -0.45 * s]} rotation={[0.25, 0, 0]}>
          <mesh geometry={parts.suitcase} material={parts.mats[(look.shade + 1) % 4]} position={[0, 0.32, 0]} castShadow />
          <mesh geometry={parts.handle} material={parts.dark} position={[0, 0.82, 0.12]} />
        </group>
      )}
    </group>
  );
}

export function Passengers() {
  const parts = useParts();
  const crowd = useMemo(() => createCrowd(), []);
  const rigs = useRef<(Rig | null)[]>([]);

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
      const r = rigs.current[i];
      if (!r) return;
      const def = crowd.people[i];
      const b = def.b;
      r.root.position.set(st.x, 0, st.z);
      r.root.rotation.y = st.yaw;

      if (b.kind === 'sit') {
        r.body.position.set(0, -0.44, 0);
        r.hipL.rotation.x = r.hipR.rotation.x = -1.5;
        r.kneeL.rotation.x = r.kneeR.rotation.x = 1.45;
        r.chest.rotation.x = 0.08;
        r.shL.rotation.x = r.shR.rotation.x = -0.35;
        r.elL.rotation.x = r.elR.rotation.x = -0.9;
        r.head.rotation.x = 0.3 + Math.sin(t * 0.17) * 0.05;
        r.head.rotation.y = Math.sin(t * 0.11 + 2) * 0.25;
        return;
      }

      const k = clamp(st.speed / 1.1, 0, 1);
      const shuffle = clamp(st.turn / 2, 0, 1) * (1 - k);
      const amp = 0.42 * k + 0.18 * shuffle;
      const ph = st.phase;
      // legs: thigh swing, knee flexes during the forward swing
      r.hipL.rotation.x = Math.sin(ph) * amp;
      r.hipR.rotation.x = -Math.sin(ph) * amp;
      r.kneeL.rotation.x = Math.max(0, -Math.cos(ph)) * 0.7 * (k + shuffle * 0.5);
      r.kneeR.rotation.x = Math.max(0, Math.cos(ph)) * 0.7 * (k + shuffle * 0.5);
      // body: bob twice per stride, slight lean into the walk, idle weight shift
      r.body.position.set(Math.sin(t * 0.37 + i) * 0.012 * (1 - k), Math.abs(Math.cos(ph)) * 0.022 * k - 0.012 * k, 0);
      r.chest.rotation.set(0.06 * k, Math.sin(ph) * 0.06 * k, Math.sin(t * 0.37 + i) * 0.015 * (1 - k));
      // arms swing opposite to legs; elbows always a little bent
      r.shL.rotation.set(-Math.sin(ph) * 0.38 * k, 0, 0.05);
      r.shR.rotation.set(Math.sin(ph) * 0.38 * k, 0, -0.05);
      r.elL.rotation.x = r.elR.rotation.x = -0.2 - 0.15 * k;
      r.head.rotation.set(0.02, Math.sin(t * 0.21 + i * 2) * 0.3 * (1 - k), 0);

      if (def.look.carry === 'suitcase') {
        r.shR.rotation.set(0.42, 0, -0.12);
        r.elR.rotation.x = -0.05;
      }
      if (b.kind === 'stand') {
        if (b.activity === 'phone') {
          r.shL.rotation.set(-0.55, 0.2, 0.15);
          r.elL.rotation.x = -1.35;
          r.head.rotation.x = 0.5;
          r.head.rotation.y = 0;
        }
        if (b.activity === 'smoke') {
          // a slow drag roughly every nine seconds
          const cyc = (t + i * 3) % 9;
          const up = cyc < 2.2 ? Math.sin((cyc / 2.2) * Math.PI) : 0;
          r.shR.rotation.set(-0.25 - up * 0.55, 0, -0.12 - up * 0.25);
          r.elR.rotation.x = -0.4 - up * 1.45;
          r.shL.rotation.set(0.05, 0, 0.12);
          r.elL.rotation.x = -1.4; // arm folded across the body
        }
      }
    });
  });

  return (
    <group>
      {PEOPLE.map((p, i) => (
        <Figure key={p.name} def={p} parts={parts} register={(r) => (rigs.current[i] = r)} />
      ))}
    </group>
  );
}
