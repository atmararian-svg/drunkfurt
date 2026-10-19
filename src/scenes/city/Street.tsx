import { useMemo } from 'react';
import { PlaneGeometry } from 'three';
import { GeoBatch, compose } from '../../core/geometry';
import { cityMaterials } from './cityMaterials';
import { CROSS, LAMP_X, LAMP_Z, PLAZA, PLAZA_LAMPS, ROAD_Y, STATION_FACE_Z, STREET } from './layout';

/** A ground plane with UVs in metres / `tile`, so textures keep a real-world scale. */
function ground(w: number, d: number, tile: number) {
  const g = new PlaneGeometry(w, d);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
  return g;
}
const flat = (x: number, y: number, z: number) => compose([x, y, z], [-Math.PI / 2, 0, 0]);

/**
 * Everything underfoot: the station square, the cross street with tram tracks
 * and a zebra crossing, the boulevard with its sidewalks and curbs, road
 * markings, a few puddles, and the light reflected in the wet asphalt.
 */
export function Street() {
  const m = cityMaterials();
  const parts = useMemo(() => {
    const b = new GeoBatch();
    const len = STREET.z0 - STREET.z1;
    const zm = (STREET.z0 + STREET.z1) / 2;
    // square and station floor
    b.add('plaza', ground(PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0, 3), flat((PLAZA.x0 + PLAZA.x1) / 2, 0, (PLAZA.z0 + PLAZA.z1) / 2));
    b.add('stationFloor', ground(30, 16, 4), flat(1.5, 0, STATION_FACE_Z + 8));
    // cross street
    b.add('road', ground(140, CROSS.z1 - CROSS.z0, 8), flat(0, ROAD_Y, (CROSS.z0 + CROSS.z1) / 2));
    b.box('curb', [140, 0.16, 0.24], [0, ROAD_Y + 0.08, CROSS.z1 - 0.12]);
    // boulevard road and sidewalks (the sidewalk slab fills the 15 cm step)
    b.add('road', ground(STREET.halfRoad * 2, len, 8), flat(0, ROAD_Y, zm));
    for (const s of [-1, 1]) {
      const xm = s * (STREET.halfRoad + STREET.curbOuter) / 2;
      const w = STREET.curbOuter - STREET.halfRoad;
      b.add('sidewalk', ground(w, len, 3), flat(xm, 0, zm));
      b.box('plaster', [w, -ROAD_Y, len], [xm, ROAD_Y / 2, zm]);
      b.box('curb', [0.24, 0.16, len], [s * (STREET.halfRoad + 0.12), ROAD_Y + 0.08, zm]);
      // corner sidewalks along the cross street
      b.add('sidewalk', ground(60, 3, 3), flat(s * (STREET.halfRoad + 30), 0, CROSS.z0 - 1.5));
      b.box('curb', [60, 0.16, 0.24], [s * (STREET.halfRoad + 30), ROAD_Y + 0.08, CROSS.z0 + 0.12]);
    }
    // centre line: dashes
    for (let z = STREET.z0 - 6; z > STREET.z1; z -= 9) b.add('marking', new PlaneGeometry(0.14, 3), flat(0, ROAD_Y + 0.004, z));
    // zebra crossing over the cross street, in front of the boulevard's right sidewalk
    for (let z = CROSS.z1 - 0.9; z > CROSS.z0 + 0.5; z -= 1.0) b.add('marking', new PlaneGeometry(3.6, 0.5), flat(7.2, ROAD_Y + 0.004, z));
    // tram tracks along the cross street (grooved rails flush with the road)
    for (const z of [-15.2, -16.65, -18.4, -19.85]) b.box('rail', [140, 0.02, 0.07], [0, ROAD_Y + 0.006, z]);
    // a few puddles where the sidewalk dips
    for (const [x, z, w, d] of [[6.1, -40.5, 1.4, 0.8], [-6.3, -55, 1.8, 0.9], [5.9, -66, 1.1, 0.6], [-1.5, -13.5, 2.4, 1.0]] as const)
      b.add('puddle', new PlaneGeometry(w, d), flat(x, (x > -5 && x < 5 ? ROAD_Y : 0) + 0.006, z));
    // light reflected in the wet road under each lamp, stretched towards the eye
    for (const z of LAMP_Z)
      for (const s of [-1, 1]) {
        b.add('streak', new PlaneGeometry(0.7, 7.5), flat(s * (LAMP_X - 1.7), ROAD_Y + 0.01, z + 3.6));
        b.add('pool', new PlaneGeometry(7, 7), flat(s * (LAMP_X - 0.6), 0.012, z));
      }
    for (const [x, z] of PLAZA_LAMPS) b.add('pool', new PlaneGeometry(9, 9), flat(x, 0.012, z));
    return b.build();
  }, []);
  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={(m as unknown as Record<string, never>)[key]}
          receiveShadow
          renderOrder={key === 'streak' || key === 'pool' ? 2 : 0}
        />
      ))}
    </group>
  );
}
