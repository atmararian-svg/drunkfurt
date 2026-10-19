import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, Color, MeshBasicMaterial, Object3D, SpotLight, TubeGeometry, Vector3 } from 'three';
import { palette } from '../../config/palette';
import { GeoBatch } from '../../core/geometry';
import { mulberry32 } from '../../core/math';
import { cityMaterials } from './cityMaterials';
import { adPanel, kioskSign } from './cityTextures';
import { KIOSK, LAMP_X, LAMP_Z, PLAZA_LAMPS, SHELTER, TRAFFIC_LIGHTS, TREES } from './layout';

const LAMP_H = 7.4;

/** Street lamp with a curved arm reaching over the road. `s` = side (+1 right curb, -1 left). */
function lamp(b: GeoBatch, x: number, z: number, s: number, reach = 1.6) {
  b.cylinder('metal', 0.075, LAMP_H, [x, LAMP_H / 2, z], undefined, 10);
  b.cylinder('metal', 0.14, 0.5, [x, 0.25, z], undefined, 10);
  const curve = new CatmullRomCurve3([
    new Vector3(x, LAMP_H - 0.6, z),
    new Vector3(x - s * 0.25, LAMP_H + 0.15, z),
    new Vector3(x - s * reach * 0.7, LAMP_H + 0.25, z),
    new Vector3(x - s * reach, LAMP_H + 0.05, z),
  ]);
  b.add('metal', new TubeGeometry(curve, 16, 0.055, 8, false));
  b.cylinder('metal', 0.32, 0.22, [x - s * reach, LAMP_H - 0.05, z], undefined, 14);
  b.cylinder('lamp', 0.26, 0.02, [x - s * reach, LAMP_H - 0.17, z], undefined, 14);
}

/** A bare winter tree: tapering trunk, branches splitting three times, all organic. */
function tree(b: GeoBatch, x: number, z: number, seed: number) {
  const rnd = mulberry32(seed);
  const grow = (from: Vector3, dir: Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const mid = from.clone().lerp(to, 0.5).add(new Vector3((rnd() - 0.5) * len * 0.15, 0, (rnd() - 0.5) * len * 0.15));
    b.add('bark', new TubeGeometry(new CatmullRomCurve3([from, mid, to]), 4, r, 6, false));
    if (depth === 0) return;
    const n = depth === 3 ? 3 : 2 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = dir.clone();
      d.x += (rnd() - 0.5) * 1.1;
      d.z += (rnd() - 0.5) * 1.1;
      d.y += 0.15 + rnd() * 0.3;
      d.normalize();
      grow(to, d, len * (0.62 + rnd() * 0.12), r * 0.62, depth - 1);
    }
  };
  grow(new Vector3(x, 0, z), new Vector3((rnd() - 0.5) * 0.08, 1, (rnd() - 0.5) * 0.08).normalize(), 3.6, 0.17, 3);
  // tree pit grille
  b.box('metal', [1.3, 0.02, 1.3], [x, 0.01, z]);
}

export function StreetFurniture({ active }: { active: boolean }) {
  const m = cityMaterials();
  const parts = useMemo(() => {
    const b = new GeoBatch();
    for (const z of LAMP_Z) {
      lamp(b, LAMP_X, z, 1);
      lamp(b, -LAMP_X, z, -1);
    }
    for (const [x, z] of PLAZA_LAMPS) lamp(b, x, z, 1, 0.9);
    TREES.forEach(([x, z], i) => tree(b, x, z, 40 + i));
    // kiosk ("Trinkhalle"): a small lit booth on the square
    const k = KIOSK;
    b.box('plaster', [k.hx * 2, 2.7, k.hz * 2], [k.x, 1.35, k.z]);
    b.box('slate', [k.hx * 2 + 0.6, 0.18, k.hz * 2 + 0.6], [k.x, 2.8, k.z]);
    b.box('warmLamp', [0.02, 1.0, k.hz * 1.6], [k.x + k.hx + 0.005, 1.55, k.z]);
    b.box('metal', [0.5, 1.0, 0.02], [k.x + k.hx + 0.25, 0.5, k.z - k.hz + 0.05]); // newspaper stand
    // tram shelter
    const sh = SHELTER;
    b.box('metal', [sh.hx * 2, 0.12, sh.hz * 2 + 0.4], [sh.x, 2.55, sh.z]);
    for (const dx of [-sh.hx + 0.1, sh.hx - 0.1]) b.box('metal', [0.08, 2.5, 0.08], [sh.x + dx, 1.25, sh.z - sh.hz + 0.1]);
    b.box('metal', [sh.hx * 1.4, 0.06, 0.4], [sh.x, 0.48, sh.z - sh.hz + 0.3]);
    // traffic lights (night mode: blinking amber), housings
    for (const [x, z] of TRAFFIC_LIGHTS) {
      b.cylinder('metal', 0.06, 3.2, [x, 1.6, z], undefined, 8);
      b.box('metal', [0.32, 0.9, 0.28], [x, 3.0, z]);
    }
    return b.build();
  }, []);

  // real lights only for the lamps near the visitor's path; the rest glow
  const near = useMemo(
    () => [
      { p: [LAMP_X - 1.6, LAMP_H - 0.3, -27], shadow: false },
      { p: [LAMP_X - 1.6, LAMP_H - 0.3, -45], shadow: true },
      { p: [LAMP_X - 1.6, LAMP_H - 0.3, -63], shadow: false },
      { p: [-LAMP_X + 1.6, LAMP_H - 0.3, -27], shadow: false },
      { p: [-LAMP_X + 1.6, LAMP_H - 0.3, -45], shadow: false },
      { p: [-LAMP_X + 1.6, LAMP_H - 0.3, -63], shadow: false },
      { p: [PLAZA_LAMPS[0][0] - 0.9, LAMP_H - 0.3, PLAZA_LAMPS[0][1]], shadow: false },
      { p: [PLAZA_LAMPS[1][0] - 0.9, LAMP_H - 0.3, PLAZA_LAMPS[1][1]], shadow: true },
    ],
    [],
  );
  const spots = useRef<(SpotLight | null)[]>([]);
  const targets = useMemo(() => near.map((n) => Object.assign(new Object3D(), { position: new Vector3(n.p[0], 0, n.p[2]) })), [near]);
  useLayoutEffect(() => {
    spots.current.forEach((s, i) => s && (s.target = targets[i]));
  }, [targets]);

  // blinking amber: one second on, one off, the two corners out of step
  const amber = useMemo(() => [0, 1].map(() => m.amber.clone() as MeshBasicMaterial), [m]);
  const amberOn = useMemo(() => new Color(palette.yellow).multiplyScalar(2.4), []);
  useFrame(({ clock }) => {
    if (!active) return;
    amber.forEach((mat, i) => mat.color.copy(amberOn).multiplyScalar(Math.floor(clock.elapsedTime + i * 0.5) % 2 === 0 ? 1 : 0.04));
  });

  const ad = useMemo(() => new MeshBasicMaterial({ map: adPanel(), color: new Color(1, 1, 1).multiplyScalar(0.9) }), []);
  const sign = useMemo(() => new MeshBasicMaterial({ map: kioskSign(), color: new Color(1, 1, 1).multiplyScalar(0.95) }), []);
  ad.userData.comic = false;

  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={(m as unknown as Record<string, never>)[key]} castShadow={key !== 'lamp' && key !== 'warmLamp'} receiveShadow />
      ))}
      {targets.map((t, i) => (
        <primitive key={`t${i}`} object={t} />
      ))}
      {near.map((n, i) => (
        <spotLight
          key={i}
          ref={(s) => (spots.current[i] = s)}
          position={n.p as [number, number, number]}
          color={palette.lampWhite}
          intensity={240}
          angle={1.05}
          penumbra={0.6}
          decay={2}
          distance={24}
          castShadow={n.shadow}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
      ))}
      {/* kiosk: warm window light and its yellow sign */}
      <pointLight position={[KIOSK.x + KIOSK.hx + 1.2, 1.8, KIOSK.z]} color="#f3e6c4" intensity={6} distance={7} decay={2} />
      <mesh position={[KIOSK.x + KIOSK.hx + 0.02, 2.35, KIOSK.z]} rotation={[0, Math.PI / 2, 0]} material={sign}>
        <planeGeometry args={[2.0, 0.5]} />
      </mesh>
      {/* the shelter's lit poster faces the square */}
      <mesh position={[SHELTER.x - SHELTER.hx * 0.45, 1.45, SHELTER.z - SHELTER.hz + 0.02]} material={ad}>
        <planeGeometry args={[1.15, 1.72]} />
      </mesh>
      <pointLight position={[SHELTER.x - 1.1, 1.5, SHELTER.z + 0.8]} color="#eef1f4" intensity={3} distance={5} decay={2} />
      {TRAFFIC_LIGHTS.map(([x, z], i) => (
        <mesh key={i} position={[x, 3.0, z + 0.15]} material={amber[i]}>
          <sphereGeometry args={[0.08, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}
