import { useMemo } from 'react';
import { BackSide, Color, MeshBasicMaterial, PlaneGeometry } from 'three';
import { GeoBatch, compose } from '../../core/geometry';
import { mulberry32 } from '../../core/math';
import { materials } from '../../materials/materials';
import { skyGradient } from '../../materials/textures';
import { HALL, RAIL_TOP, TRACKS, TRACK_BED } from './layout';

/**
 * Beyond the open end of the hall: the track field (Gleisvorfeld) under the
 * night sky, catenary portals, a signal showing yellow, and the road bridge
 * that crosses the tracks west of the station, its sodium lamps the only
 * warm light in the distance. No skyline here: from the platform you look
 * west, away from the towers.
 */
export function Outside() {
  const m = materials();
  const sky = useMemo(
    () => new MeshBasicMaterial({ map: skyGradient(), side: BackSide, fog: false, depthWrite: false }),
    [],
  );
  const windowMat = useMemo(
    () => new MeshBasicMaterial({ color: new Color('#d9d4c6').multiplyScalar(0.9) }),
    [],
  );
  const sodium = useMemo(() => new MeshBasicMaterial({ color: new Color('#f5c64a').multiplyScalar(3.2) }), []);

  const parts = useMemo(() => {
    const b = new GeoBatch();
    const rnd = mulberry32(17);
    // ground of the track field
    b.add('ballast', new PlaneGeometry(260, 520), compose([10, TRACK_BED, HALL.z1 + 255], [-Math.PI / 2, 0, 0]));
    // catenary portals
    for (let z = HALL.z1 + 45; z < 420; z += 55) {
      for (const x of [-12, 34]) b.box('mast', [0.4, 9, 0.4], [x, 4.5 + TRACK_BED, z]);
      b.box('mast', [46.4, 0.5, 0.35], [11, 8.6 + TRACK_BED, z]);
      for (const tx of [TRACKS.a, TRACKS.b, TRACKS.c]) b.box('catenary', [0.02, 2.4, 0.02], [tx, 7.4 + TRACK_BED, z]);
    }
    // signal for Gleis 7 (Ks), head on a short mast to the right of the track
    const sx = TRACKS.a + 2.3;
    const sz = 168;
    b.box('mast', [0.16, 4.2, 0.16], [sx, RAIL_TOP + 2.1, sz]);
    b.box('signDark', [0.55, 1.1, 0.25], [sx, RAIL_TOP + 4.5, sz]);
    b.box('yellowGlow', [0.16, 0.16, 0.05], [sx, RAIL_TOP + 4.7, sz - 0.14]);
    // the road bridge across the track field
    const bz = 330;
    b.box('concrete', [300, 1.6, 14], [10, 9, bz]);
    b.box('concrete', [300, 1.1, 0.3], [10, 10.3, bz - 7]);
    for (let x = -80; x <= 100; x += 30) b.box('concrete', [2.2, 9, 3], [x, 4 + TRACK_BED, bz]);
    for (let x = -100; x <= 120; x += 24) {
      b.box('mast', [0.15, 7, 0.15], [x, 13.3, bz - 6.5]);
      b.box('sodium', [0.6, 0.15, 0.3], [x + 0.3, 16.8, bz - 6.5]);
    }
    // low city blocks beyond, a few windows still lit
    for (let i = 0; i < 26; i++) {
      const x = -160 + i * 14 + rnd() * 6;
      const z = 420 + rnd() * 140;
      const w = 10 + rnd() * 16;
      const h = 14 + rnd() * 26;
      b.box('signDark', [w, h, 12], [x, TRACK_BED + h / 2, z]);
      const n = Math.floor(rnd() * 10);
      for (let k = 0; k < n; k++)
        b.box('window', [1.1, 0.9, 0.1], [x - w / 2 + 1 + rnd() * (w - 2), TRACK_BED + 3 + rnd() * (h - 5), z - 6.06]);
    }
    return b.build();
  }, []);

  return (
    <group>
      <mesh material={sky} renderOrder={-1}>
        <sphereGeometry args={[900, 32, 16]} />
      </mesh>
      {parts.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={key === 'window' ? windowMat : key === 'sodium' ? sodium : m[key as keyof typeof m]}
        />
      ))}
    </group>
  );
}
