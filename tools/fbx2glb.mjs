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
const clip = obj.animations[0];
clip.name = 'walk';
const result = await new GLTFExporter().parseAsync(obj, { binary: true, animations: [clip], onlyVisible: false });
fs.writeFileSync(output, Buffer.from(result));
console.log(`wrote ${output}: ${(fs.statSync(output).size / 1e6).toFixed(2)} MB; dropped ${[...drop].join(', ') || 'nothing'}`);
