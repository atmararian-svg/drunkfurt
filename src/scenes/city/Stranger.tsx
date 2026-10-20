import { useFrame } from '@react-three/fiber';
import { suspend } from 'suspend-react';
import attackerUrl from '../../assets/attacker.glb?url';
import { Component, ReactNode, useMemo, useRef } from 'react';
import {
  CatmullRomCurve3,
  Group,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  SpotLight,
  TubeGeometry,
  Vector3,
} from 'three';
import { Expression, FACE_WINDOW, calmFace, faceMaterial } from '../../characters/face';
import { Landmarks, faceDecal, monoMaterial, rigMesh } from '../../characters/meshRig';
import { loadGlb } from '../../characters/inlineModel';
import { aimArm } from '../../characters/ik';
import { activityPose, applyPose, dampPose, restPose, walkPose } from '../../characters/pose';
import { clamp, smoothstep } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { BEAT, BLOCK, blockTime, encounter } from './encounter';
import { cityMaterials } from './cityMaterials';
import { EYE, VISITOR_STOP } from './layout';
import { STRANGER_ROUTE } from './strangerRoute';

/** Where he ends up afterwards: on his back, head towards the house fronts. */
const DOWN = { x: 7.3, z: -36.8, yaw: -0.64 };
export const BAG_SPOT = { x: 6.1, z: -35.3, yaw: 0.7 };
const HEIGHT = 1.82;
const SCALE = HEIGHT / 1.75;
/** Your eyes when he swings (the camera at the gate). */
const CAM = new Vector3(VISITOR_STOP[0], EYE, VISITOR_STOP[1]);

const segLen = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const LENS = STRANGER_ROUTE.slice(1).map((p, i) => segLen(STRANGER_ROUTE[i], p));
const ROUTE_LEN = LENS.reduce((a, b) => a + b, 0);

function routeAt(s: number) {
  let i = 0;
  while (i < LENS.length - 1 && s > LENS[i]) s -= LENS[i++];
  const a = STRANGER_ROUTE[i];
  const b = STRANGER_ROUTE[i + 1];
  const u = clamp(s / LENS[i], 0, 1);
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Where his joints are on the model (measured from the mesh, metres, feet on
 * y = 0, facing +z). "L" is the -x side, as in the procedural rig.
 */
const LANDMARKS: Landmarks = {
  height: HEIGHT,
  hips: [0.03, 0.9, 0.0],
  waist: [0.02, 1.02, -0.02],
  neck: [-0.04, 1.55, -0.01],
  headTop: [-0.14, 1.82, 0.02],
  shoulder: [[-0.2, 1.45, -0.03], [0.19, 1.45, 0.0]],
  elbow: [[-0.27, 1.12, -0.08], [0.27, 1.12, 0.01]],
  wrist: [[-0.26, 0.9, -0.02], [0.25, 0.9, 0.08]],
  fingertips: [[-0.24, 0.75, 0.0], [0.22, 0.76, 0.07]],
  hip: [[-0.06, 0.9, -0.02], [0.12, 0.9, 0.02]],
  knee: [[-0.09, 0.49, -0.035], [0.175, 0.49, 0.07]],
  ankle: [[-0.05, 0.1, -0.03], [0.16, 0.1, 0.0]],
  toe: [[-0.06, 0.04, 0.14], [0.19, 0.04, 0.16]],
  face: [[-0.165, 1.632, 0], [-0.098, 1.632, 0], [-0.13, 1.556, 0]],
  faceTilt: [0.68, 0.28],
};

/**
 * The stranger. Late thirties, a bad night behind him: a grey hoodie a size
 * too big over a faded shirt, baggy trousers bunched over scuffed trainers,
 * stubble, a crooked nose and a plaster over one eyebrow.
 *
 * Driven by scroll until the punch: he notices you, comes at you with his eyes
 * on you, stops square in front of you, holds your eye while his face hardens,
 * and winds up. When he commits, the city drops to a tenth of real speed and
 * the punch keeps coming at that speed. Your click starts the block sequence
 * (real time): your guard takes his fist, he recoils, your counter lands, ink.
 */
export function Stranger({ active, timeScale }: { active: boolean; timeScale: () => number }) {
  const gltf = suspend(() => loadGlb(attackerUrl), ['drunkfurt-attacker']);
  const { j, face, rig, headFix } = useMemo(() => {
    // the model's own textures (worn jacket, hoodie, scarf, torn jeans), printed in greys
    let map: MeshStandardMaterial['map'] = null;
    let normalMap: MeshStandardMaterial['normalMap'] = null;
    gltf.scene.traverse((o) => {
      const m = (o as { material?: MeshStandardMaterial }).material;
      if (m && m.map) {
        map = m.map;
        normalMap = m.normalMap;
      }
    });
    const fistMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    fistMat.userData.comic = { mono: true, halftone: 0.55 };
    const rig = rigMesh(gltf, LANDMARKS, monoMaterial(map, normalMap), fistMat);
    // his face, drawn: fitted to the model's eyes and mouth, feathered into his head
    const face = faceMaterial(150, { lines: true, mask: true });
    const sx = rig.face.eyeGap / FACE_WINDOW.eyeGap;
    const sy = rig.face.eyeToMouth / (FACE_WINDOW.eyeY - FACE_WINDOW.mouthY);
    faceDecal(rig, face.material, [FACE_WINDOW.width * sx, FACE_WINDOW.height * sy], (FACE_WINDOW.centerY - FACE_WINDOW.eyeY) * sy);
    // the model stands with his head bowed and tilted; straighten most of that so he can look at you
    const headFix = new Quaternion().slerp(rig.headFix, 0.85);
    return { j: rig.joints, face, rig, headFix };
  }, [gltf]);
  const st = useMemo(
    () => ({ pose: restPose(), target: restPose(), phase: 0, t: 0, last: new Vector3(), primed: false, expr: calmFace(), yaw: -Math.PI / 2 + 0.35 }),
    [],
  );
  const tmp = useMemo(() => ({ v: new Vector3(), a: new Vector3(), b: new Vector3(), c: new Vector3(), pole: new Vector3(), lpole: new Vector3() }), []);
  const key = useRef<SpotLight>(null);
  const keyTarget = useMemo(() => new Object3D(), []);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.05) * timeScale();
    st.t += dt;
    const local = localProgress('city');
    const state = encounter.state;
    const bt = blockTime();

    // Once it is over, it stays over: whatever part of the street you scroll back to, he is
    // either on the pavement where he fell (you blocked) or gone (you went down).
    if (state === 'resolved') {
      j.root.visible = encounter.outcome === 'blocked';
      if (j.root.visible) lieDown();
      if (key.current) key.current.visible = false;
      return;
    }
    j.root.visible = true;
    j.body.rotation.set(0, 0, 0);
    j.body.position.set(0, 0, 0);

    // --- where he is: walking the route, then planted, then lunging
    const walkU = ramp(local, BEAT.strangerMoves, BEAT.stop);
    const s = (1 - Math.pow(1 - walkU, 1.8)) * ROUTE_LEN;
    const pos = routeAt(s);
    const squared = ramp(local, BEAT.stop, BEAT.confront + 0.02);
    const toYou = Math.atan2(CAM.x - pos.x, CAM.z - pos.z);
    let yaw = walkU <= 0 ? st.yaw : walkU < 1 ? pos.yaw : lerp(pos.yaw, toYou, smoothstep(squared));
    if (walkU <= 0) yaw = lerp(-Math.PI / 2 + 0.35, Math.atan2(CAM.x - pos.x, CAM.z - pos.z), smoothstep(ramp(local, BEAT.noticed, BEAT.strangerMoves)) * 0.6);
    st.yaw = yaw;

    // punch progress: wind-up by scroll, the strike itself in (slow) time, the block sequence in real time
    const cock = smoothstep(ramp(local, BEAT.cock, BEAT.commit));
    let punch = encounter.punch; // 0..1, 1 = fist at your guard
    let recoil = 0;
    let hit2 = 0;
    const ko = encounter.outcome === 'knockedOut';
    if (bt >= 0 && ko) {
      // it landed: the arm follows through, then he straightens up and looks down at you
      punch = lerp(1, 0.25, smoothstep(ramp(bt, 0.15, 0.9)));
    } else if (bt >= 0) {
      punch = lerp(encounter.punch, 1, smoothstep(ramp(bt, 0, BLOCK.contact)));
      if (bt > BLOCK.contact + BLOCK.hitStop) {
        recoil = smoothstep(ramp(bt, BLOCK.contact + BLOCK.hitStop, BLOCK.counterLands));
        punch = lerp(1, 0.35, recoil);
      }
      hit2 = smoothstep(ramp(bt, BLOCK.counterLands, BLOCK.counterLands + 0.25));
    }
    const strike = punch > 0 || state !== 'approach' ? 1 : 0;
    // the punch accelerates: slow first third, then fast (the eye reads it as force)
    const drive = Math.pow(punch, 1.6);

    // lunge: weight onto the front foot as the fist goes out; knocked back by the counter
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const lunge = 0.52 * drive * (1 - recoil * 0.5) - 0.12 * recoil - 0.55 * hit2;
    const x = pos.x + fx * lunge;
    const z = pos.z + fz * lunge;
    j.root.position.set(x, 0, z);
    j.root.rotation.y = yaw;
    const moved = st.primed ? Math.hypot(x - st.last.x, z - st.last.z) : 0;
    st.last.set(x, 0, z);
    st.primed = true;
    if (walkU > 0 && walkU < 1) st.phase += (moved / 1.44) * Math.PI * 2;

    // --- body
    const p = st.target;
    activityPose(p, 'pockets', st.t, 731);
    const speed = moved / Math.max(dt, 1e-4);
    const walking = walkU > 0 && walkU < 1 && speed > 0.05;
    if (walking) {
      walkPose(p, st.phase, clamp(speed / 1.2, 0.3, 1), { swing: 0.5, lean: 0.07, stride: 1.0 }, SCALE);
      // shoulders up and a little forward, hands out of the pocket, fists loose
      p.shLr = p.shRr = 0.04;
      p.spinePitch += 0.04;
    }
    if (walkU >= 1) {
      // planted: feet apart, right foot back, weight forward, shoulders hunched
      const sq = smoothstep(squared);
      p.hipLp = -0.12 * sq;
      p.hipLr = 0.1 * sq;
      p.hipRp = 0.22 * sq;
      p.hipRr = 0.08 * sq;
      p.kneeL = 0.18 * sq;
      p.kneeR = 0.12 * sq;
      p.ankleL = -0.06 * sq;
      p.ankleR = -0.3 * sq;
      p.spinePitch = 0.1 * sq;
      p.headPitch = 0.08;
      // menace: shoulders rolled forward, arms off the body, fists
      const menace = smoothstep(ramp(local, BEAT.confront, BEAT.cock));
      p.shLp = -0.15 * menace;
      p.shRp = 0.1 * menace;
      p.shLr = p.shRr = 0.12 * menace;
      p.elL = -0.6 * menace - 0.2;
      p.elR = -0.35 * menace - 0.2;
      p.spineYaw = 0.12 * menace + Math.sin(st.t * 1.7) * 0.015 * menace; // weight rocking
      p.hipsX = 0.02 * menace;
    }
    if (cock > 0 || strike) {
      // wind-up: right shoulder back, weight on the back foot; then the torso whips round
      p.spineYaw = lerp(0.12, 0.38, cock) * (1 - drive) - 0.5 * drive;
      p.pelvisYaw = 0.16 * cock * (1 - drive) - 0.24 * drive;
      p.spinePitch = lerp(0.1, 0.05, cock) + 0.18 * drive - 0.3 * recoil;
      p.kneeL = 0.18 + 0.25 * drive;
      p.hipLp = -0.12 - 0.25 * drive;
      p.hipRp = 0.22 + 0.25 * drive;
      p.kneeR = 0.12 - 0.08 * drive;
      p.ankleR = -0.3 - 0.2 * drive;
      p.headPitch = 0.05 + 0.1 * drive;
    }
    if (hit2 > 0) {
      // the counter: head snaps round, knees go
      p.headYaw = -0.7 * hit2;
      p.headRoll = 0.35 * hit2;
      p.headPitch = -0.3 * hit2;
      p.spinePitch = -0.35 * hit2;
      p.spineYaw += 0.4 * hit2;
      p.kneeL += 0.4 * hit2;
      p.kneeR += 0.3 * hit2;
    }
    // look at you: from the moment he notices, the head turns to you
    const look = smoothstep(ramp(local, BEAT.noticed, BEAT.strangerMoves));
    let rel = Math.atan2(CAM.x - x, CAM.z - z) - yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (hit2 === 0) {
      p.headYaw = lerp(p.headYaw, clamp(rel, -1.2, 1.2) - p.spineYaw * 0.8, look);
      p.headPitch = lerp(p.headPitch, 0.06 + (cock + drive) * 0.06, look);
    }
    dampPose(st.pose, p, bt >= 0 ? 30 : walking ? 30 : 8, dt + (bt >= 0 ? rawDt : 0));
    applyPose(j, st.pose);
    j.head.quaternion.multiply(headFix);

    // --- arms by IK once he squares up: fists placed in the world
    const fists = ramp(local, BEAT.confront + 0.02, BEAT.cock);
    j.fistL.visible = j.fistR.visible = fists > 0.3 || bt >= 0;
    j.handL.visible = j.handR.visible = !j.fistL.visible;
    if (cock > 0 || strike) {
      j.root.updateMatrixWorld(true);
      // in his body frame: x right, y up, z towards you
      const body = (bx: number, by: number, bz: number, out: Vector3) => out.set(bx, by, bz).applyMatrix4(j.root.matrixWorld);
      const cocked = body(0.2, 1.42, -0.08, tmp.a);
      // the target: straight at your face; it stops where your raised guard will be
      const contact = tmp.b.copy(CAM).addScaledVector(tmp.v.set(CAM.x - x, 0, CAM.z - z).normalize(), -0.42).setY(CAM.y - 0.02);
      // if the fist cannot reach, he steps in further: the lunge grows until it can
      j.shR.getWorldPosition(tmp.c);
      const reach = 0.6;
      const short = tmp.c.distanceTo(contact) - reach;
      if (short > 0) {
        const extra = Math.min(0.4, short) * drive;
        j.root.position.x += fx * extra;
        j.root.position.z += fz * extra;
        j.root.updateMatrixWorld(true);
        body(0.2, 1.42, -0.08, cocked);
      }
      // a slight outside arc, like a real cross
      const mid = body(0.22, 1.55, 0.35, tmp.c);
      const u = drive;
      const fistAt = tmp.v.set(0, 0, 0);
      fistAt.addScaledVector(cocked, (1 - u) * (1 - u)).addScaledVector(mid, 2 * u * (1 - u)).addScaledVector(contact, u * u);
      // elbow out and down, in his frame
      tmp.pole.set(0.7, -1, -0.3);
      aimArm(j, 1, fistAt, tmp.pole);
      // the other fist stays up by his chin, pulling back as the right goes out
      const guard = body(-0.1, 1.56 + 0.03 * drive, 0.14 - 0.08 * drive, tmp.a);
      tmp.lpole.set(-0.7, -1, -0.2);
      aimArm(j, -1, guard, tmp.lpole);
    } else if (fists > 0) {
      // fists at his sides, arms tensed
      j.fistL.visible = j.fistR.visible = fists > 0.3;
    }

    rig.sync();

    // --- face: suspicion, then hostility, then the shout of the swing; shock when blocked
    const e: Expression = st.expr;
    const noticed = ramp(local, BEAT.noticed, BEAT.strangerMoves);
    const confront = ramp(local, BEAT.confront, BEAT.cock);
    e.anger = clamp(0.2 + 0.3 * noticed + 0.45 * confront + 0.1 * cock, 0, 1);
    e.sneer = clamp(0.6 * confront + 0.4 * cock, 0, 1) * (1 - recoil);
    e.open = clamp(0.12 * cock + 0.45 * drive, 0, 1) * (1 - recoil) + 0.55 * recoil + 0.3 * hit2;
    e.shock = clamp(recoil * 0.9 + hit2, 0, 1);
    if (bt >= 0 && encounter.outcome === 'knockedOut') {
      // satisfied, a little surprised it was that easy
      e.anger = 0.35;
      e.sneer = 0.7;
      e.open = 0.1;
      e.shock = 0;
      e.lookY = -0.6;
    }
    e.lookX = 0;
    e.lookY = -0.2;
    // a blink now and then while he walks, never once he is in your face
    if (confront < 0.1 && Math.sin(st.t * 0.9) > 0.985) e.anger = Math.min(1, e.anger + 0.6);
    face.set(e);

    // --- a key light on his face from the shop windows on your right, so you see who it is
    if (key.current) {
      key.current.visible = local > BEAT.noticed - 0.02;
      key.current.intensity = 24 * smoothstep(ramp(local, BEAT.noticed - 0.02, BEAT.strangerMoves + 0.05));
      j.head.getWorldPosition(keyTarget.position);
      keyTarget.updateMatrixWorld();
      key.current.position.set(CAM.x + 1.6, 2.3, Math.min(CAM.z, keyTarget.position.z + 2.2));
    }
    encounter.stranger.x = j.root.position.x;
    encounter.stranger.z = j.root.position.z;
    j.wrR.localToWorld(tmp.v.set(0, -0.1, 0));
    encounter.fist.x = tmp.v.x;
    encounter.fist.y = tmp.v.y;
    encounter.fist.z = tmp.v.z;
  });

  function lieDown() {
    j.root.position.set(DOWN.x, 0, DOWN.z);
    j.root.rotation.y = DOWN.yaw;
    const q = restPose();
    Object.assign(q, { shLr: 1.25, shLp: 0, elL: -0.35, shRr: 0.2, shRp: 0.1, elR: -0.6, hipLp: -0.55, kneeL: 1.1, ankleL: 0.35, hipRp: 0.02, kneeR: 0.12, headYaw: 0.8, headPitch: 0 });
    Object.assign(st.pose, q);
    applyPose(j, st.pose);
    j.head.quaternion.multiply(headFix);
    j.hips.position.set(j.hipsRest.x, 0, j.hipsRest.z);
    j.body.position.set(0, 0.2, 0);
    j.body.rotation.set(-Math.PI / 2, 0, 0);
    j.fistL.visible = j.fistR.visible = false;
    j.handL.visible = j.handR.visible = true;
    rig.sync();
    face.set({ anger: 0, sneer: 0, open: 0.35, shock: 0.4, lookX: 0, lookY: 0 });
    if (key.current) key.current.visible = false;
    encounter.stranger.x = DOWN.x;
    encounter.stranger.z = DOWN.z;
  }

  return (
    <>
      <primitive object={j.root} />
      <primitive object={keyTarget} />
      <spotLight ref={key} target={keyTarget} color="#efeadf" intensity={0} angle={0.42} penumbra={0.7} decay={2} distance={9} visible={false} />
    </>
  );
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
    // dropped in the struggle either way, and still there if you scroll back up the street
    ref.visible = active && encounter.state === 'resolved';
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

/**
 * Keeps the city running if his model cannot be built (an old browser, a
 * failed decode): the scene plays on without him instead of going black.
 */
export class StrangerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[Stranger] model failed to load', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
