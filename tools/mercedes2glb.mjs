// Converts the supplied Mercedes-Benz W206 C220 FBX to a lean GLB for the getaway episode.
// Keeps the body, doors (each on its own hinge node), wheels and tyres (each on its hub),
// lights, glass and the cabin; drops the mechanical parts nobody sees (engine, suspension,
// underbody), duplicate variants (panoramic roof, AMG skirts, the second headlight set),
// the inner faces of the glass, and every texture (the comic pipeline prints it in tones).
// Usage: node tools/mercedes2glb.mjs in.fbx out.glb
// then: gltf-transform weld, simplify (--ratio 0.3 --error 0.0005), quantize
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
const [input, output] = process.argv.slice(2);
const buf = fs.readFileSync(input);
const car = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');

const mechanical = /^(etk800|etk_engine|etk_common)/;
const dropNames = new Set([
  'w206_roof_panoramic', 'w206_sunroof_int', 'w206_sideskirts_AMG', 'w206_headlight_L001', 'w206_headlight_R001',
  'w206_headlightglass_L001', 'w206_headlightglass_R001', 'w206_headup', 'w206_headup_speed', 'w206_intmirror001',
  'w206_decals_gauges', 'w206_needle_speedo',
]);
const remove = [];
car.traverse((o) => {
  if (!o.isMesh) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (dropNames.has(o.name) || /_int$/.test(o.name) || mats.every((m) => mechanical.test(m.name))) { remove.push(o); return; }
  // plain materials named after the originals, with their base colour; no textures
  const plain = mats.map((m) => new THREE.MeshStandardMaterial({ name: m.name, color: m.color ? m.color.clone() : 0x808080, roughness: 0.8 }));
  o.material = plain.length === 1 ? plain[0] : plain;
  // no textures, so no texture coordinates
  for (const n of Object.keys(o.geometry.attributes)) if (/^uv/.test(n)) o.geometry.deleteAttribute(n);
});
remove.forEach((o) => o.parent.remove(o));
let tris = 0;
car.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
const result = await new GLTFExporter().parseAsync(car, { binary: true, animations: [], onlyVisible: false });
fs.writeFileSync(output, Buffer.from(result));
console.log(`wrote ${output}: ${(fs.statSync(output).size / 1e6).toFixed(2)} MB, ${Math.round(tris)} triangles; dropped ${remove.length} meshes`);
