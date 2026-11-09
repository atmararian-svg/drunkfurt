import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, MeshBasicMaterial, RingGeometry } from 'three';
import { CROSS, ROAD_Y, STREET, VISITOR_STOP } from '../scenes/city/layout';
import { walk, walkPath } from './walk';

/** The page's red (styles.css --red). */
const RED = '#cd1919';

/**
 * The way to go, in red on the ground (the game build, the street): dashes along the walk's path,
 * from the station's portal across the plaza to where he stops you, and after the fight from
 * there round the bonnet to the car's door; a ring where it ends. Each shows while it is the way
 * ahead (the street's walk, then the car's).
 */
const DASH = 0.55;
const GAP = 0.35;
const WIDTH = 0.11;

/** The ground's height under a point of the street (the road lies 15 cm below the pavements and the plaza). */
function groundY(x: number, z: number) {
  if (z <= CROSS.z1 && z >= CROSS.z0) return ROAD_Y;
  if (z < STREET.z0 && Math.abs(x) < STREET.halfRoad) return ROAD_Y;
  return 0;
}

function dashes(pts: { x: number; z: number }[]) {
  const pos: number[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-4) continue;
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const nx = -dz * (WIDTH / 2);
    const nz = dx * (WIDTH / 2);
    let s = carry;
    while (s < len) {
      const e = Math.min(len, s + DASH);
      const x0 = a.x + dx * s;
      const z0 = a.z + dz * s;
      const x1 = a.x + dx * e;
      const z1 = a.z + dz * e;
      const y0 = groundY(x0, z0) + 0.012;
      const y1 = groundY(x1, z1) + 0.012;
      pos.push(x0 - nx, y0, z0 - nz, x1 - nx, y1, z1 - nz, x1 + nx, y1, z1 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x0 + nx, y0, z0 + nz);
      s = e + GAP;
    }
    carry = s - len;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

export function GamePath() {
  const city = useRef<Group>(null);
  const car = useRef<Group>(null);
  const { cityGeo, carGeo, ring, mat, cityEnd, carEnd } = useMemo(() => {
    const cityPts = walkPath('city').flat();
    // on to where he stops you
    cityPts.push({ t: 0.735, x: VISITOR_STOP[0], y: 0, z: VISITOR_STOP[1], w: 0 });
    const carPts = walkPath('car').flat();
    const mat = new MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, fog: false, side: DoubleSide });
    const last = (p: { x: number; z: number }[]) => p[p.length - 1];
    return {
      cityGeo: dashes(cityPts),
      carGeo: dashes(carPts),
      ring: new RingGeometry(0.32, 0.42, 40).rotateX(-Math.PI / 2),
      mat,
      cityEnd: last(cityPts),
      carEnd: last(carPts),
    };
  }, []);
  useFrame(() => {
    // the way ahead only: the street's until he stops you, the car's after the fight
    if (city.current) city.current.visible = walk.episode === 'city' && walk.free;
    if (car.current) car.current.visible = walk.episode === 'car' && walk.free;
  });
  return (
    <>
      <group ref={city} visible={false}>
        <mesh geometry={cityGeo} material={mat} renderOrder={2} />
        <mesh geometry={ring} material={mat} position={[cityEnd.x, groundY(cityEnd.x, cityEnd.z) + 0.013, cityEnd.z]} renderOrder={2} />
      </group>
      <group ref={car} visible={false}>
        <mesh geometry={carGeo} material={mat} renderOrder={2} />
        <mesh geometry={ring} material={mat} position={[carEnd.x, groundY(carEnd.x, carEnd.z) + 0.013, carEnd.z]} renderOrder={2} />
      </group>
    </>
  );
}
