import { useFrame } from '@react-three/fiber';
import { suspend } from 'suspend-react';
import manUrl from '../../assets/man.glb?url';
import knifeUrl from '../../assets/knife.glb?url';
import { Component, ReactNode, useMemo, useRef } from 'react';
import { CatmullRomCurve3, Group, Object3D, PointLight, SpotLight, TubeGeometry, Vector3 } from 'three';
import { loadGlb } from '../../characters/inlineModel';
import { buildMan } from '../../characters/manRig';
import { START_PHASE } from '../../characters/walkClip';
import { lerpAngle } from '../../characters/crowd';
import { smoothstep } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { BEAT, BLOCK, KO, encounter, encounterAt } from './encounter';
import { cityMaterials } from './cityMaterials';
import { EYE, VISITOR_STOP } from './layout';
import { ramp, routeAt, routeS, walkPace } from './strangerRoute';

/** Where he ends up afterwards: on his back on the pavement (his feet here, his head towards the shops). */
const DOWN = { x: 7.0, z: -36.3, yaw: 0.9 };
export const BAG_SPOT = { x: 6.1, z: -35.3, yaw: 0.7 };
/** Your eyes when he comes at you (the camera at the gate). */
const CAM = new Vector3(VISITOR_STOP[0], EYE, VISITOR_STOP[1]);
const UP = new Vector3(0, 1, 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The stranger: a man who sleeps rough, in a filthy canvas jacket, torn jeans,
 * a knit beanie and a scarf (characters/manRig.ts), with a knife.
 *
 * Everything he does is a function of the scroll position (encounter.ts):
 * he notices you and walks up with his own captured walk, its cycle locked to
 * the distance he covers; stops square in front of you; draws the knife;
 * raises it and holds it on you, the blade pointing up at your face, while he
 * tells you to hand over your bag (a speech balloon, episode.ts). He does not
 * strike. If you defend, the page goes black before anything is shown (the
 * overlay prints the hits); when it opens again he is on the pavement with the
 * knife beside him.
 */
export function Stranger({ active }: { active: boolean; timeScale: () => number }) {
  const gltf = suspend(() => loadGlb(manUrl), ['drunkfurt-man']);
  const knifeGltf = suspend(() => loadGlb(knifeUrl), ['drunkfurt-knife']);
  const rig = useMemo(() => {
    const r = buildMan(gltf, knifeGltf);
    r.root.name = 'stranger';
    if (import.meta.env.DEV) (window as unknown as { __stranger: unknown }).__stranger = r;
    return r;
  }, [gltf, knifeGltf]);
  const tmp = useMemo(() => ({ a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), e: new Vector3() }), []);
  const key = useRef<SpotLight>(null);
  const keyTarget = useMemo(() => new Object3D(), []);

  useFrame(() => {
    if (!active) return;
    const local = localProgress('city');
    const view = encounterAt(local);
    const t = view.t;
    const root = rig.root;

    // after the fight: on the pavement (you defended), or gone (you went down). Only from the moment the
    // page is black, so scrolling back brings him back on his feet.
    if (view.outcome === 'blocked' && (t >= BLOCK.dark || local >= BEAT.aftermath)) {
      root.visible = true;
      root.position.set(DOWN.x, 0, DOWN.z);
      root.rotation.y = DOWN.yaw;
      rig.lie();
      rig.knife.visible = false;
      // the knife where it fell: on the pavement just past his open right hand
      const hand = rig.bone('RightHand').getWorldPosition(tmp.a);
      const out = tmp.b.set(hand.x - root.position.x, 0, hand.z - root.position.z).normalize();
      rig.groundKnife.position.set(hand.x + out.x * 0.16, 0.012, hand.z + out.z * 0.16);
      rig.groundKnife.rotation.set(0, Math.atan2(out.x, out.z) + 0.5, 0);
      rig.groundKnife.visible = true;
      if (key.current) key.current.visible = false;
      encounter.stranger.x = DOWN.x;
      encounter.stranger.z = DOWN.z;
      return;
    }
    rig.groundKnife.visible = false;
    if (view.outcome === 'knockedOut' && (t >= KO.dark || local >= BEAT.aftermath)) {
      root.visible = false;
      if (key.current) key.current.visible = false;
      return;
    }
    root.visible = true;

    // --- where he is: walking his route, then planted and facing you
    const walkU = ramp(local, BEAT.strangerMoves, BEAT.stop);
    const s = routeS(walkU);
    const pos = routeAt(s);
    const squared = ramp(local, BEAT.stop, BEAT.confront + 0.02);
    const toYou = Math.atan2(CAM.x - pos.x, CAM.z - pos.z);
    const doorway = lerp(-Math.PI / 2 + 0.35, toYou, smoothstep(ramp(local, BEAT.noticed, BEAT.strangerMoves)) * 0.6);
    const yaw = walkU < 1 ? lerpAngle(doorway, pos.yaw, smoothstep(ramp(walkU, 0, 0.08))) : lerpAngle(pos.yaw, toYou, smoothstep(squared));

    // --- the threat: the knife comes out at his side, then comes up, held on you
    const draw = smoothstep(ramp(local, BEAT.confront, BEAT.confront + 0.03));
    const raise = smoothstep(ramp(local, BEAT.cock, BEAT.commit));
    root.position.set(pos.x, 0, pos.z);
    root.rotation.y = yaw;

    // --- body: his walk (phase locked to the distance walked), easing into his stance as he stops
    const pace = walkPace(walkU);
    const phase = START_PHASE + (s / rig.stride) * Math.PI * 2;
    rig.stand(phase, pace);
    rig.lean(0.06 * raise);
    root.updateMatrixWorld(true);
    const body = (bx: number, by: number, bz: number, out: Vector3) => out.set(bx, by, bz).applyMatrix4(root.matrixWorld);

    // --- hands: once he squares up, the left hangs ready, the right holds the knife
    const hands = smoothstep(ramp(local, BEAT.stop, BEAT.confront + 0.02));
    if (hands > 0) {
      const leftFK = rig.bone('LeftHand').getWorldPosition(tmp.a);
      const left = body(0.24, 0.98 + 0.08 * raise, 0.16 + 0.06 * raise, tmp.b);
      rig.leftHand(leftFK.lerp(left, hands), body(0.9, -0.6, -0.3, tmp.c).sub(root.position));
      const rightFK = rig.bone('RightHand').getWorldPosition(tmp.a);
      // low at his side, blade forward and down; then held out at chest height, forearm level
      // (the wrist bends about 20°, an easy hold)
      const held = body(-0.24, 0.96, 0.2, tmp.b).lerp(body(-0.26, 1.32, 0.42, tmp.c), raise);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // raised: the blade up and leaning towards you, seen along its length (not end-on)
      const raised = tmp.e.subVectors(CAM, held).normalize().add(UP).normalize();
      const dir = tmp.d.set(fx, -0.35, fz).normalize().lerp(raised, raise).normalize();
      const pole = body(-0.5, -1, -0.5, new Vector3()).sub(root.position);
      rig.rightHand(rightFK.lerp(held, hands), dir, pole, 0.5);
    }
    rig.knife.visible = draw > 0.5;
    rig.grip(draw);
    // his eyes on you from the moment he notices you
    rig.look(CAM, smoothstep(ramp(local, BEAT.noticed, BEAT.strangerMoves)) * lerp(0.6, 0.8, raise));

    // --- a key light on his face from the shop windows on your right, so you see who it is
    if (key.current) {
      key.current.visible = local > BEAT.noticed - 0.02;
      key.current.intensity = 24 * smoothstep(ramp(local, BEAT.noticed - 0.02, BEAT.strangerMoves + 0.05));
      rig.bone('Head').getWorldPosition(keyTarget.position);
      keyTarget.updateMatrixWorld();
      key.current.position.set(CAM.x + 1.6, 2.3, Math.min(CAM.z, keyTarget.position.z + 2.2));
    }
    encounter.stranger.x = root.position.x;
    encounter.stranger.z = root.position.z;
    rig.tip(tmp.a);
    encounter.fist.x = tmp.a.x;
    encounter.fist.y = tmp.a.y;
    encounter.fist.z = tmp.a.z;
  });

  return (
    <>
      <primitive object={rig.root} />
      <primitive object={rig.groundKnife} />
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
  const ref = useMemo(() => Object.assign(new Group(), { name: 'bag' }), []);
  const light = useRef<PointLight>(null);
  useFrame(() => {
    // dropped in the struggle (under the black), and back on your shoulder if you scroll back before it
    const t = encounterAt(localProgress('city')).t;
    const dropped = encounter.outcome === 'knockedOut' ? KO.fallFrom : BLOCK.dark;
    ref.visible = active && t >= dropped;
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
