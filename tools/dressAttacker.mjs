// Puts the textures from tools/dress_textures.py on the converted walking man, and slims the knife.
// Usage: node tools/dressAttacker.mjs man.glb texDir out.glb knifeIn.glb knifeOut.glb
import fs from 'fs';
import path from 'path';
const core = '/root/.npm/_npx/e1525e0134341f0c/node_modules/@gltf-transform/core/dist/index.js';
const ext = '/root/.npm/_npx/e1525e0134341f0c/node_modules/@gltf-transform/extensions/dist/index.js';
const { NodeIO } = await import(process.env.GLTF_CORE || core);
const { ALL_EXTENSIONS } = await import(process.env.GLTF_EXT || ext);
const [manIn, texDir, manOut, knifeIn, knifeOut] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const doc = await io.read(manIn);
const tex = (file) => {
  const t = doc.createTexture(file).setImage(fs.readFileSync(path.join(texDir, file))).setMimeType(file.endsWith('.png') ? 'image/png' : 'image/jpeg');
  return t;
};
const plan = {
  Topmat: { map: 'top.jpg', normal: 'top_n.jpg' },
  Bottommat: { map: 'bottom.jpg', normal: 'bottom_n.jpg' },
  Shoesmat: { map: 'shoes.jpg' },
  Bodymat: { map: 'body.jpg', normal: 'body_n.jpg' },
  Beardmat: { map: 'beard.png', mask: true },
  Moustachemat: { map: 'moustache.png', mask: true },
};
const cache = new Map();
const once = (f) => (cache.has(f) ? cache.get(f) : (cache.set(f, tex(f)), cache.get(f)));
for (const m of doc.getRoot().listMaterials()) {
  const p = plan[m.getName()];
  if (!p) continue;
  m.setBaseColorTexture(once(p.map)).setRoughnessFactor(0.92).setMetallicFactor(0);
  if (p.normal) m.setNormalTexture(once(p.normal));
  if (p.mask) m.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
}
await io.write(manOut, doc);
console.log(`${manOut}: ${(fs.statSync(manOut).size / 1e6).toFixed(2)} MB`);

// the knife: colour and normal only, 512 px JPEG (made by the python step as knife_*.jpg)
const kd = await io.read(knifeIn);
for (const m of kd.getRoot().listMaterials()) {
  m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setMetallicFactor(0.6).setRoughnessFactor(0.45);
  m.getBaseColorTexture()?.setImage(fs.readFileSync(path.join(texDir, 'knife_c.jpg'))).setMimeType('image/jpeg');
  m.getNormalTexture()?.setImage(fs.readFileSync(path.join(texDir, 'knife_n.jpg'))).setMimeType('image/jpeg');
}
for (const t of kd.getRoot().listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();
await io.write(knifeOut, kd);
console.log(`${knifeOut}: ${(fs.statSync(knifeOut).size / 1e6).toFixed(2)} MB`);
