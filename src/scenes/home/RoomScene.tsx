import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { suspend } from 'suspend-react';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import portfolioUrl from '../../assets/portfolio.webp?url';
import roomUrl from '../../assets/room.glb?url';
import { audio } from '../../audio/AudioDirector';
import { loadGlb } from '../../characters/inlineModel';
import { clamp, damp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { Gate, gates, localProgress } from '../../core/timeline';
import { input } from '../../player/input';
import { postFx } from '../../render/Stylizer';
import { DISPLAY, HOME_BEAT, ROOM_LIFT } from './layout';
import { SCREEN_LINKS, WHITE_AT, WHITE_FROM, flyAt, monitor, overAbout, pick, resetMonitor, solidAt } from './monitor';
import { buildWallScreens } from './roomScreens';

/** The wall screen that shows the text about the author. */
const ABOUT_SCREEN = 'screen_13';

/** The last gate of the story: in the chair, the screen waits for the click. It never opens; the click leaves the story. */
const gate: Gate = { episode: 'home', at: HOME_BEAT.gate, open: false };
gates.push(gate);

/** The screen's picture: the site's home page, decoded from the bundled image (no request). */
function loadPicture(url: string) {
  return new Promise<Texture>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const t = new Texture(img);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      t.minFilter = LinearMipmapLinearFilter;
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = () => reject(new Error('RoomScene: the portfolio picture did not load'));
    img.src = url;
  });
}

/** The room's two assets, decoded once (the preloader starts them early; the world reuses them). */
let modelPromise: ReturnType<typeof loadGlb> | null = null;
let picturePromise: Promise<Texture> | null = null;
const roomModel = () => (modelPromise ??= loadGlb(roomUrl));
const roomPicture = () => (picturePromise ??= loadPicture(portfolioUrl));
/** Loads chapter 3's assets ahead of time (resolves when both are decoded). */
export const preloadRoom = () => Promise.all([roomModel(), roomPicture()]).then(() => undefined);

/**
 * The block of the monitor wall cut out for the big display (tools/room2glb.mjs
 * CUT), a little taller: the conversion kept the triangles whose centre lay
 * just outside the block, thin strips of the old monitors' housings that
 * showed as two bright lines along the display's lower edge (and, hidden
 * behind it, its upper edge). Model coordinates (before ROOM_LIFT).
 */
const CUT = { x0: 1.42, x1: 3.24, y0: -1.87, y1: -0.64, z0: -0.15, z1: 0.6 };

/**
 * Removes the triangles of the room's surfaces left inside CUT, on this copy
 * of the model only: the meshes concerned get their own geometry (returned,
 * to be freed with the copy); the cached model is not touched.
 */
function trimCut(model: Object3D) {
  const made: BufferGeometry[] = [];
  model.updateMatrixWorld(true);
  const v = new Vector3();
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || /^screen_/.test(mesh.name) || mesh.name === 'leds') return;
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const index = geo.getIndex();
    if (!index) return;
    const keep: number[] = [];
    let cut = 0;
    for (let t = 0; t < index.count; t += 3) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, index.getX(t + k)).applyMatrix4(mesh.matrixWorld);
        x += v.x / 3;
        y += v.y / 3;
        z += v.z / 3;
      }
      if (x > CUT.x0 && x < CUT.x1 && y > CUT.y0 && y < CUT.y1 && z > CUT.z0 && z < CUT.z1) cut++;
      else keep.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
    }
    if (!cut) return;
    const own = geo.clone();
    own.setIndex(keep);
    mesh.geometry = own;
    made.push(own);
  });
  return made;
}

/**
 * The supplied room, printed: its baked light (grey atlases from
 * tools/room_textures.py) drives the comic bands as emission, so the room
 * keeps the model's own light and shadow without any lights of its own. The
 * cables and the chairs' steel have no atlas; they take a flat dark tone and
 * the glow of the big screen.
 */
function buildRoom(gltf: GLTF) {
  const root = new Group();
  root.name = 'room';
  root.position.y = ROOM_LIFT;
  // its own copy of the loaded (cached, shared) model, so a second visit starts from it as loaded
  const model = gltf.scene.clone(true);
  const trimmed = trimCut(model);
  root.add(model);
  const printed = (map: Texture | null, comic: object) => {
    if (map) map.colorSpace = SRGBColorSpace;
    const m = new MeshStandardMaterial({ color: '#000000', emissive: new Color('#ffffff'), emissiveMap: map, emissiveIntensity: 0.92, roughness: 1, metalness: 0, side: DoubleSide });
    m.userData.comic = { mono: true, ...comic };
    return m;
  };
  const mats = new Map<string, Material>();
  const steel = new MeshStandardMaterial({ color: '#47484b', roughness: 0.62, metalness: 0.2, side: DoubleSide });
  steel.userData.comic = { mono: true, halftone: 0.5 };
  const led = new MeshBasicMaterial({ color: new Color('#e2bd3a').multiplyScalar(0.85), toneMapped: false });
  led.userData.comic = false;
  const screens: Mesh[] = [];
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
    const src = mesh.material as MeshBasicMaterial;
    const name: string = (mesh.userData.srcMat ??= src.name);
    if (/^screen_/.test(mesh.name)) {
      screens.push(mesh);
      return;
    }
    if (mesh.name === 'leds') {
      mesh.material = led;
      return;
    }
    if (name === 'Shading2_cables') {
      mesh.material = steel;
      return;
    }
    if (!mats.has(name)) mats.set(name, name === 'material' ? printed(src.map, { halftone: 1 }) : printed(src.map, { halftone: 0.7, hatch: true }));
    mesh.material = mats.get(name)!;
    // the floor is one big plane: its edges are not drawing lines
    if (name === 'material') mesh.userData.ink = false;
  });
  screens.sort((a, b) => a.name.localeCompare(b.name));
  // the text about the author goes on the screen right of the big display, low (screen_13), in view from the chair
  const wall = buildWallScreens(screens.length, screens.findIndex((s) => s.name === ABOUT_SCREEN));
  screens.forEach((s, i) => {
    s.material = wall.materials[i];
    s.userData.ink = false;
  });
  // this build's own materials, freed with it
  const dispose = () => {
    mats.forEach((m) => m.dispose());
    trimmed.forEach((g) => g.dispose());
    steel.dispose();
    led.dispose();
  };
  const about = screens.find((s) => s.name === ABOUT_SCREEN) ?? null;
  return { root, wall, dispose, about };
}

/**
 * The large display in place of the six central screens: a flat 16:9 panel in
 * a dark housing on a VESA plate, an arm back to the middle pillar and a cross
 * bar to the pillars either side. Its picture is the portfolio site's home
 * page; the picture is also what the pointer is picked against.
 */
function buildDisplay(picture: Texture) {
  const g = new Group();
  g.name = 'display';
  g.position.copy(DISPLAY.centre);
  g.rotation.x = DISPLAY.tilt;
  const housing = new MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.5, metalness: 0.3 });
  housing.userData.comic = { halftone: 0.35 };
  const mount = new MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.55, metalness: 0.55 });
  mount.userData.comic = { halftone: 0.4, hatch: true };
  const add = (geo: BoxGeometry | PlaneGeometry, mat: Material, x: number, y: number, z: number) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const W = DISPLAY.width + 2 * DISPLAY.bezel;
  const H = DISPLAY.height + 2 * DISPLAY.bezel;
  const d = DISPLAY.depth;
  add(new BoxGeometry(W, H, d), housing, 0, 0, -d / 2);
  // the back: plate, arm to the middle pillar, cross bar to the side pillars
  add(new BoxGeometry(0.34, 0.26, 0.04), mount, 0, 0, -d - 0.02);
  add(new BoxGeometry(0.075, 0.075, 0.6), mount, 0, 0, -d - 0.3);
  add(new BoxGeometry(1.36, 0.06, 0.06), mount, 0.03, 0.02, -d - 0.5);
  // a status lamp on the bezel, the one spot of colour
  const lamp = new MeshBasicMaterial({ color: new Color('#e2bd3a').multiplyScalar(0.9), toneMapped: false });
  lamp.userData.comic = false;
  add(new BoxGeometry(0.012, 0.006, 0.004), lamp, W / 2 - 0.06, -H / 2 + DISPLAY.bezel / 2, 0.001).userData.ink = false;
  // the picture, just proud of the housing
  const glass = new MeshBasicMaterial({ map: picture, toneMapped: false });
  glass.userData.comic = false;
  const screen = add(new PlaneGeometry(DISPLAY.width, DISPLAY.height), glass, 0, 0, 0.002);
  screen.name = 'portfolio-screen';
  screen.userData.ink = false;
  // the link under the pointer, marked on the picture: a faint wash and a thin yellow edge over its card
  const markMat = new MeshBasicMaterial({ color: new Color('#f5d21a'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  markMat.userData.comic = false;
  const mark = add(new PlaneGeometry(1, 1), markMat, 0, 0, 0.004);
  mark.name = 'portfolio-link-mark';
  mark.userData.ink = false;
  mark.visible = false;
  // the colour the picture turns into on the way in (white for the home page, #0D0D0D for a project),
  // a plane exactly over the picture, so the change happens on the screen itself, at its size
  const solidMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  solidMat.userData.comic = false;
  const solid = add(new PlaneGeometry(DISPLAY.width, DISPLAY.height), solidMat, 0, 0, 0.005);
  solid.name = 'portfolio-solid';
  solid.renderOrder = 2;
  solid.userData.ink = false;
  solid.visible = false;
  return { group: g, screen, glass, mark, markMat, solid, solidMat };
}

/** The picture's brightness: a little below full in the room, full when you lean in, exactly full on arrival. */
const REST = 0.84;

function Room({ active }: { active: boolean }) {
  const gltf = suspend(roomModel, ['drunkfurt-room']);
  const picture = suspend(roomPicture, ['drunkfurt-portfolio']);
  const room = useMemo(() => buildRoom(gltf), [gltf]);
  const display = useMemo(() => buildDisplay(picture), [picture]);
  const { gl, scene, camera } = useThree();
  useEffect(
    () => () => {
      room.wall.dispose();
      room.dispose();
    },
    [room],
  );

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__home = { monitor, display, room };
  }, [display, room]);

  useEffect(() => {
    monitor.mesh = display.screen;
    monitor.camera = camera;
    // the screen about the author: its middle, for the camera to lean towards
    const about = room.about;
    monitor.about.mesh = about;
    if (about) {
      about.updateWorldMatrix(true, false);
      about.geometry.computeBoundingBox();
      about.geometry.boundingBox!.getCenter(monitor.about.centre).applyMatrix4(about.matrixWorld);
    }
    return () => {
      if (monitor.mesh === display.screen) monitor.mesh = null;
      if (monitor.about.mesh === about) monitor.about.mesh = null;
    };
  }, [display, camera, room]);

  useEffect(() => {
    if (!active) return;
    gl.compile(scene, camera);
  }, [active, gl, scene, camera]);

  // on the way out of the episode (backwards), or when the page comes back from the browser's
  // history after the site was opened, the room is as it was before the click
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) resetMonitor();
    };
    window.addEventListener('pageshow', back);
    return () => window.removeEventListener('pageshow', back);
  }, []);
  useEffect(() => {
    if (active) return;
    postFx.clean = 0;
    if (monitor.armed) {
      monitor.armed = false;
      if (story.getState().prompt === 'monitor') story.setState({ prompt: null });
    }
    if (monitor.entering || monitor.hover > 0) resetMonitor();
  }, [active]);
  useEffect(
    () => () => {
      monitor.armed = false;
      resetMonitor();
      if (story.getState().prompt === 'monitor') story.setState({ prompt: null });
    },
    [],
  );

  const sound = useMemo(() => ({ on: false }), []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    room.wall.update(dt, performance.now());
    if (!active) return;
    // seated: the story waits for the click on the screen
    const local = localProgress('home');
    const waiting = local >= HOME_BEAT.gate - 0.003;
    if (waiting !== monitor.armed) {
      monitor.armed = waiting;
      if (!monitor.entering) story.setState({ prompt: waiting ? 'monitor' : null });
    }
    // the pointer over the picture (only the picture: the frame and the room around it do nothing), and the
    // link under it; once the click is taken, the lean is held where it was, so the move in owns the camera
    if (!monitor.entering) {
      const p = input.pointer;
      const at = monitor.armed && p.active ? pick(((p.x + 1) / 2) * window.innerWidth, ((p.y + 1) / 2) * window.innerHeight) : null;
      monitor.over = !!at;
      monitor.link = at ? at.link : -1;
      monitor.hover = damp(monitor.hover, monitor.over ? 1 : 0, 2.6, dt);
      // the screen about the author, the same way: the pointer on it draws you in, close enough to read
      const ab = monitor.about;
      ab.over = !at && monitor.armed && p.active && overAbout(((p.x + 1) / 2) * window.innerWidth, ((p.y + 1) / 2) * window.innerHeight);
      ab.hover = damp(ab.hover, ab.over ? 1 : 0, 2.2, dt);
    }
    const l = !monitor.entering ? SCREEN_LINKS[monitor.link] : undefined;
    display.mark.visible = !!l;
    if (l) {
      // picture pixels → the plane's metres (its centre is the picture's centre)
      display.mark.scale.set(((l.x1 - l.x0) / 2000) * DISPLAY.width, ((l.y1 - l.y0) / 1125) * DISPLAY.height, 1);
      display.mark.position.x = (((l.x0 + l.x1) / 2) / 2000 - 0.5) * DISPLAY.width;
      display.mark.position.y = (0.5 - ((l.y0 + l.y1) / 2) / 1125) * DISPLAY.height;
      display.markMat.opacity = 0.14;
    }
    const f = flyAt();
    const lit = REST + (0.97 - REST) * smoothstep(clamp(monitor.hover, 0, 1));
    display.glass.color.setScalar(lit + (1 - lit) * smoothstep(clamp(f * 1.4, 0, 1)));
    // the picture turns into the solid colour of the page it leads to, complete at 80% of the move;
    // the print treatment lifts with it, so the colour reaches the page exactly (no paper, no vignette)
    const solid = solidAt(f);
    display.solid.visible = solid > 0;
    if (solid > 0) {
      display.solidMat.color.set(monitor.solid);
      display.solidMat.opacity = solid;
    }
    postFx.clean = smoothstep(clamp((f - WHITE_FROM + 0.1) / (WHITE_AT - WHITE_FROM + 0.05), 0, 1));
    // indoors: the city's rumble, far off and muffled through the walls
    if (audio.running) {
      audio.startCityAmbience();
      audio.setAmbience(0.22, 1.5);
      if (!sound.on) audio.setWorldMuffle(650, 1.2);
      sound.on = true;
    }
  });
  useEffect(() => {
    if (active) return;
    if (sound.on) {
      audio.setAmbience(0, 1.2);
      audio.setWorldMuffle(20000, 0.8);
      sound.on = false;
    }
  }, [active, sound]);

  return (
    <>
      {active && <color attach="background" args={['#060708']} />}
      {active && <fogExp2 attach="fog" args={['#070809', 0.05]} />}
      <hemisphereLight args={['#8d929b', '#0e0e10', 0.35]} />
      {/* the big screen's glow on the steel in front of it, and a lamp somewhere above the chair */}
      <pointLight position={[DISPLAY.centre.x, DISPLAY.centre.y - 0.1, DISPLAY.centre.z + 0.8]} intensity={5} distance={7} decay={2} color="#e9ebef" />
      <pointLight position={[2.6, 3.4, 3.6]} intensity={7} distance={9} decay={2} color="#dcdcd8" />
      <primitive object={room.root} />
      <primitive object={display.group} />
    </>
  );
}

/**
 * Episode 4 world: the back room. Loads on its own (behind the getaway, while
 * it plays), so the episode before it never waits for it.
 */
export function RoomScene({ active }: { active: boolean }) {
  return (
    <Suspense fallback={null}>
      <Room active={active} />
    </Suspense>
  );
}
