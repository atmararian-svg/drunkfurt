import { useFrame } from '@react-three/fiber';
import { suspend } from 'suspend-react';
import manUrl from '../../assets/man.glb?url';
import knifeUrl from '../../assets/knife.glb?url';
import { Component, ReactNode, useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Mesh, MeshStandardMaterial, Object3D, PointLight, SkinnedMesh, SpotLight, Vector3 } from 'three';
import { loadGlb } from '../../characters/inlineModel';
import { buildMan } from '../../characters/manRig';
import { START_PHASE } from '../../characters/walkClip';
import { lerpAngle } from '../../characters/crowd';
import { smoothstep } from '../../core/math';
import { localProgress } from '../../core/timeline';
import { BEAT, BLOCK, KO, encounter, encounterAt } from './encounter';
import { CLIP, CLIP_FROM, CLIP_LEN, FIGHT_BONES, FIGHT_FRAME, clipAt, fightRow } from './fight';
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
    // two blows (the last two of the animation), the uppercut, then lying on his back where he landed. Before that (the first
    // fraction of a second after your press) his knife hold eases into his guard, below.
    // (clip time: only the last two blows are played, fight.ts)
    const fightT = view.outcome === 'blocked' ? (local >= BEAT.aftermath ? CLIP_LEN : clipAt(t - BLOCK.fight)) : -1;
    if (view.outcome === 'blocked' && (t >= BLOCK.fight || local >= BEAT.aftermath)) {
      root.visible = true;
      root.position.set(FIGHT_FRAME.guard.x, 0, FIGHT_FRAME.guard.z);
      root.rotation.y = FIGHT_FRAME.guard.yaw;
      rig.fight(fightRow('guard', fightT), FIGHT_BONES);
      // the first blow knocks the knife out of his hand; it lies where he stood
      const lost = t >= BLOCK.hit1 || local >= BEAT.aftermath;
      rig.knife.visible = !lost;
      rig.groundKnife.visible = lost;
      rig.groundKnife.position.set(FIGHT_FRAME.guard.x + 0.38, 0.012, FIGHT_FRAME.guard.z + 0.12);
      rig.groundKnife.rotation.set(0, 2.1, 0);
      if (key.current) key.current.intensity = fightT < CLIP.land ? 24 : 0;
      rig.bone('Hips').getWorldPosition(tmp.a);
      encounter.stranger.x = tmp.a.x;
      encounter.stranger.z = tmp.a.z;
      return;
    }
    rig.groundKnife.visible = false;
    if (view.outcome === 'knockedOut' && (t >= KO.dark || local >= BEAT.aftermath)) {
      root.visible = false;
      if (key.current) key.current.intensity = 0;
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

    // you have pressed D: his hold eases into his guard as the clip has it a moment before the second-to-last blow
    if (view.outcome === 'blocked' && t >= 0) rig.fight(fightRow('guard', CLIP_FROM), FIGHT_BONES, smoothstep(ramp(t, 0.05, BLOCK.fight)));

    // --- a key light on his face from the shop windows on your right, so you see who it is
    if (key.current) {
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
      <spotLight ref={key} target={keyTarget} color="#efeadf" intensity={0} angle={0.42} penumbra={0.7} decay={2} distance={9} />
    </>
  );
}

/**
 * Your arms in the fight, seen from your own eyes under the blur: your side of the fight's
 * animation (fight.ts) on a second copy of the walking man, of which only the arms are kept (the
 * jacket's sleeves out from the shoulders, dark, and the hands, closed in fists). He is placed so
 * that his head, as the fight starts, is where your eyes are; the rest of him is not drawn.
 */
export function Fists({ active }: { active: boolean }) {
  const gltf = suspend(() => loadGlb(manUrl), ['drunkfurt-man']);
  const knifeGltf = suspend(() => loadGlb(knifeUrl), ['drunkfurt-knife']);
  const built = useMemo(() => {
    const rig = buildMan(gltf, knifeGltf);
    rig.root.name = 'fists';
    rig.root.visible = false;
    const k = rig.model.scale.x;
    const made: (BufferGeometry | MeshStandardMaterial)[] = [];
    const v = new Vector3();
    // only the arms: triangles whose corners all lie out along the arms in the bind pose (arms out along x)
    const cut = (m: SkinnedMesh, from: number) => {
      const src = m.geometry;
      const pos = src.getAttribute('position');
      const idx = src.getIndex();
      const out: number[] = [];
      const far = (i: number) => Math.abs(v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).x * k) > from;
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        const a = idx ? idx.getX(t) : t;
        const b = idx ? idx.getX(t + 1) : t + 1;
        const c = idx ? idx.getX(t + 2) : t + 2;
        if (far(a) && far(b) && far(c)) out.push(a, b, c);
      }
      const g = new BufferGeometry();
      for (const name of Object.keys(src.attributes)) g.setAttribute(name, src.getAttribute(name));
      g.setIndex(out);
      g.boundingSphere = src.boundingSphere;
      made.push(g);
      m.geometry = g;
    };
    rig.model.traverse((o) => {
      const m = o as SkinnedMesh;
      if (!(m as Mesh).isMesh) return;
      const name = `${m.name} ${(m.material as MeshStandardMaterial).name}`;
      if (m.isSkinnedMesh && /top/i.test(name)) {
        cut(m, 0.21);
        // a dark sleeve, yours (not his tan canvas)
        const mat = new MeshStandardMaterial({ color: '#2b2b2e', roughness: 0.9 });
        mat.userData.comic = { mono: true, halftone: 0.55 };
        made.push(mat);
        m.material = mat;
      } else if (m.isSkinnedMesh && /body/i.test(name) && /^body$/i.test(m.name)) {
        cut(m, 0.6);
      } else m.visible = false; // his head, legs, clothes, beanie, scarf, knife
    });
    // where his head is as the fight starts, in his own frame: put there, your eyes are on it
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    rig.fight(fightRow('puncher', CLIP_FROM), FIGHT_BONES);
    const head = rig.bone('Head').getWorldPosition(new Vector3());
    if (import.meta.env.DEV) (window as unknown as { __fists: unknown }).__fists = rig;
    return { rig, made, head };
  }, [gltf, knifeGltf]);
  useEffect(
    () => () => {
      built.made.forEach((x) => x.dispose());
      built.rig.dispose();
    },
    [built],
  );
  useFrame(() => {
    const { rig, head } = built;
    const local = localProgress('city');
    const v = encounterAt(local);
    // from just after the press (under the blur coming in) until he is down
    const on = active && v.outcome === 'blocked' && local < BEAT.aftermath && v.t >= 0.3 && v.t < BLOCK.land + 0.35;
    rig.root.visible = on;
    if (!on) return;
    const f = FIGHT_FRAME.puncher;
    // his frame turned to face him; then shifted so his head starts at your eyes (head is in that frame, unturned)
    const c = Math.cos(f.yaw);
    const sn = Math.sin(f.yaw);
    const hx = head.x * c + head.z * sn;
    const hz = -head.x * sn + head.z * c;
    rig.root.position.set(CAM.x - hx, CAM.y - head.y, CAM.z - hz);
    rig.root.rotation.y = f.yaw;
    rig.fight(fightRow('puncher', clipAt(v.t - BLOCK.fight)), FIGHT_BONES);
  });
  return <primitive object={built.rig.root} />;
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
    // (dark rather than hidden: a light coming and going makes every material in the street compile again)
    if (light.current) light.current.intensity = active && t >= down ? 9 : 0;
  });
  return <pointLight ref={light} position={[9.1, 2.0, -37.2]} color="#f1ece0" intensity={0} distance={7} decay={2} />;
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
