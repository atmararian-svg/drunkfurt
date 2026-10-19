import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Group, Object3D, Shape, SpotLight, Vector3 } from 'three';
import { audio } from '../../audio/AudioDirector';
import { GeoBatch } from '../../core/geometry';
import { clamp, damp } from '../../core/math';
import { playerState } from '../../player/playerState';
import { cityMaterials } from './cityMaterials';
import { ROAD_Y } from './layout';

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

interface Mover {
  curve: CatmullRomCurve3;
  length: number;
  speed: number;
  period: number;
  offset: number;
  color: number;
  /** Stereo pan at the start and end of the pass, and when along the loop to whoosh. */
  pass: { at: number; from: number; to: number };
}

const PARKED: [number, number, number, number][] = [
  // x, z, heading, colour
  [-3.95, -30, Math.PI, 0],
  [-3.95, -66, Math.PI, 2],
  [-3.95, -122, 0, 1],
  [3.95, -48, 0, 3],
  [3.95, -86, Math.PI, 1],
  [3.95, -142, 0, 0],
];

export function Cars({ active, timeScale }: { active: boolean; timeScale: () => number }) {
  const m = cityMaterials();
  const geo = useMemo(carParts, []);
  const movers = useMemo<Mover[]>(() => {
    const y = ROAD_Y;
    const a = new CatmullRomCurve3([
      new Vector3(-80, y, -19.2),
      new Vector3(-10, y, -19.2),
      new Vector3(-1, y, -20.5),
      new Vector3(2.3, y, -27),
      new Vector3(2.3, y, -440),
    ]);
    const b = new CatmullRomCurve3([new Vector3(80, y, -14.2), new Vector3(-80, y, -14.2)]);
    return [
      { curve: a, length: a.getLength(), speed: 9.5, period: 46, offset: 6, color: 2, pass: { at: 0.15, from: -0.8, to: 0.2 } },
      { curve: b, length: b.getLength(), speed: 11, period: 27, offset: 18, color: 0, pass: { at: 0.4, from: 0.9, to: -0.9 } },
    ];
  }, []);
  const groups = useRef<(Group | null)[]>([]);
  const spots = useRef<(SpotLight | null)[]>([]);
  const state = useMemo(() => movers.map((mv) => ({ t: mv.offset, s: 0, v: mv.speed, passed: false })), [movers]);
  const target = useMemo(() => movers.map(() => new Object3D()), [movers]);
  const tmp = useMemo(() => ({ p: new Vector3(), d: new Vector3() }), []);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.05) * timeScale();
    movers.forEach((mv, i) => {
      const st = state[i];
      const g = groups.current[i];
      if (!g) return;
      st.t += dt;
      const cycle = st.t % mv.period;
      const driving = cycle * mv.speed < mv.length;
      // give way to the visitor if they are in the road just ahead
      mv.curve.getPointAt(clamp(st.s / mv.length, 0, 1), tmp.p);
      mv.curve.getTangentAt(clamp(st.s / mv.length, 0, 0.999), tmp.d);
      const dx = playerState.position.x - tmp.p.x;
      const dz = playerState.position.z - tmp.p.z;
      const ahead = dx * tmp.d.x + dz * tmp.d.z;
      const lateral = Math.abs(dx * tmp.d.z - dz * tmp.d.x);
      const yieldFor = ahead > 0 && ahead < 9 && lateral < 2.2;
      st.v = damp(st.v, yieldFor ? 0 : mv.speed, yieldFor ? 3 : 1.2, dt);
      if (cycle < dt * 1.5 && (st.s === 0 || st.s >= mv.length - 0.5)) {
        st.s = 0; // a new car turns in, out of sight (only once the last one has left)
        st.passed = false;
      }
      if (driving || st.s > 0) st.s = Math.min(mv.length, st.s + st.v * dt);
      g.visible = st.s > 0 && st.s < mv.length - 0.5;
      g.position.copy(tmp.p);
      g.rotation.y = Math.atan2(tmp.d.x, tmp.d.z);
      if (!st.passed && st.s / mv.length > mv.pass.at && audio.running) {
        st.passed = true;
        audio.carPass(mv.pass.from, mv.pass.to, 4.5, 0.22);
      }
      const sp = spots.current[i];
      if (sp) {
        sp.visible = g.visible;
        target[i].position.copy(tmp.p).addScaledVector(tmp.d, 12);
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
      {movers.map((mv, i) => (
        <group key={`m${i}`} ref={(g) => (groups.current[i] = g)} visible={false}>
          <mesh geometry={geo.body} material={m.carBody[mv.color]} castShadow />
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

