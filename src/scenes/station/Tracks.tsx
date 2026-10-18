import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry } from 'three';
import { GeoBatch, Vec2, compose, sweepSides } from '../../core/geometry';
import { materials } from '../../materials/materials';
import { hazardStripes } from '../../materials/textures';
import { BUFFER_Z, GAUGE, RAIL_TOP, TRACK_BED, TRACK_Z } from './layout';

/** Flat-bottom rail cross-section (UIC 60-like), local origin at the rail foot centre. */
const RAIL: Vec2[] = [
  [-0.075, 0],
  [0.075, 0],
  [0.075, 0.012],
  [0.012, 0.03],
  [0.009, 0.12],
  [0.036, 0.13],
  [0.036, 0.172],
  [-0.036, 0.172],
  [-0.036, 0.13],
  [-0.009, 0.12],
  [-0.012, 0.03],
  [-0.075, 0.012],
];
const RAIL_H = 0.172;
const SLEEPER_STEP = 0.6;

interface Props {
  xs: number[];
  /** Tracks that end at the concourse buffer stops. */
  buffered?: boolean;
}

function buildTracks(xs: number[], buffered: boolean) {
  const b = new GeoBatch();
  const z0 = TRACK_Z.start;
  const z1 = TRACK_Z.end;
  const baseY = RAIL_TOP - RAIL_H;
  for (const x of xs) {
    for (const s of [-1, 1]) {
      const rx = x + (s * (GAUGE + 0.072)) / 2;
      const prof = RAIL.map(([px, py]) => [px + rx, py + baseY] as Vec2);
      b.add('rail', sweepSides(prof, z0, z1, 20));
    }
    // ballast shoulder
    b.box('ballast', [3.2, 0.12, z1 - z0], [x, TRACK_BED + 0.06, (z0 + z1) / 2]);
    if (buffered) buildBufferStop(b, x);
  }
  return b.build();
}

/** Classic German buffer stop: bent-rail frame, timber-faced beam, two buffers. */
function buildBufferStop(b: GeoBatch, x: number) {
  const z = BUFFER_Z;
  const y = RAIL_TOP;
  for (const s of [-1, 1]) {
    const rx = x + (s * GAUGE) / 2;
    b.box('steel', [0.08, 1.15, 0.12], [rx, y + 0.6, z - 0.15]);
    b.box('steel', [0.08, 0.1, 1.9], [rx, y + 0.25, z - 0.95], [-0.5, 0, 0]);
    b.cylinder('steelLight', 0.17, 0.42, [x + s * 0.88, y + 1.06, z + 0.12], [Math.PI / 2, 0, 0], 16);
    b.cylinder('steel', 0.24, 0.05, [x + s * 0.88, y + 1.06, z + 0.34], [Math.PI / 2, 0, 0], 16);
  }
  b.box('steel', [2.4, 0.4, 0.3], [x, y + 1.06, z - 0.15]);
  b.add('hazard', new PlaneGeometry(2.3, 0.32), compose([x, y + 1.06, z + 0.005]));
}

export function Tracks({ xs, buffered = false }: Props) {
  const m = materials();
  const parts = useMemo(() => buildTracks(xs, buffered), [xs, buffered]);
  const hazard = useMemo(() => new MeshStandardMaterial({ map: hazardStripes(), roughness: 0.7 }), []);
  const ref = useRef<InstancedMesh>(null);
  const sleeperGeo = useMemo(() => new BoxGeometry(2.6, 0.16, 0.26), []);
  const count = Math.floor((TRACK_Z.end - TRACK_Z.start) / SLEEPER_STEP) * xs.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const mat = new Matrix4();
    let i = 0;
    for (const x of xs)
      for (let z = TRACK_Z.start + 0.3; z < TRACK_Z.end && i < count; z += SLEEPER_STEP) {
        mat.makeTranslation(x, RAIL_TOP - RAIL_H - 0.08, z);
        mesh.setMatrixAt(i++, mat);
      }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [xs, count]);

  return (
    <group>
      <instancedMesh ref={ref} args={[sleeperGeo, m.sleeper, count]} receiveShadow />
      {parts.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={key === 'hazard' ? hazard : m[key as keyof typeof m]}
          receiveShadow
          castShadow={key !== 'ballast'}
        />
      ))}
    </group>
  );
}
