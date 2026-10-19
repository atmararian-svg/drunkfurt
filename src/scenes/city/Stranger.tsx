import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CatmullRomCurve3, Color, Group, MeshBasicMaterial, MeshStandardMaterial, PointLight, TubeGeometry, Vector3 } from 'three';
import { buildFigure } from '../../characters/figure';
import { activityPose, applyPose, dampPose, restPose, walkPose } from '../../characters/pose';
import { clamp, damp } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { BEAT, encounter } from './encounter';
import { cityMaterials } from './cityMaterials';
import { VISITOR_STOP } from './layout';
import { STRANGER_ROUTE } from './strangerRoute';

/** Where he ends up afterwards: feet towards you, head towards the house fronts. */
const DOWN = { x: 7.3, z: -36.8, yaw: -0.64 };
export const BAG_SPOT = { x: 6.1, z: -35.3, yaw: 0.7 };

const segLen = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const ROUTE_LEN = segLen(STRANGER_ROUTE[0], STRANGER_ROUTE[1]) + segLen(STRANGER_ROUTE[1], STRANGER_ROUTE[2]);

function routeAt(s: number) {
  const l0 = segLen(STRANGER_ROUTE[0], STRANGER_ROUTE[1]);
  const [a, b] = s <= l0 ? [STRANGER_ROUTE[0], STRANGER_ROUTE[1]] : [STRANGER_ROUTE[1], STRANGER_ROUTE[2]];
  const u = s <= l0 ? s / l0 : (s - l0) / segLen(STRANGER_ROUTE[1], STRANGER_ROUTE[2]);
  const x = a[0] + (b[0] - a[0]) * u;
  const z = a[1] + (b[1] - a[1]) * u;
  return { x, z, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

/**
 * The stranger. Waits in a doorway, then walks towards you with intent: a
 * slight hunch, short arm swing, head steady and eyes on you. His approach is
 * tied to scroll and slows as he closes in; at the gate he keeps creeping at a
 * tenth of normal speed and reaches for your bag. Afterwards he is on the
 * ground, off to the side.
 */
export function Stranger({ active, timeScale }: { active: boolean; timeScale: () => number }) {
  const j = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    mat.userData.comic = { halftone: 0.6 };
    return buildFigure(
      { height: 1.82, build: 'average', outfit: 'hoodie', top: 24, bottom: 22, skin: 100, hair: 'cropped' },
      mat,
      new MeshBasicMaterial({ color: new Color('#dfe6ee') }),
    );
  }, []);
  const st = useMemo(() => ({ pose: restPose(), target: restPose(), s: -1, phase: 0, t: 0, back: 0 }), []);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.05) * timeScale();
    st.t += dt;
    const local = localProgress('city');
    const resolved = encounter.state === 'resolved';
    const p = st.target;

    if (resolved && local >= BEAT.cut) {
      // aftermath: flat on his back on the pavement, one arm flung out, one knee up, head turned away.
      // The body group pivots at the hips here, so he lies on the ground instead of rotating around his feet.
      j.root.position.set(DOWN.x, 0, DOWN.z);
      j.root.rotation.y = DOWN.yaw;
      const q = restPose();
      Object.assign(q, { shLr: 1.25, shLp: 0, elL: -0.35, shRr: 0.2, shRp: 0.1, elR: -0.6, hipLp: -0.55, kneeL: 1.1, ankleL: 0.35, hipRp: 0.02, kneeR: 0.12, headYaw: 0.8, headPitch: 0 });
      Object.assign(st.pose, q);
      applyPose(j, st.pose);
      j.hips.position.set(0, 0, 0);
      j.body.position.set(0, 0.11, 0);
      j.body.rotation.set(-Math.PI / 2, 0, 0);
      encounter.stranger.x = DOWN.x;
      encounter.stranger.z = DOWN.z;
      return;
    }
    j.body.rotation.set(0, 0, 0);
    j.body.position.set(0, 0, 0);

    // how far along his route: scroll-driven, decelerating towards you, then creeping
    const u = clamp((local - BEAT.strangerMoves) / (BEAT.gate - BEAT.strangerMoves), 0, 1);
    const eased = 1 - Math.pow(1 - u, 1.7);
    const s = eased * ROUTE_LEN;
    const end = routeAt(ROUTE_LEN);
    const dirX = Math.sin(end.yaw);
    const dirZ = Math.cos(end.yaw);
    let pos = routeAt(s);
    if (encounter.state === 'armed' || encounter.state === 'impact') pos = { x: end.x + dirX * encounter.creep, z: end.z + dirZ * encounter.creep, yaw: end.yaw };
    // thrown back by the strike (real time, under the ink)
    if (encounter.state === 'impact') st.back = Math.min(1, st.back + rawDt * 2.5);
    else st.back = damp(st.back, 0, 6, rawDt);
    const x = pos.x - dirX * st.back * 0.9 + st.back * 0.4;
    const z = pos.z - dirZ * st.back * 0.9;
    const moved = st.s < 0 ? 0 : Math.hypot(x - j.root.position.x, z - j.root.position.z);
    st.s = s;
    st.phase += (moved / 1.44) * Math.PI * 2;
    j.root.position.set(x, 0, z);

    // facing: towards the street while waiting, then along the way to you
    const toVisitor = Math.atan2(VISITOR_STOP[0] - x, VISITOR_STOP[1] - z);
    const waitYaw = -Math.PI / 2 + 0.35;
    const yaw = u > 0 ? pos.yaw : waitYaw;
    j.root.rotation.y = damp(j.root.rotation.y || waitYaw, yaw, 4, dt);

    activityPose(p, 'pockets', st.t, 731);
    const speed = moved / Math.max(dt, 1e-4);
    const k = clamp(speed / 1.1, 0, 1);
    if (u > 0 && u < 1 && k > 0.02) {
      walkPose(p, st.phase, Math.max(0.35, k), { swing: 0.45, lean: 0.1, stride: 0.95 }, 1.82 / 1.75);
      // shoulders up and forward, hands half in the pocket
      p.shLr = p.shRr = 0.03;
      p.elL = Math.min(p.elL, -0.45);
      p.elR = Math.min(p.elR, -0.45);
    }
    // eyes on you, from the moment he decides
    const look = clamp((local - (BEAT.strangerMoves - 0.06)) / 0.06, 0, 1);
    let rel = toVisitor - j.root.rotation.y;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    p.headYaw = p.headYaw * (1 - look) + clamp(rel, -1.1, 1.1) * look;
    p.headPitch = 0.12 * look + p.headPitch * (1 - look);
    p.spinePitch += 0.06 * look;

    if (encounter.state === 'armed' || encounter.state === 'impact') {
      // the reach: right arm out for the bag, weight forward, slow steps
      const reach = clamp(encounter.creep / 0.5, 0, 1);
      walkPose(p, st.phase, 0.4, { swing: 0.3, lean: 0.14, stride: 0.9 }, 1.82 / 1.75);
      p.shRp = -1.05 * reach + p.shRp * (1 - reach);
      p.shRr = 0.12;
      p.elR = -0.3 * reach + p.elR * (1 - reach);
      p.wrRp = 0.25 * reach;
      p.shLp = 0.25;
      p.elL = -0.5;
      p.headPitch = -0.02;
      p.headYaw = rel * 0.8;
    }
    if (encounter.state === 'impact') {
      // recoil
      p.spinePitch = -0.35 * st.back;
      p.shLp = p.shRp = -0.6 * st.back;
      p.shLr = p.shRr = 0.8 * st.back;
      p.headPitch = -0.4 * st.back;
    }
    dampPose(st.pose, p, encounter.state === 'impact' ? 20 : 9, dt + 1e-3);
    applyPose(j, st.pose);
    encounter.stranger.x = x;
    encounter.stranger.z = z;
  });

  return <primitive object={j.root} />;
}

/** The visitor's bag, dropped in the struggle: dark canvas with the yellow strap. */
export function Bag({ active }: { active: boolean }) {
  const m = cityMaterials();
  const strap = useMemo(() => {
    const c = new CatmullRomCurve3([
      new Vector3(-0.2, 0.05, 0.05),
      new Vector3(-0.5, 0.02, 0.3),
      new Vector3(-0.2, 0.015, 0.75),
      new Vector3(0.35, 0.015, 0.7),
      new Vector3(0.5, 0.02, 0.35),
      new Vector3(0.2, 0.05, 0.05),
    ]);
    return new TubeGeometry(c, 40, 0.018, 6, false);
  }, []);
  const ref = useMemo(() => new Group(), []);
  const light = useRef<PointLight>(null);
  useFrame(() => {
    ref.visible = active && encounter.state === 'resolved' && localProgress('city') >= BEAT.cut;
    if (light.current) light.current.visible = ref.visible;
  });
  return (
    <>
    {/* light from the laundry window, falling across the man on the pavement */}
    <pointLight ref={light} position={[9.1, 2.0, -37.2]} color="#f1ece0" intensity={9} distance={7} decay={2} visible={false} />
    <primitive object={ref} position={[BAG_SPOT.x, 0, BAG_SPOT.z]} rotation={[0, BAG_SPOT.yaw, 0]}>
      <mesh material={m.bag} position={[0, 0.07, 0]} rotation={[0, 0, 0.08]} castShadow>
        <boxGeometry args={[0.42, 0.13, 0.32]} />
      </mesh>
      <mesh material={m.bag} position={[0.02, 0.15, 0.03]} rotation={[0.05, 0, 0.1]} scale={[0.22, 0.03, 0.17]}>
        <sphereGeometry args={[1, 16, 8]} />
      </mesh>
      <mesh material={m.bagStrap} geometry={strap} />
    </primitive>
    </>
  );
}
