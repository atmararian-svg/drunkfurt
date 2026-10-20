import {
  Bone,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Raycaster,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fist, merge, paint, place } from './anatomy';
import type { Joints } from './figure';

/**
 * Rigs a static, scanned/sculpted character mesh (a GLB with no skeleton) onto
 * the same joint hierarchy the procedural people use, so every pose, the gait
 * and the arm IK drive it unchanged.
 *
 * Joints are placed at the mesh's measured landmarks (shoulders, elbows,
 * wrists, hips, knees, ankles, neck). Skin weights come from capsule distance:
 * each bone is a segment with a radius, a vertex's distance to it is divided
 * by that radius, and the four nearest bones share the vertex with weights
 * falling off with the fourth power of that normalised distance, so joints
 * bend smoothly but a sleeve never follows the leg it hangs beside.
 *
 * Hands are bound to their own bones, so a clenched fist can replace an open
 * hand: the hand bone collapses into the sleeve and a modelled fist appears.
 */
export type V3 = [number, number, number];

export interface Landmarks {
  /** Mesh height after scaling (metres). */
  height: number;
  hips: V3;
  waist: V3;
  neck: V3;
  headTop: V3;
  shoulder: [V3, V3];
  elbow: [V3, V3];
  wrist: [V3, V3];
  fingertips: [V3, V3];
  hip: [V3, V3];
  knee: [V3, V3];
  ankle: [V3, V3];
  toe: [V3, V3];
  /** Points on the face (bind pose), for fitting the drawn face: [eye -x side, eye +x side, mouth]. */
  face: [V3, V3, V3];
  /**
   * How far the face is bowed (radians, + looks down) and turned (+ towards -x),
   * read off a side and a top view. Depth sampled through a beard and a beanie
   * brim underestimates both, so this, when given, sets the face's orientation.
   */
  faceTilt?: [number, number];
}

export interface MeshRig {
  joints: Joints;
  mesh: SkinnedMesh;
  /** Applies the hand/fist swap after poses set `fistL/R.visible`. */
  sync(): void;
  /** Rotation that turns the modelled head pose (bowed, tilted) into a level, forward-facing one. */
  headFix: Quaternion;
  /** Frame of the face in head-bone space, for a drawn face decal. */
  face: { center: Vector3; x: Vector3; y: Vector3; n: Vector3; eyeGap: number; eyeToMouth: number };
  /** The baked, unskinned geometry in bind space (for decals). */
  bindMesh: Mesh;
}

const v = (a: V3) => new Vector3(...a);

export function rigMesh(gltf: GLTF, L: Landmarks, material: Material, fistMaterial: Material): MeshRig {
  // --- bake the mesh: one geometry, feet on y = 0, scaled to the target height
  let src: Mesh | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh && !src) src = o as Mesh;
  });
  if (!src) throw new Error('rigMesh: no mesh in the model');
  const s = src as Mesh;
  const geo = (s.geometry as BufferGeometry).clone();
  geo.applyMatrix4(s.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const k = L.height / (bb.max.y - bb.min.y);
  geo.translate(0, -bb.min.y, 0);
  geo.scale(k, k, k);
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const bindMesh = new Mesh(geo, new MeshBasicMaterial({ side: DoubleSide }));

  // --- skeleton (joint names and nesting match characters/figure.ts)
  const root = new Group();
  const body = new Group();
  root.add(body);
  const bone = (parent: Object3D, worldPos: Vector3, parentWorld: Vector3) => {
    const b = new Bone();
    b.position.copy(worldPos).sub(parentWorld);
    parent.add(b);
    return b;
  };
  const O = new Vector3();
  const hipsW = v(L.hips);
  const hips = bone(body, hipsW, O);
  const waistW = v(L.waist);
  const spine = bone(hips, waistW, hipsW);
  const neckW = v(L.neck);
  const head = bone(spine, neckW, waistW);
  const arm = (i: 0 | 1) => {
    const shW = v(L.shoulder[i]);
    const elW = v(L.elbow[i]);
    const wrW = v(L.wrist[i]);
    const sh = bone(spine, shW, waistW);
    const el = bone(sh, elW, shW);
    const wr = bone(el, wrW, elW);
    const hand = bone(wr, wrW, wrW);
    return { sh, el, wr, hand };
  };
  const leg = (i: 0 | 1) => {
    const hipW = v(L.hip[i]);
    const kneeW = v(L.knee[i]);
    const ankW = v(L.ankle[i]);
    const hip = bone(hips, hipW, hipsW);
    const knee = bone(hip, kneeW, hipW);
    const ankle = bone(knee, ankW, kneeW);
    return { hip, knee, ankle };
  };
  const A = [arm(0), arm(1)];
  const G = [leg(0), leg(1)];

  // --- capsule skin weights
  interface Seg { bone: Bone; a: Vector3; b: Vector3; r: number }
  const segs: Seg[] = [
    { bone: hips, a: v([L.hips[0], L.hips[1] - 0.14, L.hips[2]]), b: waistW, r: 0.17 },
    { bone: spine, a: waistW, b: v([L.neck[0] * 0.5, L.neck[1] - 0.06, L.neck[2]]), r: 0.2 },
    { bone: head, a: neckW, b: v(L.headTop), r: 0.12 },
  ];
  for (const i of [0, 1] as const) {
    segs.push({ bone: A[i].sh, a: v(L.shoulder[i]), b: v(L.elbow[i]), r: 0.065 });
    segs.push({ bone: A[i].el, a: v(L.elbow[i]), b: v(L.wrist[i]), r: 0.055 });
    segs.push({ bone: A[i].hand, a: v(L.wrist[i]), b: v(L.fingertips[i]), r: 0.05 });
    segs.push({ bone: G[i].hip, a: v(L.hip[i]), b: v(L.knee[i]), r: 0.09 });
    segs.push({ bone: G[i].knee, a: v(L.knee[i]), b: v(L.ankle[i]), r: 0.065 });
    segs.push({ bone: G[i].ankle, a: v(L.ankle[i]), b: v(L.toe[i]), r: 0.06 });
  }
  const bones: Bone[] = [hips, spine, head, ...A.flatMap((a) => [a.sh, a.el, a.wr, a.hand]), ...G.flatMap((g) => [g.hip, g.knee, g.ankle])];
  const index = new Map(bones.map((b, i) => [b, i]));
  const headIndex = index.get(head)!;
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const P = new Vector3();
  const AB = new Vector3();
  const AP = new Vector3();
  const scored: { i: number; w: number }[] = segs.map(() => ({ i: 0, w: 0 }));
  for (let vi = 0; vi < n; vi++) {
    P.fromBufferAttribute(pos, vi);
    segs.forEach((sg, j) => {
      AB.subVectors(sg.b, sg.a);
      AP.subVectors(P, sg.a);
      const t = Math.max(0, Math.min(1, AP.dot(AB) / AB.lengthSq()));
      const d = AP.addScaledVector(AB, -t).length() / sg.r;
      scored[j].i = index.get(sg.bone)!;
      scored[j].w = 1 / (d * d * d * d + 1e-4);
    });
    // a bone may appear in several segments: keep its best score
    const best = new Map<number, number>();
    for (const sc of scored) best.set(sc.i, Math.max(best.get(sc.i) ?? 0, sc.w));
    // the head turns as one piece above the neck (the face decal is rigid on the head bone)
    const h = smooth(L.neck[1] - 0.03, L.neck[1] + 0.05, P.y) * (1 - smooth(0.27, 0.33, Math.hypot(P.x - L.neck[0], P.z - L.neck[2])));
    if (h > 0) {
      let sum0 = 0;
      for (const w of best.values()) sum0 += w;
      for (const [bi, w] of best) best.set(bi, (w / sum0) * (1 - h));
      best.set(headIndex, (best.get(headIndex) ?? 0) + h);
    }
    const top = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, w]) => a + w, 0);
    top.forEach(([bi, w], k2) => {
      si[vi * 4 + k2] = bi;
      sw[vi * 4 + k2] = w / sum;
    });
  }
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));

  const mesh = new SkinnedMesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // bounds change with the pose
  mesh.userData.ink = 'silhouette';
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones), mesh.matrixWorld);

  // --- modelled fists, shown in place of the hands when he clenches
  const fistMesh = (side: -1 | 1) => {
    const m = new Mesh(merge(fist(side, new Color('#625b55')).map((p) => place(p, [0, 0, 0], [0, 0, 0], [0.82, 0.82, 0.82]))), fistMaterial);
    m.userData.ink = 'silhouette';
    m.castShadow = true;
    m.visible = false;
    return m;
  };
  const fistL = fistMesh(-1);
  const fistR = fistMesh(1);
  A[0].wr.add(fistL);
  A[1].wr.add(fistR);
  const handL = new Object3D();
  const handR = new Object3D();

  // --- the face frame from three points on it
  const ray = new Raycaster();
  // depth of the face surface at a point: median of a few rays around it (scans have small holes)
  const hit = (p: V3) => {
    const zs: number[] = [];
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++) {
        ray.set(new Vector3(p[0] + dx * 0.006, p[1] + dy * 0.006, 1), new Vector3(0, 0, -1));
        const h = ray.intersectObject(bindMesh, false)[0];
        if (h) zs.push(h.point.z);
      }
    zs.sort((a, b) => a - b);
    return new Vector3(p[0], p[1], zs.length ? zs[zs.length >> 1] : p[2]);
  };
  const eL = hit(L.face[0]);
  const eR = hit(L.face[1]);
  const mo = hit(L.face[2]);
  const eyeMid = eL.clone().add(eR).multiplyScalar(0.5);
  const fx = eR.clone().sub(eL);
  const eyeGap = fx.length();
  fx.normalize();
  const fy = eyeMid.clone().sub(mo);
  const eyeToMouth = fy.length();
  fy.addScaledVector(fx, -fy.dot(fx)).normalize();
  const fn = new Vector3().crossVectors(fx, fy).normalize();
  if (L.faceTilt) {
    new Matrix4().makeRotationFromEuler(new Euler(L.faceTilt[0], -L.faceTilt[1], 0, 'YXZ')).extractBasis(fx, fy, fn);
  }
  // the head fix turns that face frame back to (x right, y up, z forward)
  const basis = new Matrix4().makeBasis(fx, fy, fn);
  const headFix = new Quaternion().setFromRotationMatrix(basis).invert();

  const joints = {
    root,
    body,
    hips,
    spine,
    head,
    shL: A[0].sh,
    elL: A[0].el,
    wrL: A[0].wr,
    shR: A[1].sh,
    elR: A[1].el,
    wrR: A[1].wr,
    hipL: G[0].hip,
    kneeL: G[0].knee,
    ankleL: G[0].ankle,
    hipR: G[1].hip,
    kneeR: G[1].knee,
    ankleR: G[1].ankle,
    phone: new Object3D(),
    ankleHeight: (L.ankle[0][1] + L.ankle[1][1]) / 2,
    hipsRest: { x: L.hips[0], z: L.hips[2] },
    handL,
    handR,
    fistL,
    fistR,
  } as unknown as Joints;

  const sync = () => {
    A[0].hand.scale.setScalar(fistL.visible ? 0.02 : 1);
    A[1].hand.scale.setScalar(fistR.visible ? 0.02 : 1);
  };

  return {
    joints,
    mesh,
    sync,
    headFix,
    face: { center: eyeMid.clone().sub(neckW), x: fx, y: fy, n: fn, eyeGap, eyeToMouth },
    bindMesh,
  };
}

/** Builds a decal over the face (bind pose) and attaches it to the head bone. */
export function faceDecal(rig: MeshRig, material: Material, size: [number, number], offsetY: number) {
  const f = rig.face;
  const neck = rig.joints.head.position.clone();
  // walk back up the hierarchy to the head bone's bind position in body space
  let o: Object3D | null = rig.joints.head.parent;
  while (o && o !== rig.joints.body) {
    neck.add(o.position);
    o = o.parent;
  }
  const center = f.center.clone().add(neck).addScaledVector(f.y, offsetY);
  const orient = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(f.x, f.y, f.n));
  const g = new DecalGeometry(rig.bindMesh, center, orient, new Vector3(size[0], size[1], 0.1));
  g.translate(-neck.x, -neck.y, -neck.z);
  const m = new Mesh(g, material);
  m.userData.ink = false;
  m.renderOrder = 3;
  rig.joints.head.add(m);
  return m;
}

export const monoMaterial = (map: MeshStandardMaterial['map'], normalMap: MeshStandardMaterial['normalMap']) => {
  const m = new MeshStandardMaterial({ map, normalMap, roughness: 0.92, metalness: 0 });
  m.normalScale.set(0.6, 0.6);
  m.userData.comic = { mono: true, halftone: 0.55 };
  return m;
};
export { paint };
