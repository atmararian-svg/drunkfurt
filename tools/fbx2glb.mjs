// Converts the supplied FBX character to a GLB with its skeleton, skin and animation, without
// textures (they are processed separately and added with tools/dressAttacker.mjs).
// Usage: node tools/fbx2glb.mjs in.fbx out.glb [meshes to drop, comma separated]
import fs from 'fs';
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend?.(); }); }
};
const THREE = await import(new URL('../node_modules/three/build/three.module.js', import.meta.url).href);
const { FBXLoader } = await import(new URL('../node_modules/three/examples/jsm/loaders/FBXLoader.js', import.meta.url).href);
const { GLTFExporter } = await import(new URL('../node_modules/three/examples/jsm/exporters/GLTFExporter.js', import.meta.url).href);
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};
const [input, output, dropList = ''] = process.argv.slice(2);
const drop = new Set(dropList.split(',').filter(Boolean));
const buf = fs.readFileSync(input);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const remove = [];
obj.traverse((o) => {
  if (!o.isMesh) return;
  if (drop.has(o.name)) { remove.push(o); return; }
  // plain materials named after the originals; textures are added later
  const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => new THREE.MeshStandardMaterial({ name: m.name, roughness: 0.9 }));
  o.material = mats.length === 1 ? mats[0] : mats;
});
remove.forEach((o) => o.parent.remove(o));
// FBXLoader makes one bone per skin cluster: a joint used by several meshes becomes a chain of
// same-named bones, each child of the last with an identity transform, and only the outermost is
// animated. Every mesh is bound to the outermost, and the inner copies are removed.
const outer = (b) => { while (b.parent?.isBone && b.parent.name === b.name) b = b.parent; return b; };
obj.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  o.bind(new THREE.Skeleton(o.skeleton.bones.map(outer), o.skeleton.boneInverses), o.bindMatrix);
});
const inner = [];
obj.traverse((o) => { if (o.isBone && o.parent?.isBone && o.parent.name === o.name) inner.push(o); });
inner.forEach((o) => o.parent.remove(o));
const clip = obj.animations[0];
clip.name = 'walk';
const result = await new GLTFExporter().parseAsync(obj, { binary: true, animations: [clip], onlyVisible: false });
fs.writeFileSync(output, Buffer.from(result));
console.log(`wrote ${output}: ${(fs.statSync(output).size / 1e6).toFixed(2)} MB; dropped ${[...drop].join(', ') || 'nothing'}`);
