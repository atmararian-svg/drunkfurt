import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, DoubleSide, Group, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Texture } from 'three';
import { GeoBatch, compose } from '../../core/geometry';
import { materials } from '../../materials/materials';
import * as tex from '../../materials/textures';
import { FLICKER_MAST } from './lighting-config';
import { MAST_X, MAST_Z } from './layout';
import {
  BENCH_Z,
  BIN_Z,
  CLOCK_MAST_Z,
  DISPLAY_MASTS,
  NAME_SIGN_MASTS,
  POSTER_Z,
  SECTION_LETTERS,
  SMOKING,
  VENDING,
} from './props';

const ARM_Y = 5.55;
const LAMP_DX = 1.6;

/** Static, untextured furniture merged per material. */
function buildStatic(mastX: number, masts: number[], full: boolean) {
  const b = new GeoBatch();
  masts.forEach((z, i) => {
    const lens = full && i === FLICKER_MAST ? 'lampLensFlicker' : 'lampLens';
    // The column holds the mast's own spotlight, so it must not cast shadows ('column' key).
    b.cylinder('column', 0.11, ARM_Y + 0.1, [mastX, (ARM_Y + 0.1) / 2, z], undefined, 14);
    b.cylinder('column', 0.2, 0.06, [mastX, 0.03, z], undefined, 14);
    b.box('column', [0.3, 0.5, 0.18], [mastX, 1.1, z + 0.14]); // cable/junction box
    b.box('mast', [LAMP_DX * 2 + 0.6, 0.12, 0.14], [mastX, ARM_Y, z]);
    for (const s of [-1, 1]) {
      b.box('fixture', [0.32, 0.13, 2.7], [mastX + s * LAMP_DX, ARM_Y - 0.12, z]);
      b.box(lens, [0.22, 0.012, 2.55], [mastX + s * LAMP_DX, ARM_Y - 0.19, z]);
    }
    if (!full) return;
    // hangers for the destination displays
    if (DISPLAY_MASTS.includes(z)) {
      for (const s of [-1, 1]) {
        b.box('mast', [0.03, 1.3, 0.03], [mastX + s * 1.4 - 0.9, ARM_Y - 0.7, z]);
        b.box('mast', [0.03, 1.3, 0.03], [mastX + s * 1.4 + 0.9, ARM_Y - 0.7, z]);
        b.box('signDark', [2.42, 0.66, 0.14], [mastX + s * 1.4, 3.88, z]);
      }
    }
    if (NAME_SIGN_MASTS.includes(z)) {
      b.box('signDark', [0.08, 0.6, 3.3], [mastX, 2.95, z]);
      b.box('signDark', [0.5, 0.5, 0.06], [mastX, 3.75, z]);
    }
  });
  if (!full) return b.build();

  // benches: perforated steel seats back to back, facing the tracks
  for (const z of BENCH_Z) {
    for (const s of [-1, 1]) {
      const x = mastX + s * 0.36;
      // seat and back built from slats, with a gap between each
      for (let k = 0; k < 5; k++) b.box('benchMetal', [0.075, 0.03, 2.1], [x + s * (0.24 - k * 0.088), 0.46, z]);
      for (let k = 0; k < 4; k++)
        b.box('benchMetal', [0.025, 0.075, 2.1], [x - s * (0.17 + k * 0.012), 0.6 + k * 0.1, z], [0, 0, s * 0.12]);
    }
    for (const dz of [-0.85, 0.85]) {
      b.box('mast', [1.05, 0.05, 0.06], [mastX, 0.43, z + dz]);
      b.box('mast', [0.06, 0.43, 0.06], [mastX, 0.215, z + dz]);
      b.box('mast', [0.5, 0.02, 0.18], [mastX, 0.01, z + dz]);
    }
  }
  // waste bins, two compartments (DB style recycling pair)
  for (const z of BIN_Z) {
    for (const dz of [-0.22, 0.22]) {
      b.cylinder('binMetal', 0.2, 0.78, [mastX + 0.45, 0.39, z + dz], undefined, 16);
      b.cylinder('mast', 0.21, 0.05, [mastX + 0.45, 0.8, z + dz], undefined, 16);
    }
  }
  // poster cases
  for (const z of POSTER_Z) {
    b.box('mast', [0.12, 1.62, 1.1], [mastX, 1.36, z]);
    b.box('mast', [0.08, 0.6, 0.08], [mastX, 0.3, z - 0.42]);
    b.box('mast', [0.08, 0.6, 0.08], [mastX, 0.3, z + 0.42]);
  }
  // vending machine
  b.box('binMetal', [0.78, 1.86, 1.0], [VENDING.x, 0.93, VENDING.z]);
  b.box('mast', [0.82, 0.08, 1.04], [VENDING.x, 1.9, VENDING.z]);
  // smoking area: yellow floor frame, sign post, ashtray column
  const { x0, x1, z0, z1 } = SMOKING;
  b.add('yellowPaint', new PlaneGeometry(x1 - x0, 0.08), compose([(x0 + x1) / 2, 0.005, z0], [-Math.PI / 2, 0, 0]));
  b.add('yellowPaint', new PlaneGeometry(x1 - x0, 0.08), compose([(x0 + x1) / 2, 0.005, z1], [-Math.PI / 2, 0, 0]));
  b.add('yellowPaint', new PlaneGeometry(0.08, z1 - z0), compose([x0, 0.005, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]));
  b.add('yellowPaint', new PlaneGeometry(0.08, z1 - z0), compose([x1, 0.005, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]));
  b.cylinder('binMetal', 0.15, 1.0, [x0 + 0.6, 0.5, z0 + 0.6], undefined, 14);
  b.cylinder('benchMetal', 0.17, 0.05, [x0 + 0.6, 1.02, z0 + 0.6], undefined, 14);
  b.cylinder('mast', 0.035, 2.5, [x1 - 0.2, 1.25, z0 + 0.2], undefined, 8);
  return b.build();
}

/** A double-sided textured panel. */
function Panel({
  map,
  size,
  position,
  rotationY = 0,
  glow = 0,
  basic = false,
  intensity = 1,
}: {
  map: Texture;
  size: [number, number];
  position: [number, number, number];
  rotationY?: number;
  glow?: number;
  basic?: boolean;
  intensity?: number;
}) {
  const mat = useMemo(
    () =>
      basic
        ? new MeshBasicMaterial({ map, color: new Color(1, 1, 1).multiplyScalar(intensity), side: DoubleSide })
        : new MeshStandardMaterial({
            map,
            emissiveMap: glow > 0 ? map : null,
            emissive: new Color(glow > 0 ? '#ffffff' : '#000000'),
            emissiveIntensity: glow,
            roughness: 0.5,
            side: DoubleSide,
          }),
    [map, glow, basic, intensity],
  );
  // signage is printed matter already: keep it out of the tonal banding so it stays legible
  mat.userData.comic = false;
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} material={mat}>
      <planeGeometry args={size} />
    </mesh>
  );
}

const BOARD_W = 2.3;
const BOARD_H = BOARD_W / 4;

/** Zugzielanzeiger: static content plus a scrolling ticker in the yellow lane. */
function DestinationDisplay({
  info,
  ticker,
  position,
}: {
  info: tex.BoardInfo;
  ticker: string;
  position: [number, number, number];
}) {
  const board = tex.destinationBoard(info);
  const strip = useMemo(() => {
    const t = tex.tickerStrip(ticker).clone();
    t.repeat.set(0.372, 1);
    t.needsUpdate = true;
    return t;
  }, [ticker]);
  useFrame((_, dt) => {
    strip.offset.x = (strip.offset.x + dt * 0.022) % 1;
  });
  const laneW = (BOARD_W * 834) / 1024;
  const laneH = (BOARD_H * 70) / 256;
  const laneX = -BOARD_W / 2 + (BOARD_W * 190) / 1024 + laneW / 2;
  const laneY = -BOARD_H / 2 + laneH / 2;
  return (
    <group position={position}>
      {[0, Math.PI].map((ry) => (
        <group key={ry} rotation={[0, ry, 0]}>
          <Panel map={board} size={[BOARD_W, BOARD_H]} position={[0, 0, 0.072]} basic intensity={1.05} />
          <Panel map={strip} size={[laneW, laneH]} position={[laneX, laneY, 0.074]} basic intensity={1.0} />
        </group>
      ))}
    </group>
  );
}

/** Platform clock with ticking second hand. Time is fiction: it is always just before midnight. */
function StationClock({ position }: { position: [number, number, number] }) {
  const faces = useRef<Group[]>([]);
  const start = useMemo(() => 23 * 3600 + 47 * 60 + 12, []);
  const dark = materials().trainRubber;
  useFrame(({ clock }) => {
    const t = start + clock.elapsedTime;
    const sec = Math.floor(t % 60);
    const min = (t / 60) % 60;
    const hr = (t / 3600) % 12;
    for (const f of faces.current) {
      if (!f) continue;
      const [h, m, s] = f.children as Group[];
      h.rotation.z = -(hr / 12) * Math.PI * 2;
      m.rotation.z = -(Math.floor(min) / 60) * Math.PI * 2;
      s.rotation.z = -(sec / 60) * Math.PI * 2;
    }
  });
  const face = tex.clockFace();
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials().mast}>
        <cylinderGeometry args={[0.46, 0.46, 0.14, 40]} />
      </mesh>
      {[0, Math.PI].map((ry, i) => (
        <group key={ry} rotation={[0, ry, 0]}>
          <Panel map={face} size={[0.86, 0.86]} position={[0, 0, 0.072]} basic intensity={0.95} />
          <group ref={(g) => g && (faces.current[i] = g)} position={[0, 0, 0.08]}>
            <group>
              <mesh position={[0, 0.12, 0]} material={dark}>
                <boxGeometry args={[0.045, 0.32, 0.006]} />
              </mesh>
            </group>
            <group>
              <mesh position={[0, 0.16, 0.004]} material={dark}>
                <boxGeometry args={[0.032, 0.42, 0.006]} />
              </mesh>
            </group>
            <group>
              <mesh position={[0, 0.14, 0.008]} material={dark}>
                <boxGeometry args={[0.01, 0.4, 0.004]} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

const BOARDS: { info: tex.BoardInfo; ticker: string }[] = [
  {
    info: { track: 7, time: '23:47', train: 'ICE 1027', via: 'aus Basel SBB – Mannheim', destination: 'Zug endet hier' },
    ticker:
      'Bitte alle aussteigen  +++  Dieser Zug endet hier  +++  Please leave the train  +++  Willkommen in Frankfurt am Main  +++  ',
  },
  {
    info: { track: 8, time: '00:12', train: 'ICE 1590', via: 'Hanau – Fulda – Erfurt', destination: 'Berlin Hbf' },
    ticker:
      'Heute ca. 25 Minuten später  +++  Grund: Verzögerungen im Betriebsablauf  +++  Wir bitten um Entschuldigung  +++  ',
  },
];

export function Furniture() {
  const m = materials();
  const parts = useMemo(() => buildStatic(MAST_X, MAST_Z, true), []);
  const posterMat = tex.departurePoster();
  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={key === 'column' ? m.mast : m[key as keyof typeof m]}
          castShadow={!key.startsWith('lampLens') && key !== 'yellowPaint' && key !== 'column'}
          receiveShadow
        />
      ))}

      {DISPLAY_MASTS.map((z) => (
        <group key={z}>
          {BOARDS.map((b, i) => (
            <DestinationDisplay key={i} info={b.info} ticker={b.ticker} position={[MAST_X + (i ? 1.4 : -1.4), 3.88, z]} />
          ))}
        </group>
      ))}

      {NAME_SIGN_MASTS.map((z, i) => (
        <group key={z}>
          {[-1, 1].map((s) => (
            <Panel
              key={s}
              map={tex.stationNameSign()}
              size={[3.2, 0.5]}
              position={[MAST_X + s * 0.045, 2.95, z]}
              rotationY={(s * Math.PI) / 2}
              glow={0.35}
            />
          ))}
          {[0, Math.PI].map((ry) => (
            <Panel
              key={ry}
              map={tex.sectionSign(SECTION_LETTERS[i] ?? 'G')}
              size={[0.44, 0.44]}
              position={[MAST_X + Math.sin(ry) * 0.035, 3.75, z + Math.cos(ry) * 0.035]}
              rotationY={ry}
              glow={0.5}
            />
          ))}
        </group>
      ))}

      {DISPLAY_MASTS.map((z) =>
        [7, 8].map((n, i) => (
          <group key={`${z}-${n}`}>
            {[0, Math.PI].map((ry) => (
              <Panel
                key={ry}
                map={tex.trackNumberSign(n)}
                size={[0.5, 0.5]}
                position={[MAST_X + (i ? 0.32 : -0.32), 4.85, z + Math.cos(ry) * 0.03]}
                rotationY={ry}
                glow={0.4}
              />
            ))}
          </group>
        )),
      )}

      <StationClock position={[MAST_X + 0.8, 4.85, CLOCK_MAST_Z]} />

      {POSTER_Z.map((z) =>
        [-1, 1].map((s) => (
          <Panel
            key={`${z}${s}`}
            map={posterMat}
            size={[0.92, 1.38]}
            position={[MAST_X + s * 0.065, 1.36, z]}
            rotationY={(s * Math.PI) / 2}
            basic
            intensity={0.8}
          />
        )),
      )}

      {[-1, 1].map((s) => (
        <Panel
          key={s}
          map={tex.vendingFront()}
          size={[0.8, 1.45]}
          position={[VENDING.x + s * 0.395, 1.05, VENDING.z]}
          rotationY={(s * Math.PI) / 2}
          basic
          intensity={0.75}
        />
      ))}

      <Panel
        map={tex.smallSign('Raucherbereich', { bg: '#f5d21a', fg: '#111111' })}
        size={[0.7, 0.175]}
        position={[SMOKING.x1 - 0.2, 2.42, SMOKING.z0 + 0.24]}
        glow={0.25}
      />
    </group>
  );
}

/** Light masts on the neighbouring platform: emissive only, seen above train B. */
export function DistantMasts({ x, zs }: { x: number; zs: number[] }) {
  const m = materials();
  const parts = useMemo(() => buildStatic(x, zs, false), [x, zs]);
  return (
    <group>
      {parts.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={key === 'column' ? m.mast : m[key as keyof typeof m]} />
      ))}
    </group>
  );
}
