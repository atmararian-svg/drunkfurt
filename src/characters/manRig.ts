import {
  AnimationMixer,
  Bone,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Float32BufferAttribute,
  RepeatWrapping,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { paint } from './anatomy';
import { loft } from './shapes';
import { twoBone } from './feet';

/**
 * The stranger's body: the supplied walking man (a Mixamo-rigged character
 * with his own captured walk), dressed down as a man who sleeps rough
 * (tools/dress_textures.py re-made his clothes from the first scan's fabric),
 * with a knit beanie and a scarf added here, and a knife.
 *
 * Everything is posed from outside, as a pure function of what the story asks
 * for at a moment: the walk at a phase, a planted stance, where his head
 * looks, where his hands are, lying on the pavement. No state is kept between
 * frames, so any scroll position can be reconstructed exactly.
 */
export interface ManRig {
  root: Group;
  /** The model inside the root, scaled to metres. */
  model: Object3D;
  bone: (name: string) => Bone;
  /** The knife in his right hand, and a second one for the pavement. */
  knife: Object3D;
  groundKnife: Object3D;
  /** Pose: the captured walk at `phase` blended over his stance by `walk` (0..1). */
  stand(phase: number, walk: number): void;
  /** Leans his upper body forward from the hips by `a` radians (into a thrust). */
  lean(a: number): void;
  /** Turns head and neck towards a world point (0 not at all … 1 the face square on it). */
  look(target: Vector3, w: number): void;
  /** Right hand to a world point with the blade pointing along `dir`; elbow towards `pole`. */
  rightHand(target: Vector3, dir: Vector3, pole: Vector3): void;
  leftHand(target: Vector3, pole: Vector3): void;
  /** Fingers closed round the knife handle (0 open … 1 gripping). */
  grip(w: number): void;
  /** On his back on the pavement, arms flung out. */
  lie(): void;
  /** Where the blade's tip is (world). */
  tip(out: Vector3): Vector3;
  /** Distance he covers per walk cycle (m), so the cycle can be locked to his route. */
  stride: number;
  /** Phase at which his walk starts from standing (the -x foot under him). */
  startPhase: number;
}

/** Clip time of his walk's -x heel strike and of the stance we take from it (seconds). */
const HEEL_STRIKE = 0.765;
const STANCE_T = 0.8;
/** Height he is scaled to (m). */
export const MAN_HEIGHT = 1.8;
const KNIFE_LENGTH = 0.28;

const knit = (shade: number, rib: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = `rgb(${shade},${shade},${shade})`;
  x.fillRect(0, 0, 128, 128);
  // ribs and stitches, a little irregular
  for (let i = 0; i < 128; i += rib) {
    x.fillStyle = `rgba(0,0,0,${0.18 + ((i * 37) % 7) * 0.02})`;
    x.fillRect(i, 0, Math.max(1, rib / 3), 128);
  }
  for (let k = 0; k < 900; k++) {
    const px = (k * 73) % 128;
    const py = (k * 151) % 128;
    x.fillStyle = `rgba(${k % 2 ? 255 : 0},${k % 2 ? 255 : 0},${k % 2 ? 255 : 0},0.08)`;
    x.fillRect(px, py, 2, 3);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
};

export function buildMan(gltf: GLTF, knifeGltf: GLTF): ManRig {
  const root = new Group();
  const model = gltf.scene;
  root.add(model);
  model.updateMatrixWorld(true);
  // the model is in centimetres, feet on the ground
  let top = 0;
  model.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    top = Math.max(top, m.geometry.boundingBox!.max.y);
  });
  const k = MAN_HEIGHT / (top || 183);
  model.scale.setScalar(k);

  // printed like everyone in the city: tonal bands and halftone in greys; hair cards without ink lines
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isMesh) return;
    const src = m.material as MeshStandardMaterial;
    const cards = src.alphaTest > 0 || src.transparent || /beard|moustache/i.test(src.name);
    const mat = new MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.92, metalness: 0, alphaTest: cards ? 0.4 : 0, side: cards ? DoubleSide : src.side });
    if (mat.normalMap) mat.normalScale.set(0.7, 0.7);
    mat.userData.comic = { mono: true, halftone: 0.55 };
    m.material = mat;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.userData.ink = cards ? false : 'silhouette';
  });

  const bones = new Map<string, Bone>();
  model.traverse((o) => {
    if ((o as Bone).isBone && !bones.has(o.name.replace('mixamorig', ''))) bones.set(o.name.replace('mixamorig', ''), o as Bone);
  });
  const bone = (n: string) => {
    const b = bones.get(n);
    if (!b) throw new Error(`manRig: no bone ${n}`);
    return b;
  };
  const list = [...bones.values()];
  const rest = list.map((b) => b.quaternion.clone());
  const restHips = bone('Hips').position.clone();
  const ankles = [bone('LeftFoot'), bone('RightFoot')];
  root.updateMatrixWorld(true);
  const restAnkle = Math.min(...ankles.map((b) => b.getWorldPosition(new Vector3()).y));

  // --- his walk, sampled at will; and his stance, taken from the walk where both feet are down
  const clip = gltf.animations[0];
  const mixer = new AnimationMixer(model);
  mixer.clipAction(clip).play();
  const snap = () => ({ q: list.map((b) => b.quaternion.clone()), hips: bone('Hips').position.clone() });
  mixer.setTime(STANCE_T);
  const stance = snap();
  // feet a little closer than in mid-stride: the legs part-way back towards standing straight
  ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'].forEach((n) => {
    const i = list.indexOf(bone(n));
    stance.q[i].slerp(rest[i], 0.4);
  });

  // --- what the rest pose tells us: head forward axis, knife placement
  root.updateMatrixWorld(true);
  const restWorld = (b: Object3D) => b.getWorldQuaternion(new Quaternion());
  const headFwd = new Vector3(0, 0, 1).applyQuaternion(restWorld(bone('Head')).invert());
  const neckFwd = new Vector3(0, 0, 1).applyQuaternion(restWorld(bone('Neck')).invert());

  // beanie and scarf, fitted to his head and neck as he stands now (from his skin's own vertices)
  const head = bone('Head');
  const headW = head.getWorldPosition(new Vector3());
  const box = { minX: 9, maxX: -9, minZ: 9, maxZ: -9, top: 0 };
  const v = new Vector3();
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh || !/Body/i.test(m.name + (m.material as MeshStandardMaterial).name)) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      // skinned: where the vertex is in the pose he stands in now, not in the bind pose
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      if (v.y < headW.y + 0.04) continue;
      box.minX = Math.min(box.minX, v.x);
      box.maxX = Math.max(box.maxX, v.x);
      box.minZ = Math.min(box.minZ, v.z);
      box.maxZ = Math.max(box.maxZ, v.z);
      box.top = Math.max(box.top, v.y);
    }
  });
  const hw = (box.maxX - box.minX) / 2 + 0.012;
  const cz = (box.maxZ + box.minZ) / 2;
  const hd = (box.maxZ - box.minZ) / 2;
  const beanieGeo = loft(
    [
      // a turned-up brim across the brow (above the eyes), then the knit crown, a little slack at the top
      { at: box.top - 0.088, w: hw * 2 + 0.008, front: hd * 0.9 + 0.016, back: hd * 1.05 + 0.016, cz },
      { at: box.top - 0.062, w: hw * 2 + 0.01, front: hd * 0.92 + 0.016, back: hd * 1.06 + 0.016, cz },
      { at: box.top - 0.05, w: hw * 2, front: hd * 0.86 + 0.01, back: hd * 1.02 + 0.012, cz },
      { at: box.top - 0.024, w: hw * 1.86, front: hd * 0.8 + 0.008, back: hd * 0.98 + 0.01, cz: cz - 0.004 },
      { at: box.top - 0.004, w: hw * 1.45, front: hd * 0.62, back: hd * 0.76, cz: cz - 0.008 },
    ],
    20,
  );
  const neck = bone('Neck');
  const neckW = neck.getWorldPosition(new Vector3());
  const scarfGeo = loft(
    [
      { at: neckW.y - 0.075, w: 0.27, front: 0.13, back: 0.11, cz: neckW.z + 0.01 },
      { at: neckW.y - 0.03, w: 0.22, front: 0.12, back: 0.1, cz: neckW.z + 0.012 },
      { at: neckW.y + 0.02, w: 0.18, front: 0.1, back: 0.085, cz: neckW.z + 0.006 },
    ],
    18,
  );
  // its end hanging down his chest
  const tail = loft(
    [
      { at: neckW.y - 0.06, w: 0.085, front: 0.016, back: 0.016, cx: -0.045, cz: neckW.z + 0.115 },
      { at: neckW.y - 0.2, w: 0.08, front: 0.014, back: 0.014, cx: -0.05, cz: neckW.z + 0.135 },
      { at: neckW.y - 0.34, w: 0.075, front: 0.012, back: 0.012, cx: -0.055, cz: neckW.z + 0.14 },
    ],
    10,
  );
  const wear = (geo: BufferGeometry, parent: Bone, shade: number, rib: number) => {
    const mat = new MeshStandardMaterial({ map: knit(shade, rib), roughness: 1, vertexColors: true });
    mat.userData.comic = { mono: true, halftone: 0.55 };
    paint(geo, new Color(1, 1, 1));
    // project UVs round the loft so the ribs run vertically
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (Math.atan2(pos.getX(i), pos.getZ(i) - cz) / (Math.PI * 2) + 0.5) * 6;
      uv[i * 2 + 1] = pos.getY(i) * 6;
    }
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    const m = new Mesh(geo, mat);
    m.castShadow = true;
    m.userData.ink = 'silhouette';
    // built in world (rest pose): move into the bone's frame
    m.applyMatrix4(new Matrix4().copy(parent.matrixWorld).invert());
    parent.add(m);
    return m;
  };
  wear(beanieGeo, head, 70, 6);
  wear(scarfGeo, neck, 135, 8);
  wear(tail, bone('Spine2'), 135, 8);

  // --- the knife: handle across his right palm, blade out past the thumb
  const hand = bone('RightHand');
  const makeKnife = () => {
    const kn = knifeGltf.scene.clone(true);
    kn.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const src = m.material as MeshStandardMaterial;
      const mat = new MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.4, metalness: 0.3 });
      mat.userData.comic = { mono: true, halftone: 0.35 };
      m.material = mat;
      m.castShadow = true;
      m.userData.ink = 'silhouette';
    });
    return kn;
  };
  // the knife model runs along x from -1 (pommel) to +1 (tip), the handle from -1 to 0.12
  const handScale = hand.getWorldScale(new Vector3()).x; // metres per hand unit
  const unit = KNIFE_LENGTH / 2 / handScale; // hand units per knife unit
  const knife = new Group();
  const knifeModel = makeKnife();
  knifeModel.scale.setScalar(unit);
  knifeModel.position.set(0.44 * unit, 0, 0); // handle centre on the hand's origin line
  knife.add(knifeModel);
  // hand frame: +y along the fingers, +x across the knuckles towards the thumb, +z out of the palm
  const palm = bone('RightHandMiddle1').position.length() * 0.62;
  knife.position.set(0, palm, 0.022 / handScale);
  knife.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)));
  hand.add(knife);
  knife.visible = false;
  const groundKnife = makeKnife();
  groundKnife.scale.setScalar(KNIFE_LENGTH / 2);
  groundKnife.visible = false;

  // fingers closing round the handle: each phalanx turns towards the palm about its own x axis
  const fingers = ['Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3].map((i) => ({ b: bone(`RightHand${f}${i}`), a: [1.25, 1.45, 0.9][i - 1] })));
  const thumbs = [1, 2, 3].map((i) => ({ b: bone(`RightHandThumb${i}`), a: [0.35, 0.5, 0.6][i - 1] }));
  const QX = new Quaternion();
  const AX = new Vector3(1, 0, 0);
  const AZ = new Vector3(0, 0, 1);

  const QA = new Quaternion();
  const QB = new Quaternion();
  const QP = new Quaternion();
  const D = new Vector3();
  const C = new Vector3();
  const turnWorld = (b: Object3D, q: Quaternion) => {
    b.parent!.getWorldQuaternion(QP);
    b.getWorldQuaternion(QB);
    b.quaternion.copy(QP.invert().multiply(q.multiply(QB)));
    b.updateMatrixWorld(true);
  };

  const rig: ManRig = {
    root,
    model,
    bone,
    knife,
    groundKnife,
    stride: 0,
    startPhase: 0,
    stand(phase, walk) {
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      // from the rest pose every time (the clip does not drive every bone, e.g. fingers), then the walk
      list.forEach((b, i) => b.quaternion.copy(rest[i]));
      mixer.setTime(((((HEEL_STRIKE + (phase / (Math.PI * 2)) * clip.duration) % clip.duration) + clip.duration) % clip.duration));
      if (walk < 1) {
        const w = Math.max(0, walk);
        list.forEach((b, i) => b.quaternion.copy(stance.q[i]).slerp(QA.copy(b.quaternion), w));
        bone('Hips').position.lerpVectors(stance.hips, bone('Hips').position.clone(), w);
        // standing, his legs are straighter than mid-stride: back up onto his feet
        root.updateMatrixWorld(true);
        const low = Math.min(...ankles.map((b) => b.getWorldPosition(D).y));
        model.position.y = (restAnkle - low) * (1 - w);
      }
      root.updateMatrixWorld(true);
    },
    lean(a) {
      if (a === 0) return;
      root.getWorldQuaternion(QA);
      const side = C.set(1, 0, 0).applyQuaternion(QA);
      for (const [n, share] of [['Spine', 0.5], ['Spine1', 0.3], ['Spine2', 0.2]] as const) turnWorld(bone(n), new Quaternion().setFromAxisAngle(side, a * share));
    },
    look(target, w) {
      if (w <= 0) return;
      for (const [b, fwd, share] of [[neck, neckFwd, 0.4], [head, headFwd, 1]] as const) {
        b.getWorldQuaternion(QA);
        const now = C.copy(fwd).applyQuaternion(QA).normalize();
        const want = D.copy(target).sub(b.getWorldPosition(new Vector3())).normalize();
        QB.setFromUnitVectors(now, want);
        turnWorld(b, new Quaternion().slerp(QB, Math.min(1, w) * share));
      }
    },
    rightHand(target, dir, pole) {
      twoBone(bone('RightArm'), bone('RightForeArm'), hand, target, pole);
      // the blade (the hand's +x) along `dir`
      hand.getWorldQuaternion(QA);
      const blade = C.set(1, 0, 0).applyQuaternion(QA).normalize();
      turnWorld(hand, new Quaternion().setFromUnitVectors(blade, D.copy(dir).normalize()));
    },
    leftHand(target, pole) {
      twoBone(bone('LeftArm'), bone('LeftForeArm'), bone('LeftHand'), target, pole);
    },
    grip(w) {
      if (w <= 0) return;
      for (const f of fingers) f.b.quaternion.multiply(QX.setFromAxisAngle(AX, f.a * w));
      for (const f of thumbs) f.b.quaternion.multiply(QX.setFromAxisAngle(AZ, -f.a * w));
      root.updateMatrixWorld(true);
    },
    lie() {
      // the rest pose (arms out), turned onto his back
      list.forEach((b, i) => b.quaternion.copy(rest[i]));
      bone('Hips').position.copy(restHips);
      model.rotation.set(-Math.PI / 2, 0, 0);
      // feet at the root, head away from it; lifted by half his depth so he lies on the pavement
      model.position.set(0, 0.11, 0);
      root.updateMatrixWorld(true);
    },
    tip(out) {
      return knifeModel.localToWorld(out.set(1, 0, 0));
    },
  };
  // distance per cycle: the clip walks in place, 1.70 m per cycle at its own size (centimetres); scaled with him
  rig.stride = 1.7 * (k / 0.01);
  rig.startPhase = 0;
  return rig;
}
