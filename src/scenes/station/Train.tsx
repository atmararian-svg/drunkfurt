import { useMemo } from 'react';
import { Color, Material, MeshStandardMaterial } from 'three';
import { palette } from '../../config/palette';
import { materials } from '../../materials/materials';
import { trainWindowBay } from '../../materials/textures';
import { RAIL_TOP } from './layout';
import { TrainSpec, buildTrain, headlightPositions } from './trainGeometry';

interface Props {
  trackX: number;
  spec: TrainSpec;
  /** Texture variant so neighbouring trains don't share the same passengers. */
  variant?: number;
  headlights?: boolean;
}

const NO_SHADOW = new Set(['spill', 'winLit', 'winDark', 'interiorLight', 'buttonLit', 'partition']);

export function Train({ trackX, spec, variant = 0, headlights = true }: Props) {
  const parts = useMemo(() => buildTrain(spec), [spec]);

  const mats = useMemo(() => {
    const m = materials();
    const lit = trainWindowBay(true, variant);
    const dark = trainWindowBay(false, variant);
    const nose = m.trainBody.clone();
    nose.vertexColors = true;
    const map: Record<string, Material> = {
      body: m.trainBody,
      nose,
      interior: m.trainInterior,
      trim: m.trainTrim,
      rubber: m.trainRubber,
      yellow: m.yellowPaint,
      buttonLit: m.yellowGlow,
      under: m.trainUnder,
      wheel: m.wheel,
      stainless: m.stainless,
      floor: m.trainFloor,
      interiorLight: m.whiteGlow,
      pantograph: m.steel,
      spill: m.windowSpill,
      winLit: new MeshStandardMaterial({
        map: lit,
        emissiveMap: lit,
        emissive: new Color(palette.interiorWhite),
        emissiveIntensity: 0.85,
        roughness: 0.08,
        metalness: 0.2,
      }),
      winDark: new MeshStandardMaterial({ map: dark, roughness: 0.08, metalness: 0.3 }),
      partition: new MeshStandardMaterial({
        map: lit,
        emissiveMap: lit,
        emissive: new Color(palette.interiorWhite),
        emissiveIntensity: 0.6,
        roughness: 0.1,
      }),
    };
    return map;
  }, [variant]);

  const lights = useMemo(() => headlightPositions(spec.noseZ), [spec.noseZ]);

  return (
    <group position={[trackX, RAIL_TOP, 0]}>
      {parts.map(({ key, geometry }) => (
        <mesh
          key={key}
          geometry={geometry}
          material={mats[key]}
          castShadow={!NO_SHADOW.has(key)}
          receiveShadow={!NO_SHADOW.has(key)}
          renderOrder={key === 'spill' ? 2 : 0}
        />
      ))}
      {headlights &&
        lights.map((p, i) => (
          <mesh key={i} position={p} material={materials().whiteGlow}>
            <boxGeometry args={[0.26, 0.09, 0.04]} />
          </mesh>
        ))}
    </group>
  );
}
