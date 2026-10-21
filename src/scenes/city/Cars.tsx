import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, ExtrudeGeometry, Group, Object3D, Shape, SpotLight } from 'three';
import { audio } from '../../audio/AudioDirector';
import { GeoBatch } from '../../core/geometry';
import { localProgress, locate, timeline } from '../../core/timeline';
import { playerState } from '../../player/playerState';
import { cityMaterials } from './cityMaterials';
import { ROAD_Y } from './layout';
import { createTraffic, stepTraffic } from './traffic';
import { CITY_CARS, PARKED, parkedBoxes } from './trafficPlan';

/**
 * An original small car, drawn with soft curves: a side profile with a long
 * bonnet, rounded roof and short tail, extruded and bevelled so no edge is
 * sharp. Local frame: length along z (front at +z), width along x.
 */
function carParts(): { body: BufferGeometry; glass: BufferGeometry; tyres: BufferGeometry; lights: BufferGeometry } {
  const W = 1.62;
  const side = new Shape();
  const P: [number, number][] = [
    [-2.15, 0.32], [2.1, 0.32], [2.22, 0.55], [2.12, 0.82], [1.2, 0.95], [0.55, 1.36], [-0.75, 1.4], [-1.55, 1.02], [-2.18, 0.92], [-2.24, 0.55],
  ];
  side.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i <= P.length; i++) {
    const a = P[i - 1];
    const b = P[i % P.length];
    side.quadraticCurveTo(a[0] + (b[0] - a[0]) * 0.1, a[1] + (b[1] - a[1]) * 0.1 + 0.02, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  const body = new ExtrudeGeometry(side, { depth: W - 0.24, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4, curveSegments: 8 });
  body.translate(0, 0, -(W - 0.24) / 2);
  body.rotateY(-Math.PI / 2);
  const g = new Shape();
  g.moveTo(1.12, 0.98);
  g.quadraticCurveTo(0.8, 1.2, 0.5, 1.33);
  g.lineTo(-0.7, 1.36);
  g.quadraticCurveTo(-1.2, 1.2, -1.48, 1.02);
  g.lineTo(1.12, 0.98);
  const glass = new ExtrudeGeometry(g, { depth: W + 0.02, bevelEnabled: false, curveSegments: 6 });
  glass.translate(0, 0, -(W + 0.02) / 2);
  glass.rotateY(-Math.PI / 2);
  const tb = new GeoBatch();
  for (const z of [-1.38, 1.36]) for (const x of [-0.78, 0.78]) tb.cylinder('t', 0.33, 0.24, [x, 0.33, z], [0, 0, Math.PI / 2], 16);
  const lb = new GeoBatch();
  for (const x of [-0.58, 0.58]) lb.box('l', [0.36, 0.1, 0.06], [x, 0.74, 2.2]);
  return { body, glass, tyres: tb.build()[0].geometry, lights: lb.build()[0].geometry };
}

export function Cars({ active, timeScale }: { active: boolean; timeScale: () => number }) {
  const m = cityMaterials();
  const geo = useMemo(carParts, []);
  // deterministic traffic (traffic.ts): lanes clear of the parked cars, cars that keep their distance and give way
  const { traffic, defs } = useMemo(() => {
    const defs = CITY_CARS();
    return { traffic: createTraffic(defs, parkedBoxes()), defs };
  }, []);
  useEffect(() => {
    // dev inspection: fast-forward the traffic (seconds) to look at a given moment
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__traffic = { traffic, step: (sec: number) => stepTraffic(traffic, sec, null) };
  }, [traffic]);
  const groups = useRef<(Group | null)[]>([]);
  const spots = useRef<(SpotLight | null)[]>([]);
  const passed = useMemo(() => defs.map(() => false), [defs]);
  const target = useMemo(() => defs.map(() => new Object3D()), [defs]);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.05) * timeScale();
    stepTraffic(traffic, dt, [playerState.position.x, playerState.position.z]);
    // episode 3: the Mercedes leaves down the right-hand lane, which is kept clear for it
    // (the car that turns into that lane stays off the street while the episode is on)
    const getaway = locate(timeline.progress).id !== 'city' && localProgress('car') > 0;
    traffic.cars.forEach((c, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.visible = c.on && !(getaway && i === 0);
      if (!c.on) {
        passed[i] = false;
        return;
      }
      g.position.set(c.box.x, ROAD_Y, c.box.z);
      g.rotation.y = c.box.yaw;
      const d = defs[i];
      if (!passed[i] && g.visible && c.s / d.lane.length > d.pass.at && audio.running) {
        passed[i] = true;
        audio.carPass(d.pass.from, d.pass.to, 4.5, 0.22);
      }
      const sp = spots.current[i];
      if (sp) {
        sp.visible = g.visible;
        target[i].position.set(c.box.x + Math.sin(c.box.yaw) * 12, ROAD_Y, c.box.z + Math.cos(c.box.yaw) * 12);
        target[i].updateMatrixWorld();
      }
    });
  });

  return (
    <group>
      {PARKED.map(([x, z, h, c], i) => (
        <group key={i} position={[x, ROAD_Y, z]} rotation={[0, h, 0]}>
          <mesh geometry={geo.body} material={m.carBody[c]} castShadow receiveShadow />
          <mesh geometry={geo.glass} material={m.carGlass} />
          <mesh geometry={geo.tyres} material={m.tyre} />
        </group>
      ))}
      {defs.map((d, i) => (
        <group key={`m${i}`} ref={(g) => (groups.current[i] = g)} visible={false}>
          <mesh geometry={geo.body} material={m.carBody[d.color]} castShadow />
          <mesh geometry={geo.glass} material={m.carGlass} />
          <mesh geometry={geo.tyres} material={m.tyre} />
          <mesh geometry={geo.lights} material={m.lamp} />
          {/* headlight beam and its reflection in the wet road */}
          <spotLight
            ref={(s) => (spots.current[i] = s)}
            target={target[i]}
            position={[0, 0.8, 2.3]}
            color="#f1efe6"
            intensity={160}
            angle={0.45}
            penumbra={0.5}
            decay={2}
            distance={30}
          />
          <mesh material={m.streak} position={[0, 0.02, 6]} rotation={[-Math.PI / 2, 0, Math.PI]}>
            <planeGeometry args={[1.6, 8]} />
          </mesh>
        </group>
      ))}
      {target.map((t, i) => (
        <primitive key={`tg${i}`} object={t} />
      ))}
    </group>
  );
}

