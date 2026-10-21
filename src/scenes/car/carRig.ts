import { Color, DoubleSide, Group, Material, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCluster } from './carCluster';

/**
 * The supplied Mercedes-Benz W206 C220 (tools/mercedes2glb.mjs), set up to be
 * posed from outside like everything else: doors, wheels and lights are
 * functions of the values the episode gives them, nothing is animated by time.
 *
 * What the model provides, and how it is used:
 *  - each door is its own node, placed at its hinge, with its panel, glass and
 *    mirror as children: a door opens by turning that node about the vertical
 *    through its hinge;
 *  - each wheel and each tyre is its own node, placed at its hub: they roll by
 *    turning about the axle (the car's x axis) through the hub;
 *  - the headlights are separate meshes; their lamp materials ("headlight",
 *    "lights_29", the DRL strips) are switched on by the episode, and two spot
 *    lights throw their beams;
 *  - the cabin is complete (seats, dash, steering wheel, instrument cluster),
 *    so the camera can sit in the driver's seat. The cluster's screen carries
 *    the supplied dial graphic with live needles (carCluster.ts); the model's
 *    own small tachometer needle is hidden in favour of it.
 *
 * The model is in centimetres, facing +z, its left (driver's) side on +x.
 */
export interface CarRig {
  root: Group;
  /** Door opening, 0 shut … 1 fully open (front left: the driver's door). */
  door(open: number): void;
  /** Headlights and DRLs, 0 off … 1 on. */
  lights(on: number): void;
  /** Instrument cluster: engine rpm, road speed (km/h), screens on (0 off … 1 on, the ignition), gear and a fresh gear change (1 → 0). */
  cluster(rpm: number, kmh: number, on: number, gear?: number, shift?: number): void;
  /** Rolls the wheels by a distance travelled (m). */
  roll(distance: number): void;
  /** A point in the car's own frame (m, facing +z, driver on +x) to world space. */
  toWorld(local: Vector3, out?: Vector3): Vector3;
}

/** Where the driver's eyes are, in the car's frame (m). */
export const DRIVER_EYE = new Vector3(0.37, 1.12, -0.27);
/** Tyre radius (m). */
export const WHEEL_RADIUS = 0.325;
/** Half length and half width over the body (m), for clearance checks. */
export const CAR_HALF = { length: 2.38, width: 0.92, front: 2.21, rear: 2.55 };
const DOOR_OPEN_ANGLE = (62 * Math.PI) / 180;

const std = (p: ConstructorParameters<typeof MeshStandardMaterial>[0], comic: object | false = { halftone: 0.4 }) => {
  const m = new MeshStandardMaterial(p);
  m.userData.comic = comic;
  return m;
};

/** The car printed like the rest of the city: tones of black, steel and glass; the lamps light up white. */
function palette3() {
  return {
    paint: std({ color: '#1f2023', roughness: 0.28, metalness: 0.55 }, { halftone: 0.35 }),
    trim: std({ color: '#151515', roughness: 0.6 }, { halftone: 0 }),
    chrome: std({ color: '#c4c3bd', roughness: 0.2, metalness: 0.85 }, { halftone: 0 }),
    tyre: std({ color: '#111111', roughness: 0.95 }, { halftone: 0 }),
    rim: std({ color: '#8e8d88', roughness: 0.3, metalness: 0.7 }, { halftone: 0.3 }),
    // tinted glass; rough enough that a street lamp does not print as a hard white dot on it
    glass: new MeshStandardMaterial({ color: '#16181b', roughness: 0.45, metalness: 0.1, transparent: true, opacity: 0.4, depthWrite: false, side: DoubleSide }),
    lampGlass: new MeshStandardMaterial({ color: '#d9dbde', roughness: 0.4, transparent: true, opacity: 0.14, depthWrite: false }),
    housing: std({ color: '#7d7d79', roughness: 0.25, metalness: 0.8 }, { halftone: 0 }),
    leather: std({ color: '#1d1c1b', roughness: 0.75 }, { halftone: 0.45 }),
    cabin: std({ color: '#2b2a29', roughness: 0.6 }, { halftone: 0.4 }),
    mirror: std({ color: '#9a9ca0', roughness: 0.08, metalness: 0.9 }, { halftone: 0 }),
    // lamps: emissive, driven by lights()
    lamp: std({ color: '#3b3b3a', emissive: new Color('#f4f2ea'), emissiveIntensity: 0, roughness: 0.3 }, false),
    tail: std({ color: '#2e2d2c', emissive: new Color('#d8d4cc'), emissiveIntensity: 0, roughness: 0.4 }, false),
    screen: std({ color: '#0d0d0e', emissive: new Color('#c9cbd0'), emissiveIntensity: 0, roughness: 0.2 }, false),
    // the cluster's own panel, under the dial graphic: black glass, so no lit edge shows round the dials
    clusterGlass: std({ color: '#070708', roughness: 0.15 }, false),
  };
}

type Mats = ReturnType<typeof palette3>;

function pick(name: string, mesh: string, m: Mats): Material {
  const n = name.replace(/^w206_/, '');
  if (/^(glass|glass_base)$/.test(n)) return m.glass;
  if (/^(glass_F|glass_head|lightglass_int)$/.test(n)) return m.lampGlass;
  if (/^(headlight|lights_29|drl_[LR]|blue2)$/.test(n)) return m.lamp;
  if (/^(lights_13|lights_global|vehiclelights|leftflash|rightflash|shader_brake|reverese|red$)/.test(n)) return m.tail;
  if (/^tyr/.test(n)) return m.tyre;
  if (/^(chrome|lettering|badge|metallic$|gray_glossy|59)/.test(n)) return /wheel/.test(mesh) ? m.rim : m.chrome;
  if (/^(gauges|gauges_screen)$/.test(n)) return m.clusterGlass;
  if (n === 'screen') return m.screen;
  if (/mirror/.test(n)) return m.mirror;
  if (/^(trim|plast_rgb|grill|grille|bonnetback)/.test(n)) return m.trim;
  if (/^(leather|cinture|airbag|perf)/.test(n)) return m.leather;
  if (/^(paint|color1|color2|color4)$/.test(n)) {
    // the same two colour slots are used outside (body) and inside (trim on the seats and dash)
    return /seat|dash|steer|intcarpet|doorpanel|intmirror|signal|pedal|roof/.test(mesh) ? m.cabin : m.paint;
  }
  return m.cabin;
}

export function buildCar(gltf: GLTF): CarRig {
  const root = new Group();
  const model = gltf.scene;
  model.scale.setScalar(0.01);
  root.add(model);
  const m = palette3();

  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    // the mesh name is on the node above the primitives
    const owner = (mesh.name.startsWith('w206') ? mesh.name : mesh.parent?.name) ?? '';
    const src = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[];
    // the model's own material names, kept in case the car is built again from the same loaded model
    const names: string[] = (mesh.userData.srcMats ??= src.map((s) => s.name));
    const mats = names.map((n) => pick(n, owner, m));
    mesh.material = mats.length === 1 ? mats[0] : mats;
    const see = mats.every((x) => (x as MeshStandardMaterial).transparent);
    mesh.castShadow = !see;
    mesh.receiveShadow = !see;
    // ink lines on the body; none on the cabin's small parts, the lamps and the glass
    mesh.userData.ink = see || /seat|dash|steer|gauge|needle|pedal|signal|intmirror|doorpanel|screen/.test(owner) ? false : true;
  });

  const node = (n: string) => {
    const o = model.getObjectByName(n);
    if (!o) throw new Error(`carRig: no ${n}`);
    return o;
  };

  // doors: turn about the vertical through the hinge (the node's origin); the driver's door is front left
  const doorFL = node('w206_door_FL');
  const doorRest = doorFL.quaternion.clone();
  const Y = new Vector3(0, 1, 0);
  const qd = new Quaternion();

  // wheels and tyres: roll about the axle through the hub
  const wheels = ['w206_wheel_18x9', 'w206_wheel_18x9001', 'w206_wheel_18x9002', 'w206_wheel_18x9003', 'w206_tire18', 'w206_tire18001', 'w206_tire18002', 'w206_tire18003'].map((n) => {
    const o = node(n);
    return { o, rest: o.quaternion.clone() };
  });
  const X = new Vector3(1, 0, 0);
  const qw = new Quaternion();

  // the cluster: the supplied dials on the car's own cluster screen; the model's needle gives way to them
  node('w206_needle_tacho').visible = false;
  const dials = buildCluster();
  root.add(dials.mesh);

  const toWorld = (local: Vector3, out = new Vector3()) => root.localToWorld(out.copy(local));

  return {
    root,
    toWorld,
    door(open) {
      // the driver's door swings out, away from the car (towards +x)
      doorFL.quaternion.copy(qd.setFromAxisAngle(Y, -DOOR_OPEN_ANGLE * open)).multiply(doorRest);
    },
    lights(on) {
      m.lamp.emissiveIntensity = 2.4 * on;
      m.tail.emissiveIntensity = 0.9 * on;
    },
    cluster(rpm, kmh, on, gear, shift) {
      // the centre screen glows softly, so the eye goes to the cluster
      m.screen.emissiveIntensity = 0.22 * on;
      dials.set(rpm, kmh, on, gear, shift);
    },
    roll(distance) {
      const a = distance / WHEEL_RADIUS;
      for (const w of wheels) w.o.quaternion.copy(qw.setFromAxisAngle(X, a)).multiply(w.rest);
    },
  };
}
