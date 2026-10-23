// Converts the supplied ring (Sketchfab "Stargate" by stale_mud) into the chapter ring's
// asset. Usage: node tools/ring2glb.mjs src.glb texDir out.glb
// then: gltf-transform quantize (see README, Chapter ring).
//
//  - Bakes every transform into the geometry, in the ring's own frame: the ring in the
//    x-y plane, its face towards +z, centred, outer radius 1.
//  - Keeps the outer ring ("gate") and three of the nine chevrons,
//    120 degrees apart (the model's 0, 3 and 6), each with its housing and lens as one
//    mesh, marker_0..2; the other six chevrons and every unlit duplicate are dropped. The
//    inner ring is left out with its symbols (they are modelled into it): the page builds
//    a plain one in its place and engraves its own markings on it (ui/chapterRing.ts).
//  - Textures from texDir (grey JPEGs made from the model's own, see README): gate_base,
//    chev_base, chev_emit. Metal and roughness are plain factors.
import fs from 'fs';
import path from 'path';

const core = '/root/.npm/_npx/e1525e0134341f0c/node_modules/@gltf-transform/core/dist/index.js';
const ext = '/root/.npm/_npx/e1525e0134341f0c/node_modules/@gltf-transform/extensions/dist/index.js';
const { NodeIO, Document } = await import(process.env.GLTF_CORE || core);
const { ALL_EXTENSIONS } = await import(process.env.GLTF_EXT || ext);
const [src, texDir, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();

// 4x4 column-major helpers
const mul4 = (a, b) => {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr] += a[k * 4 + rr] * b[c * 4 + k];
  return r;
};
const inv4 = (m) => {
  // affine inverse (rotation-scale + translation)
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7]) + a[6] * (a[1] * a[5] - a[2] * a[4]);
  const i = [
    (a[4] * a[8] - a[5] * a[7]) / det, -(a[1] * a[8] - a[2] * a[7]) / det, (a[1] * a[5] - a[2] * a[4]) / det,
    -(a[3] * a[8] - a[5] * a[6]) / det, (a[0] * a[8] - a[2] * a[6]) / det, -(a[0] * a[5] - a[2] * a[3]) / det,
    (a[3] * a[7] - a[4] * a[6]) / det, -(a[0] * a[7] - a[1] * a[6]) / det, (a[0] * a[4] - a[1] * a[3]) / det,
  ];
  const t = [m[12], m[13], m[14]];
  const it = [0, 1, 2].map((r) => -(i[r] * t[0] + i[3 + r] * t[1] + i[6 + r] * t[2]));
  return [i[0], i[1], i[2], 0, i[3], i[4], i[5], 0, i[6], i[7], i[8], 0, it[0], it[1], it[2], 1];
};
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const mulDir = (m, v) => {
  const r = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  const l = Math.hypot(...r) || 1;
  return r.map((x) => x / l);
};

const nodes = root.listNodes();
const gateNode = nodes.find((n) => n.getName() === 'gate');
const toGate = inv4(gateNode.getWorldMatrix());
const R = 3.3864;

const out_ = new Document();
const buf = out_.createBuffer();
const acc = (array, type) => out_.createAccessor().setArray(array).setType(type).setBuffer(buf);
const tex = (name) => out_.createTexture(name).setImage(fs.readFileSync(path.join(texDir, `${name}.jpg`))).setMimeType('image/jpeg');
const gateMat = out_.createMaterial('gate').setBaseColorTexture(tex('gate_base')).setMetallicFactor(0.75).setRoughnessFactor(0.5).setDoubleSided(true);
const chevMat = out_.createMaterial('marker')
  .setBaseColorTexture(tex('chev_base'))
  .setEmissiveTexture(tex('chev_emit'))
  .setEmissiveFactor([1, 1, 1])
  .setMetallicFactor(0.7)
  .setRoughnessFactor(0.45)
  .setDoubleSided(true);
const sceneOut = out_.createScene('ring');

/** All primitives of the named nodes' meshes, baked into the ring's frame, as one mesh. */
function bake(name, names, material) {
  const P = [], N = [], T = [], I = [];
  // (the mesh nodes are named after their group and material: chevron003_Chevron_0)
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (!names.some((nm) => node.getName() === `${nm}_${mesh.listPrimitives()[0].getMaterial().getName()}_0`)) continue;
    const m = mul4(toGate, node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      const p = prim.getAttribute('POSITION').getArray();
      const n = prim.getAttribute('NORMAL').getArray();
      const t = prim.getAttribute('TEXCOORD_0').getArray();
      const idx = prim.getIndices().getArray();
      const base = P.length / 3;
      for (let i = 0; i < p.length / 3; i++) {
        P.push(...mul(m, [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]).map((x) => x / R));
        N.push(...mulDir(m, [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]]));
        T.push(t[i * 2], t[i * 2 + 1]);
      }
      for (const k of idx) I.push(base + k);
    }
  }
  if (!P.length) throw new Error(`nothing for ${name}`);
  const prim = out_.createPrimitive()
    .setAttribute('POSITION', acc(new Float32Array(P), 'VEC3'))
    .setAttribute('NORMAL', acc(new Float32Array(N), 'VEC3'))
    .setAttribute('TEXCOORD_0', acc(new Float32Array(T), 'VEC2'))
    .setIndices(acc(new Uint32Array(I), 'SCALAR'))
    .setMaterial(material);
  const node = out_.createNode(name).setMesh(out_.createMesh(name).addPrimitive(prim));
  sceneOut.addChild(node);
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) (lo[a] = Math.min(lo[a], P[i + a])), (hi[a] = Math.max(hi[a], P[i + a]));
  let r0 = 1e9, r1 = 0;
  for (let i = 0; i < P.length; i += 3) (r0 = Math.min(r0, Math.hypot(P[i], P[i + 1]))), (r1 = Math.max(r1, Math.hypot(P[i], P[i + 1])));
  console.log(name, P.length / 3, 'verts', lo.map((x) => x.toFixed(3)), hi.map((x) => x.toFixed(3)), 'radius', r0.toFixed(3), r1.toFixed(3));
}

bake('gate', ['gate'], gateMat);
const sfx = ['', '003', '006'];
sfx.forEach((s, k) => bake(`marker_${k}`, [`chevron${s}`, `chevron_frame${s}`, `chevron_light${s}`], chevMat));
await new NodeIO().write(out, out_);
console.log('wrote', out, fs.statSync(out).size);
