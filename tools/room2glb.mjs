// Converts the supplied surveillance room (Sketchfab "Surveillance room" by wa_rouk) for
// episode 4. Usage: node tools/room2glb.mjs src.glb texDir out.glb
// then: gltf-transform weld, simplify and quantize (see README, Episode 04).
//
//  - Bakes every node transform into the geometry (one root, world coordinates, metres,
//    y up, floor at y = -2.89 as in the model).
//  - Cuts out the centre of the monitor wall: the six screens of the middle three
//    columns × middle two rows, their housings and arms, and the cables in that block
//    (x 1.42..3.24, y -1.80..-0.70, z -0.15..0.60). The episode puts one large display
//    there (RoomScene.tsx); the pillars behind it stay.
//  - Splits the screens' mesh (the model's "Lumires", all screens in one) into one mesh
//    per screen, named screen_NN, each with planar texture coordinates across its face,
//    so each can light and dim on its own. The small glowing parts (LEDs) become "leds".
//  - Replaces the three baked-light atlases with the grey ones from tools/room_textures.py.
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
const buffer = root.listBuffers()[0];

const CUT = { x0: 1.42, x1: 3.24, y0: -1.8, y1: -0.7, z0: -0.15, z1: 0.6 };
const inCut = (x, y, z) => x > CUT.x0 && x < CUT.x1 && y > CUT.y0 && y < CUT.y1 && z > CUT.z0 && z < CUT.z1;

// 4x4 (column-major) helpers
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const mulDir = (m, v) => {
  const r = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  const l = Math.hypot(...r) || 1;
  return r.map((x) => x / l);
};

const scene = root.listScenes()[0];
const flat = doc.createNode('room');
const made = [];
const accessor = (array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(buffer);

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION').getArray();
    const N = prim.getAttribute('NORMAL')?.getArray();
    const T = prim.getAttribute('TEXCOORD_0')?.getArray();
    const I = prim.getIndices().getArray();
    const mat = prim.getMaterial();
    const count = P.length / 3;
    const W = new Float32Array(P.length);
    const WN = new Float32Array(P.length);
    for (let i = 0; i < count; i++) {
      W.set(mul(m, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]), i * 3);
      if (N) WN.set(mulDir(m, [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]), i * 3);
    }
    const isScreens = mat?.getName() === 'Lumires';
    // triangles kept (outside the cut block)
    const keep = [];
    for (let t = 0; t < I.length; t += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        cx += W[I[t + k] * 3] / 3;
        cy += W[I[t + k] * 3 + 1] / 3;
        cz += W[I[t + k] * 3 + 2] / 3;
      }
      if (mat?.getName() !== 'material' && inCut(cx, cy, cz)) continue;
      keep.push(I[t], I[t + 1], I[t + 2]);
    }
    if (!isScreens) {
      const p = doc.createPrimitive().setMaterial(mat)
        .setAttribute('POSITION', accessor(W, 'VEC3'))
        .setIndices(accessor(new Uint32Array(keep), 'SCALAR'));
      if (N) p.setAttribute('NORMAL', accessor(WN, 'VEC3'));
      if (T) p.setAttribute('TEXCOORD_0', accessor(new Float32Array(T), 'VEC2'));
      const nm = doc.createMesh(`${mat?.getName() ?? 'mesh'}_${made.length}`).addPrimitive(p);
      made.push(doc.createNode(nm.getName()).setMesh(nm));
      console.log(`${nm.getName()}: ${I.length / 3} → ${keep.length / 3} triangles`);
      continue;
    }
    // the screens: connected pieces (vertices welded by position), one mesh each
    const key = new Map();
    const rep = new Int32Array(count);
    for (let i = 0; i < count; i++) {
      const k = `${W[i * 3].toFixed(4)},${W[i * 3 + 1].toFixed(4)},${W[i * 3 + 2].toFixed(4)}`;
      if (!key.has(k)) key.set(k, i);
      rep[i] = key.get(k);
    }
    const par = Int32Array.from({ length: count }, (_, i) => i);
    const find = (a) => {
      while (par[a] !== a) a = par[a] = par[par[a]];
      return a;
    };
    for (let t = 0; t < keep.length; t += 3) {
      const a = find(rep[keep[t]]);
      par[find(rep[keep[t + 1]])] = a;
      par[find(rep[keep[t + 2]])] = a;
    }
    const groups = new Map();
    for (let t = 0; t < keep.length; t += 3) {
      const g = find(rep[keep[t]]);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(keep[t], keep[t + 1], keep[t + 2]);
    }
    let screenN = 0;
    const ledTris = [];
    for (const tris of groups.values()) {
      const verts = [...new Set(tris)];
      // area: screens are 0.13 m², the LEDs tiny
      let area = 0;
      for (let t = 0; t < tris.length; t += 3) {
        const a = [0, 1, 2].map((k) => [W[tris[t + k] * 3], W[tris[t + k] * 3 + 1], W[tris[t + k] * 3 + 2]]);
        const u = a[1].map((x, i) => x - a[0][i]);
        const v = a[2].map((x, i) => x - a[0][i]);
        area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
      }
      if (area < 0.05) {
        ledTris.push(...tris);
        continue;
      }
      // the screen's face: its normal from the area-weighted triangle normals, its long axis horizontal
      let n = [0, 0, 0];
      for (let t = 0; t < tris.length; t += 3) {
        const a = [0, 1, 2].map((k) => [W[tris[t + k] * 3], W[tris[t + k] * 3 + 1], W[tris[t + k] * 3 + 2]]);
        const u = a[1].map((x, i) => x - a[0][i]);
        const v = a[2].map((x, i) => x - a[0][i]);
        n = [n[0] + u[1] * v[2] - u[2] * v[1], n[1] + u[2] * v[0] - u[0] * v[2], n[2] + u[0] * v[1] - u[1] * v[0]];
      }
      const nl = Math.hypot(...n);
      n = n.map((x) => x / nl);
      let right = [n[2], 0, -n[0]];
      const rl = Math.hypot(...right) || 1;
      right = right.map((x) => x / rl);
      const up = [n[1] * right[2] - n[2] * right[1], n[2] * right[0] - n[0] * right[2], n[0] * right[1] - n[1] * right[0]];
      const map = new Map(verts.map((v, i) => [v, i]));
      const pos = new Float32Array(verts.length * 3);
      const nor = new Float32Array(verts.length * 3);
      const uv = new Float32Array(verts.length * 2);
      const pr = verts.map((v) => [W[v * 3] * right[0] + W[v * 3 + 1] * right[1] + W[v * 3 + 2] * right[2], W[v * 3] * up[0] + W[v * 3 + 1] * up[1] + W[v * 3 + 2] * up[2]]);
      const [u0, u1] = [Math.min(...pr.map((p) => p[0])), Math.max(...pr.map((p) => p[0]))];
      const [v0, v1] = [Math.min(...pr.map((p) => p[1])), Math.max(...pr.map((p) => p[1]))];
      verts.forEach((v, i) => {
        pos.set(W.subarray(v * 3, v * 3 + 3), i * 3);
        nor.set(n, i * 3);
        uv.set([(pr[i][0] - u0) / (u1 - u0), (pr[i][1] - v0) / (v1 - v0)], i * 2);
      });
      const p = doc.createPrimitive().setMaterial(mat)
        .setAttribute('POSITION', accessor(pos, 'VEC3'))
        .setAttribute('NORMAL', accessor(nor, 'VEC3'))
        .setAttribute('TEXCOORD_0', accessor(uv, 'VEC2'))
        .setIndices(accessor(new Uint32Array(tris.map((v) => map.get(v))), 'SCALAR'));
      const name = `screen_${String(screenN++).padStart(2, '0')}`;
      made.push(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)));
    }
    if (ledTris.length) {
      const p = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', accessor(W, 'VEC3')).setIndices(accessor(new Uint32Array(ledTris), 'SCALAR'));
      if (N) p.setAttribute('NORMAL', accessor(WN, 'VEC3'));
      made.push(doc.createNode('leds').setMesh(doc.createMesh('leds').addPrimitive(p)));
    }
    console.log(`screens: ${screenN} kept (the central six cut), LED triangles ${ledTris.length / 3}`);
  }
}
// replace the scene's tree with the flattened one
for (const n of scene.listChildren()) scene.removeChild(n);
for (const n of made) flat.addChild(n);
scene.addChild(flat);
for (const n of root.listNodes()) if (n !== flat && !made.includes(n)) n.dispose();
for (const m of root.listMeshes()) if (!made.some((n) => n.getMesh() === m)) m.dispose();
for (const a of root.listAccessors()) if (!a.listParents().some((p) => p.propertyType !== 'Root')) a.dispose();

// size: the normals are recomputed when the room loads (RoomScene.tsx), and the cables lose their
// texture coordinates and atlas (they are printed in one flat tone), so the simplifier can weld
// and thin them; without that their texture seams keep every vertex
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    prim.setAttribute('NORMAL', null);
    if (prim.getMaterial()?.getName() === 'Shading2_cables') prim.setAttribute('TEXCOORD_0', null);
  }
}
const cableMat = root.listMaterials().find((m) => m.getName() === 'Shading2_cables');
cableMat?.setBaseColorTexture(null).setEmissiveTexture(null);
for (const t of root.listTextures()) if (!t.listParents().some((p) => p.propertyType !== 'Root')) t.dispose();
for (const a of root.listAccessors()) if (!a.listParents().some((p) => p.propertyType !== 'Root')) a.dispose();
// grey atlases in place of the yellow ones (floor, then the shading of everything else)
const files = { material: 'floor.jpg', Shading1: 'shading.jpg' };
for (const m of root.listMaterials()) {
  const t = m.getBaseColorTexture() ?? m.getEmissiveTexture();
  if (t && files[m.getName()]) t.setImage(fs.readFileSync(path.join(texDir, files[m.getName()]))).setMimeType('image/jpeg');
}
await io.write(out, doc);
console.log(`${out}: ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
