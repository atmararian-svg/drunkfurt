import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoToneMapping, PCFShadowMap, RepeatWrapping, SRGBColorSpace, Vector3 } from 'three';
import { buildFigure, Joints, Look } from '../characters/figure';
import { activityPose, applyPose, legLengths, restPose, STRIDE_M, walkPose } from '../characters/pose';
import { CITY_PEOPLE } from '../scenes/city/cast';
import { Stylizer } from '../render/Stylizer';
import { Piece, merge } from '../characters/anatomy';
import { hand, shoe } from '../characters/shapes';

/**
 * Character lab: the people of DRUNKFURT on a measured floor, under the same
 * comic rendering, for close inspection and automated screenshots.
 *
 *   window.__lab.cam([x, y, z], [tx, ty, tz], fov)
 *   window.__lab.walk(phase)      // the walker at a gait phase (radians); it moves with the phase
 *   window.__lab.activity(name)   // everyone else does this
 */
const floorTex = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#8a8a86';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#3a3a38';
  x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(20, 20); // 0.25 m squares on a 20 m floor
  t.colorSpace = SRGBColorSpace;
  return t;
};

function Scene() {
  const { camera } = useThree();
  const world = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    mat.userData.comic = { halftone: 0.6 };
    const screen = new MeshBasicMaterial({ color: new Color('#dfe6ee') });
    const root = new Group();
    const looks: Look[] = CITY_PEOPLE.map((p) => p.look).slice(0, 7);
    const lineup = looks.map((look, i) => {
      const j = buildFigure(look, mat, screen);
      j.root.position.set((i - 3) * 0.9, 0, 0);
      root.add(j.root);
      return j;
    });
    const walker = buildFigure(CITY_PEOPLE[CITY_PEOPLE.length - 1].look, mat, screen);
    walker.root.position.set(0, 0, 2.5);
    walker.root.rotation.y = Math.PI / 2;
    root.add(walker.root);
    // parts gallery at x = 10: open hands, fists and shoes, side by side
    const parts = new Group();
    parts.position.set(6, 0, 0);
    const skin = new Color('#8f8f8f');
    const addPart = (pieces: Piece[], x: number, y: number, ry = 0) => {
      const m = new Mesh(merge(pieces), mat);
      m.position.set(x, y, 0);
      m.rotation.y = ry;
      m.castShadow = true;
      m.userData.ink = 'silhouette';
      parts.add(m);
    };
    addPart(hand(-1, skin, 0), -0.3, 1.2);
    addPart(hand(1, skin, 0), -0.1, 1.2);
    addPart(hand(1, skin, 1), 0.1, 1.2);
    addPart(hand(1, skin, 0.5), 0.3, 1.2);
    addPart(shoe(new Color('#2a2a2a'), new Color('#9a9a9a')), -0.2, 0.075, Math.PI / 2);
    addPart(shoe(new Color('#2a2a2a'), new Color('#9a9a9a')), 0.2, 0.075, 0);
    root.add(parts);
    return { root, lineup, walker };
  }, []);
  const state = useMemo(() => ({ phase: 0, activity: 'pockets', t: 3 }), []);

  useMemo(() => {
    const lab = {
      cam(p: [number, number, number], t: [number, number, number], fov = 35) {
        camera.position.set(...p);
        camera.lookAt(new Vector3(...t));
        (camera as unknown as { fov: number }).fov = fov;
        camera.updateProjectionMatrix();
      },
      walk(phase: number) { state.phase = phase; },
      activity(a: string) { state.activity = a; },
      world,
    };
    (window as unknown as Record<string, unknown>).__lab = lab;
    lab.cam([0, 1.5, 5], [0, 1, 0], 35);
  }, [camera, world, state]);

  useFrame(() => {
    const p = restPose();
    world.lineup.forEach((j: Joints, i) => {
      activityPose(p, state.activity as never, state.t, i * 17);
      applyPose(j, p);
    });
    const w = world.walker;
    walkPose(p, state.phase, 1, { swing: 0.9, lean: 0.04, stride: 1.05 }, legLengths(w));
    applyPose(w, p);
    w.root.position.x = -1.5 + (state.phase / (Math.PI * 2)) * STRIDE_M;
  });

  return (
    <>
      <color attach="background" args={['#1a1b1e']} />
      <hemisphereLight args={['#59606b', '#202020', 0.9]} />
      <directionalLight position={[3, 6, 4]} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial map={floorTex()} roughness={1} />
      </mesh>
      <primitive object={world.root} />
    </>
  );
}

export function Lab() {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      dpr={1}
      gl={{ antialias: false, stencil: false }}
      camera={{ fov: 35, near: 0.05, far: 200 }}
      onCreated={({ gl }) => {
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      <Scene />
      <Stylizer version={0} />
    </Canvas>
  );
}
