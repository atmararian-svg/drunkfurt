import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping } from 'three';
import { palette } from '../../config/palette';
import { radialGlow } from '../../materials/textures';
import * as tex from './cityTextures';

/**
 * The city's materials and how each one prints (comic options, see
 * render/comic.ts): clean band edges on large surfaces, dots only where light
 * falls off, hatching on stone.
 */
function build() {
  const std = (p: ConstructorParameters<typeof MeshStandardMaterial>[0], comic?: object) => {
    const m = new MeshStandardMaterial(p);
    if (comic) m.userData.comic = comic;
    return m;
  };
  const asphaltMap = tex.asphalt();
  const wet = tex.asphaltWet();
  wet.wrapS = wet.wrapT = RepeatWrapping;
  return {
    road: std({ map: asphaltMap, roughnessMap: wet, roughness: 1, metalness: 0.0, color: '#7a7a7a' }, { halftone: 0.5 }),
    plaza: std({ map: tex.paving('plaza', '#8f8d88', 2), roughness: 0.85 }, { halftone: 0.6 }),
    sidewalk: std({ map: tex.paving('sidewalk', '#76746f', 4), roughness: 0.8 }, { halftone: 0.6 }),
    curb: std({ color: '#a19f99', roughness: 0.7 }, { halftone: 0 }),
    marking: std({ color: '#d8d6cf', roughness: 0.6 }, { halftone: 0 }),
    rail: std({ color: '#8c8c8c', roughness: 0.3, metalness: 0.8 }, { halftone: 0 }),
    stationStone: std({ color: '#6f6d68', roughness: 0.9 }, { hatch: true }),
    stationFloor: std({ color: '#2b2b2b', roughness: 0.9 }, { halftone: 0 }),
    // facades glow faintly from their own texture so the drawn windows read in the dark,
    // and the few lit windows stand out
    facade: [0, 1, 2, 3].map((v) => std({ map: tex.facade(v), emissiveMap: tex.facade(v), emissive: new Color('#ffffff'), emissiveIntensity: 0.16, roughness: 0.9 }, { halftone: 0.4 })),
    shops: [0, 1].map((v) => std({ map: tex.shopfronts(v), emissiveMap: tex.shopfronts(v), emissive: new Color('#ffffff'), emissiveIntensity: 0.22, roughness: 0.8 }, { halftone: 0.3 })),
    plaster: std({ color: '#5a5955', roughness: 0.95 }, { hatch: true }),
    slate: std({ map: tex.slate(), roughness: 0.8 }, { halftone: 0 }),
    cornice: std({ color: '#8d8b86', roughness: 0.8 }, { halftone: 0 }),
    metal: std({ color: '#2a2b2c', roughness: 0.5, metalness: 0.5 }, { halftone: 0.4 }),
    bark: std({ color: '#2e2d2b', roughness: 0.95 }, { halftone: 0.5 }),
    glass: new MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.1, transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide }),
    lamp: new MeshBasicMaterial({ color: new Color(palette.lampWhite).multiplyScalar(3.4) }),
    warmLamp: new MeshBasicMaterial({ color: new Color('#f3e6c4').multiplyScalar(2.6) }),
    amber: new MeshBasicMaterial({ color: new Color(palette.yellow).multiplyScalar(2.4) }),
    amberOff: std({ color: '#3a3520', roughness: 0.5 }, { halftone: 0 }),
    pool: new MeshBasicMaterial({ map: radialGlow(), color: new Color(palette.lampWhite).multiplyScalar(0.14), transparent: true, blending: AdditiveBlending, depthWrite: false }),
    streak: new MeshBasicMaterial({ map: tex.streak(), color: new Color('#e8e4da').multiplyScalar(0.55), transparent: true, blending: AdditiveBlending, depthWrite: false }),
    puddle: std({ color: '#1a1a1c', roughness: 0.05, metalness: 0.2 }, { halftone: 0 }),
    carBody: [
      std({ color: '#2a2a2c', roughness: 0.35, metalness: 0.3 }, { halftone: 0.4 }),
      std({ color: '#55544f', roughness: 0.4, metalness: 0.2 }, { halftone: 0.4 }),
      std({ color: '#c8c6bf', roughness: 0.35, metalness: 0.1 }, { halftone: 0.4 }),
      std({ color: '#1a1a1a', roughness: 0.3, metalness: 0.3 }, { halftone: 0.4 }),
    ],
    carGlass: std({ color: '#121314', roughness: 0.1, metalness: 0.3 }, { halftone: 0 }),
    tyre: std({ color: '#121212', roughness: 0.9 }, { halftone: 0 }),
  };
}

let lib: ReturnType<typeof build> | null = null;
export const cityMaterials = () => (lib ??= build());
