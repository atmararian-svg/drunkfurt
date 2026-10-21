import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { suspend } from 'suspend-react';
import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
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
import { DISPLAY, HOME_BEAT, ROOM_LIFT } from './layout';
import { flyAt, monitor, onScreen, resetMonitor } from './monitor';
import { buildWallScreens } from './roomScreens';

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
  const model = gltf.scene;
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
  const wall = buildWallScreens(screens.length);
  screens.forEach((s, i) => {
    s.material = wall.materials[i];
    s.userData.ink = false;
  });
  return { root, wall };
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
  return { group: g, screen, glass };
}

/** The picture's brightness: a little below full in the room, full when you lean in, exactly full on arrival. */
const REST = 0.84;

function Room({ active }: { active: boolean }) {
  const gltf = suspend(() => loadGlb(roomUrl), ['drunkfurt-room']);
  const picture = suspend(() => loadPicture(portfolioUrl), ['drunkfurt-portfolio']);
  const room = useMemo(() => buildRoom(gltf), [gltf]);
  const display = useMemo(() => buildDisplay(picture), [picture]);
  const { gl, scene, camera } = useThree();
  useEffect(() => () => room.wall.dispose(), [room]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__home = { monitor, display, room };
  }, [display, room]);

  useEffect(() => {
    monitor.mesh = display.screen;
    monitor.camera = camera;
    return () => {
      if (monitor.mesh === display.screen) monitor.mesh = null;
    };
  }, [display, camera]);

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
    // the pointer over the picture (only the picture: the frame and the room around it do nothing)
    const p = input.pointer;
    monitor.over =
      monitor.armed && !monitor.entering && p.active && onScreen(((p.x + 1) / 2) * window.innerWidth, ((p.y + 1) / 2) * window.innerHeight);
    monitor.hover = damp(monitor.hover, monitor.over ? 1 : 0, 2.6, dt);
    const f = flyAt();
    const lit = REST + (0.97 - REST) * smoothstep(clamp(monitor.hover, 0, 1));
    display.glass.color.setScalar(lit + (1 - lit) * smoothstep(clamp(f * 1.4, 0, 1)));
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
