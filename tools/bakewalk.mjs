// Usage: node tools/bakewalk.mjs path/to/Mr_Man_Walking.fbx src/characters/walkCycle.json
// Bake the Mixamo walk (Mr Man Walking, supplied FBX) into a compact, rig-independent cycle:
// pelvis / chest / head rotations relative to the rest pose, limb directions in character space,
// hip sway, and which foot carries weight. Phase 0 = the -x foot's heel strike.
import fs from 'fs';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
const THREE = await import(new URL('../node_modules/three/build/three.module.js', import.meta.url).href);
const { FBXLoader } = await import(new URL('../node_modules/three/examples/jsm/loaders/FBXLoader.js', import.meta.url).href);
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};
const buf = fs.readFileSync(process.argv[2]);
const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const clip = obj.animations[0];
const B = (n) => obj.getObjectByName('mixamorig' + n);
obj.updateMatrixWorld(true);
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const wp = (o) => o.getWorldPosition(new THREE.Vector3()).multiplyScalar(0.01);
const rest = { hips: wq(B('Hips')), chest: wq(B('Spine2')), head: wq(B('Head')) };
const restDir = (a, b) => wp(B(b)).sub(wp(B(a))).normalize();
const restFoot = { Left: restDir('LeftFoot', 'LeftToeBase'), Right: restDir('RightFoot', 'RightToeBase') };
const mixer = new THREE.AnimationMixer(obj);
mixer.clipAction(clip).play();
// which mocap side is at -x (our "L")
mixer.setTime(0); obj.updateMatrixWorld(true);
const minusX = wp(B('LeftUpLeg')).x < 0 ? 'Left' : 'Right';
const plusX = minusX === 'Left' ? 'Right' : 'Left';
const N = 64;
const T = clip.duration;
const sample = (t) => { mixer.setTime(((t % T) + T) % T); obj.updateMatrixWorld(true); };
// heel strike of the -x foot: the moment its foot comes down to its lowest after swinging
let strike = 0, prevY = 9;
const ys = [];
for (let i = 0; i < 200; i++) { sample((i / 200) * T); ys.push(wp(B(minusX + 'Foot')).y); }
const ground = Math.min(...ys);
for (let i = 1; i < 200; i++) if (ys[i - 1] > ground + 0.012 && ys[i] <= ground + 0.012) strike = (i / 200) * T;
const dir = (a, b) => wp(B(b)).sub(wp(B(a))).normalize().toArray().map((v) => +v.toFixed(4));
const q = (o, r) => wq(o).multiply(r.clone().invert()).toArray().map((v) => +v.toFixed(4));
const frames = [];
let hipsX = 0, hipsY = 0;
for (let i = 0; i < N; i++) {
  sample(strike + (i / N) * T);
  const side = (s) => ({
    thigh: dir(s + 'UpLeg', s + 'Leg'), shin: dir(s + 'Leg', s + 'Foot'),
    // the foot as a rotation away from standing flat (its own rest direction), so any shoe can follow it
    foot: new THREE.Quaternion().setFromUnitVectors(restFoot[s], wp(B(s + 'ToeBase')).sub(wp(B(s + 'Foot'))).normalize()).toArray().map((v) => +v.toFixed(4)),
    upper: dir(s + 'Arm', s + 'ForeArm'), fore: dir(s + 'ForeArm', s + 'Hand'), hand: dir(s + 'Hand', s + 'HandMiddle1'),
    down: +(wp(B(s + 'Foot')).y - ground).toFixed(4), toe: +(wp(B(s + 'ToeBase')).y).toFixed(4),
  });
  const h = wp(B('Hips'));
  hipsX += h.x / N; hipsY += h.y / N;
  frames.push({ hips: q(B('Hips'), rest.hips), chest: q(B('Spine2'), rest.chest), head: q(B('Head'), rest.head), hx: h.x, hy: h.y, L: side(minusX), R: side(plusX) });
}
// stance: the foot is down (ankle within 1.5 cm of its lowest, or the toe on the ground) and moving back
const stance = (s) => frames.map((f, i) => (f[s].down < 0.015 || f[s].toe < 0.03 ? 1 : 0));
frames.forEach((f) => { f.hx = +(f.hx - hipsX).toFixed(4); f.hy = +(f.hy - hipsY).toFixed(4); });
const sL = stance('L'), sR = stance('R');
// stride: how far the planted foot travels per cycle (the clip walks in place)
sample(strike + 0.3 * T); const za = wp(B(minusX + 'Foot')).z;
sample(strike + 0.4 * T); const zb = wp(B(minusX + 'Foot')).z;
const speed = Math.abs(zb - za) / (0.1 * T);
sample(0); const leg = wp(B(minusX + 'UpLeg')).distanceTo(wp(B(minusX + 'Leg'))) + wp(B(minusX + 'Leg')).distanceTo(wp(B(minusX + 'Foot')));
const out = {
  source: 'Mr Man Walking (Mixamo rig), supplied by the project owner; baked by tools/bakewalk.mjs',
  duration: +T.toFixed(4), speed: +speed.toFixed(3), stride: +(speed * T).toFixed(3), leg: +leg.toFixed(3),
  frames: frames.map((f, i) => ({ ...f, L: { ...f.L, stance: sL[i] }, R: { ...f.R, stance: sR[i] } })),
};
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(`minusX=${minusX}; heel strike at ${strike.toFixed(3)} s; speed ${speed.toFixed(2)} m/s; stride ${(speed * T).toFixed(2)} m/cycle; leg ${leg.toFixed(3)} m`);
console.log('stance L ' + sL.join(''));
console.log('stance R ' + sR.join(''));
console.log(`hips sway x ±${Math.max(...frames.map((f) => Math.abs(f.hx))).toFixed(3)} m, bob ±${Math.max(...frames.map((f) => Math.abs(f.hy))).toFixed(3)} m; ${fs.statSync(process.argv[3]).size} bytes`);
