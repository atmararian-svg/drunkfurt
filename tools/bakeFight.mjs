// Bakes the supplied two-man fight ("rapid punching animation": one man throws a flurry, the other
// guards, takes an uppercut and is thrown onto his back) onto the walking man's Mixamo skeleton,
// for both men, as src/scenes/city/fightClip.json.
//
// The source is an AdvancedSkeleton rig (Maya) whose deform joints carry the baked motion. Each
// mapped joint's world rotation is moved from the source's bind pose onto the man's rest pose
// (q = q_src(t) · q_src_bind⁻¹ · q_man_rest), and then swung so the bone points exactly where
// the source bone points (the two bind poses differ a little), parents first. Stored per frame:
// the hips' position in the model's own space and the local rotation of each mapped bone. The
// frame of reference is each man's own: his hips start over its origin and he faces +z, towards
// the other man (who starts GAP m away, see the log).
//
// Usage: node tools/bakeFight.mjs PunchingPunching.fbx src/assets/man.glb src/scenes/city/fightClip.json
// Needs a three.js whose FBXLoader skips curves of unsupported nodes (0.180 with that guard).
import fs from 'fs';
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
const NM = process.env.THREE_MODULES || new URL('../node_modules/', import.meta.url).pathname;
const THREE = await import(NM + 'three/build/three.module.js');
const { FBXLoader } = await import(NM + 'three/examples/jsm/loaders/FBXLoader.js');
const { GLTFLoader } = await import(NM + 'three/examples/jsm/loaders/GLTFLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
THREE.ImageBitmapLoader.prototype.load = function (url, onLoad) { onLoad?.({ width: 1, height: 1 }); };
console.warn = () => {};
const { Quaternion, Vector3, Matrix4 } = THREE;

const [fbxPath, manPath, outPath] = process.argv.slice(2);
const FPS = 30;
const MAN_HEIGHT = 1.8;
/** The thrown man's travel is shortened to this share, so he lands where the street has room. */
const THROW = 0.55;

// --- source
const fb = fs.readFileSync(fbxPath);
const src = new FBXLoader().parse(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength), '');
const clip = src.animations[0];
const mixer = new THREE.AnimationMixer(src);
const meshes = [];
src.traverse((o) => o.isSkinnedMesh && meshes.push(o));
const PRE = { puncher: '', guard: 'BodyMechanic_Rigv2' };
const skinOf = (pre) => meshes.find((m) => m.skeleton.bones[0].name === pre + 'Root_M');
// bind pose of each source joint (world), from the skin's inverse bind matrices
const bind = {};
for (const [who, pre] of Object.entries(PRE)) {
  const sk = skinOf(pre).skeleton;
  const mw = skinOf(pre).matrixWorld;
  bind[who] = {};
  sk.bones.forEach((b, i) => {
    const m = new Matrix4().copy(sk.boneInverses[i]).invert().premultiply(mw);
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    m.decompose(p, q, s);
    bind[who][b.name.slice(pre.length)] = { p, q };
  });
}

// --- target: the walking man, as the site builds him (feet on the ground, scaled to 1.8 m)
// (its images and textures are left out: only the skeleton and the meshes' extent are needed)
const mb = fs.readFileSync(manPath);
const jsonLen = mb.readUInt32LE(12);
const doc = JSON.parse(mb.subarray(20, 20 + jsonLen).toString('utf8'));
delete doc.images; delete doc.textures; delete doc.samplers;
for (const m of doc.materials || []) { delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; } }
const binChunk = mb.subarray(20 + jsonLen);
let js = Buffer.from(JSON.stringify(doc));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(20);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + binChunk.length, 8);
head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
const glb = Buffer.concat([head, js, binChunk]);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '', res, rej));
const root = new THREE.Group();
const model = gltf.scene;
root.add(model);
model.updateMatrixWorld(true);
let top = 0;
model.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); top = Math.max(top, o.geometry.boundingBox.max.y); } });
model.scale.setScalar(MAN_HEIGHT / (top || 183));
root.updateMatrixWorld(true);
const bone = (n) => model.getObjectByName('mixamorig' + n);
const restLocal = new Map();
model.traverse((o) => o.isBone && restLocal.set(o, o.quaternion.clone()));
const restWorld = new Map();
model.traverse((o) => o.isBone && restWorld.set(o, o.getWorldQuaternion(new Quaternion())));
const restHipsY = bone('Hips').getWorldPosition(new Vector3()).y;

// target bone ← source joint; `to` names the source joint the bone points at (for the swing)
const MAP = [
  ['Hips', 'Root_M', 'Chest_M'],
  ['Spine', 'Spine1_M', 'Chest_M'],
  ['Spine1', null, null], // half-way between Spine and Spine2
  ['Spine2', 'Chest_M', 'Neck_M'],
  ['Neck', 'Neck_M', 'Head_M'],
  ['Head', 'Head_M', null],
  ...['Right', 'Left'].flatMap((side) => {
    const s = side === 'Right' ? '_R' : '_L';
    return [
      [`${side}Shoulder`, `Scapula${s}`, `Shoulder${s}`],
      [`${side}Arm`, `Shoulder${s}`, `Elbow${s}`],
      [`${side}ForeArm`, `Elbow${s}`, `Wrist${s}`],
      [`${side}Hand`, `Wrist${s}`, null],
      [`${side}UpLeg`, `Hip${s}`, `Knee${s}`],
      [`${side}Leg`, `Knee${s}`, `Ankle${s}`],
      [`${side}Foot`, `Ankle${s}`, `Toes${s}`],
    ];
  }),
];
// the child bone each target bone points at, for the swing
const AIM = { Hips: 'Spine2', Spine: 'Spine2', Spine2: 'Neck', Neck: 'Head', RightShoulder: 'RightArm', LeftShoulder: 'LeftArm',
  RightArm: 'RightForeArm', LeftArm: 'LeftForeArm', RightForeArm: 'RightHand', LeftForeArm: 'LeftHand',
  RightUpLeg: 'RightLeg', LeftUpLeg: 'LeftLeg', RightLeg: 'RightFoot', LeftLeg: 'LeftFoot', RightFoot: 'RightToeBase', LeftFoot: 'LeftToeBase' };
const restDir = {};
for (const [name] of MAP) {
  const aim = AIM[name];
  if (!aim) continue;
  const a = bone(name).getWorldPosition(new Vector3());
  const b = bone(aim).getWorldPosition(new Vector3());
  restDir[name] = b.sub(a).normalize();
}

// the puncher's start: his hips over the origin of the fight's frame, facing +z (the source's own axes)
mixer.clipAction(clip).play();
mixer.setTime(0);
src.updateMatrixWorld(true);
const J = (who, n) => src.getObjectByName(PRE[who] + n);
const origin = J('puncher', 'Root_M').getWorldPosition(new Vector3());
const srcHipsY = bind.puncher.Root_M.p.y;
const scale = restHipsY / srcHipsY;
const guardStart = J('guard', 'Root_M').getWorldPosition(new Vector3());
console.log(`scale ${scale.toFixed(4)} m/unit; guard starts ${(guardStart.distanceTo(origin) * scale).toFixed(2)} m away`);

const r3 = (x) => Math.round(x * 1000) / 1000;
const frames = Math.floor(clip.duration * FPS) + 1;
const out = { fps: FPS, frames, gap: r3(Math.hypot(guardStart.x - origin.x, guardStart.z - origin.z) * scale), bones: MAP.map((m) => m[0]), puncher: [], guard: [] };
const Q = new Quaternion(), QP = new Quaternion(), V = new Vector3(), W = new Vector3();
for (let f = 0; f < frames; f++) {
  mixer.setTime(f / FPS);
  src.updateMatrixWorld(true);
  for (const who of ['puncher', 'guard']) {
    // reset the target to rest, then pose parents first
    restLocal.forEach((q, b) => b.quaternion.copy(q));
    // the guard's own frame: over his start, turned to face the puncher along its +z
    if (who === 'guard') {
      root.position.set((guardStart.x - origin.x) * scale, 0, (guardStart.z - origin.z) * scale);
      root.rotation.set(0, Math.PI, 0);
    } else {
      root.position.set(0, 0, 0);
      root.rotation.set(0, 0, 0);
    }
    const hipsW = J(who, 'Root_M').getWorldPosition(new Vector3()).sub(origin).multiplyScalar(scale);
    hipsW.y = J(who, 'Root_M').getWorldPosition(V).y * scale;
    if (who === 'guard') {
      const g0 = guardStart.clone().sub(origin).multiplyScalar(scale);
      hipsW.x = g0.x + (hipsW.x - g0.x) * THROW;
      hipsW.z = g0.z + (hipsW.z - g0.z) * THROW;
      // and thrown less high (the source launches him well over his own height)
      const y0 = guardStart.y * scale;
      if (hipsW.y > y0) hipsW.y = y0 + (hipsW.y - y0) * THROW;
    }
    const hips = bone('Hips');
    root.updateMatrixWorld(true);
    hips.position.copy(hips.parent.worldToLocal(hipsW.clone()));
    // every bone's world rotation first (they depend on the source only), then the locals, parents first
    const world = {};
    for (const [name, sj, aimJ] of MAP) {
      if (!sj) continue;
      const b = bone(name);
      let qW = J(who, sj).getWorldQuaternion(new Quaternion()).multiply(bind[who][sj].q.clone().invert()).multiply(restWorld.get(b));
      if (aimJ && restDir[name]) {
        const want = J(who, aimJ).getWorldPosition(W).sub(J(who, sj).getWorldPosition(V)).normalize();
        const have = restDir[name].clone().applyQuaternion(Q.copy(qW).multiply(restWorld.get(b).clone().invert()));
        qW = new Quaternion().setFromUnitVectors(have, want).multiply(qW);
      }
      world[name] = qW;
    }
    world.Spine1 = world.Spine.clone().slerp(world.Spine2, 0.5);
    for (const [name] of MAP) {
      const b = bone(name);
      b.parent.updateMatrixWorld(true);
      b.parent.getWorldQuaternion(QP);
      b.quaternion.copy(QP.invert().multiply(world[name]));
      b.updateMatrixWorld(true);
    }
    const row = [r3(hips.position.x), r3(hips.position.y), r3(hips.position.z)];
    for (const [name] of MAP) bone(name).quaternion.toArray().forEach((x) => row.push(r3(x)));
    out[who].push(row);
  }
}
// where his feet are lowest over the clip (to keep them on the pavement) is checked in the app
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`wrote ${outPath}: ${frames} frames, ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
