import { useFrame } from '@react-three/fiber';
import { suspend } from 'suspend-react';
import manUrl from '../../assets/man.glb?url';
import knifeUrl from '../../assets/knife.glb?url';
import { Component, ReactNode, useEffect, useMemo, useRef } from 'react';
import { Object3D, PointLight, SpotLight, Vector3 } from 'three';
import { loadGlb } from '../../characters/inlineModel';
import { buildMan } from '../../characters/manRig';
import { START_PHASE } from '../../characters/walkClip';
import { lerpAngle } from '../../characters/crowd';
import { smoothstep } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { BEAT, BLOCK, KO, encounter, encounterAt, thirdPerson } from './encounter';
import { CLIP, CLIP_LEN, FIGHT_BONES, FIGHT_FRAME, fightRow } from './fight';
import { EYE, VISITOR_STOP } from './layout';
import { ramp, routeAt, routeS, walkPace } from './strangerRoute';

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
  // this build's resources go with it (the next visit builds a fresh one from its own copy of the model)
  useEffect(() => () => rig.dispose(), [rig]);
  const tmp = useMemo(() => ({ a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), e: new Vector3() }), []);
  const key = useRef<SpotLight>(null);
  const keyTarget = useMemo(() => new Object3D(), []);

  useFrame(() => {
    if (!active) return;
    const local = localProgress('city');
    const view = encounterAt(local);
    const t = view.t;
    const root = rig.root;

    // the fight (you defended, fight.ts): from the moment its clip starts he is the man taking your
    // flurry, then the uppercut, then lying on his back where he landed. Before that (the first
    // fraction of a second after your press) his knife hold eases into his guard, below.
    const fightT = view.outcome === 'blocked' ? (local >= BEAT.aftermath ? CLIP_LEN : t - BLOCK.fight) : -1;
    if (view.outcome === 'blocked' && (t >= BLOCK.fight || local >= BEAT.aftermath)) {
      root.visible = true;
      root.position.set(FIGHT_FRAME.guard.x, 0, FIGHT_FRAME.guard.z);
      root.rotation.y = FIGHT_FRAME.guard.yaw;
      rig.fight(fightRow('guard', fightT), FIGHT_BONES);
      // the first blow knocks the knife out of his hand; it lies where he stood
      const lost = fightT >= CLIP.flurry[0];
      rig.knife.visible = !lost;
      rig.groundKnife.visible = lost;
      rig.groundKnife.position.set(FIGHT_FRAME.guard.x + 0.38, 0.012, FIGHT_FRAME.guard.z + 0.12);
      rig.groundKnife.rotation.set(0, 2.1, 0);
      if (key.current) key.current.visible = fightT < CLIP.land;
      rig.bone('Hips').getWorldPosition(tmp.a);
      encounter.stranger.x = tmp.a.x;
      encounter.stranger.z = tmp.a.z;
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
    // until he sets off he stands upright, feet together; his first steps take him out of it
    rig.stand(phase, pace, 1 - smoothstep(ramp(walkU, 0, 0.04)));
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

    // you have pressed D: his hold eases into the guard he takes against your flurry (the clip's first frame)
    if (view.outcome === 'blocked' && t >= 0) rig.fight(fightRow('guard', 0), FIGHT_BONES, smoothstep(ramp(t, 0.05, BLOCK.fight)));

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

/**
 * You, in the fight: the walking man again, built as you (characters/heroLook.ts), standing where
 * the fight puts you and playing your side of it. You only show while the camera has stepped out
 * of your eyes (`thirdPerson`), fading in and out through the look's dither.
 */
export function Hero({ active }: { active: boolean }) {
  const gltf = suspend(() => loadGlb(manUrl), ['drunkfurt-man']);
  const knifeGltf = suspend(() => loadGlb(knifeUrl), ['drunkfurt-knife']);
  const rig = useMemo(() => {
    const r = buildMan(gltf, knifeGltf, { hero: true });
    r.root.name = 'hero';
    r.root.visible = false;
    if (import.meta.env.DEV) (window as unknown as { __hero: unknown }).__hero = r;
    return r;
  }, [gltf, knifeGltf]);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame(() => {
    const local = localProgress('city');
    const tp = active ? thirdPerson(local) : 0;
    const show = smoothstep(ramp(tp, 0.3, 0.65));
    rig.hero?.fade(show);
    rig.root.visible = show > 0.001;
    if (!rig.root.visible) return;
    const t = encounterAt(local).t;
    rig.root.position.set(FIGHT_FRAME.puncher.x, 0, FIGHT_FRAME.puncher.z);
    rig.root.rotation.y = FIGHT_FRAME.puncher.yaw;
    rig.fight(fightRow('puncher', Math.max(0, t - BLOCK.fight)), FIGHT_BONES);
  });
  return <primitive object={rig.root} />;
}

/**
 * The light from the laundry window that falls across the man once he is on
 * the pavement (from the moment the page goes black, so scrolling back before
 * it leaves the street as it was). Your bag never leaves your shoulder: he
 * tried for it and failed.
 */
export function LaundryLight({ active }: { active: boolean }) {
  const light = useRef<PointLight>(null);
  useFrame(() => {
    const t = encounterAt(localProgress('city')).t;
    const down = encounter.outcome === 'knockedOut' ? KO.fallFrom : BLOCK.land;
    if (light.current) light.current.visible = active && t >= down;
  });
  return <pointLight ref={light} position={[9.1, 2.0, -37.2]} color="#f1ece0" intensity={9} distance={7} decay={2} visible={false} />;
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
