import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from 'three';
import { palette } from '../config/palette';
import * as tex from './textures';

/**
 * Shared material library. Materials are created once and reused across meshes
 * so the renderer compiles a small, stable set of programs.
 */
function build() {
  const std = (p: ConstructorParameters<typeof MeshStandardMaterial>[0]) => new MeshStandardMaterial(p);

  const paving = tex.platformPaving();
  const concrete = tex.concrete();
  const ballast = tex.ballast();
  const tactile = tex.tactileBump();

  return {
    // --- station surfaces
    platform: std({
      map: paving,
      roughness: 0.82,
      metalness: 0,
      color: '#ffffff',
    }),
    platformEdge: std({ color: '#a9a8a3', roughness: 0.7, map: concrete }),
    platformSide: std({ color: '#55554f', roughness: 0.95, map: concrete }),
    safetyLine: std({ color: '#e9e8e2', roughness: 0.6 }),
    tactile: std({ color: '#8f8e8a', roughness: 0.75, bumpMap: tactile, bumpScale: 2.5 }),
    concrete: std({ color: '#6c6c69', roughness: 0.92, map: concrete }),
    concourseFloor: std({ color: '#8a8984', roughness: 0.45, map: concrete }),

    // --- track
    ballast: std({ map: ballast, roughness: 1, color: '#9a9a9a' }),
    sleeper: std({ color: '#5a5955', roughness: 0.9, map: concrete }),
    rail: std({ color: '#8b8b8b', roughness: 0.32, metalness: 0.85 }),
    railRust: std({ color: '#3a3532', roughness: 0.9, metalness: 0.3 }),

    // --- hall structure
    steel: std({ color: '#3b3c3d', roughness: 0.55, metalness: 0.55 }),
    steelLight: std({ color: '#6d6e6f', roughness: 0.5, metalness: 0.5 }),
    roofSheet: std({ color: '#151515', roughness: 0.9, side: DoubleSide }),
    roofGlass: std({
      map: tex.roofGlazing(),
      emissiveMap: tex.roofGlazing(),
      emissive: new Color('#ffffff'),
      emissiveIntensity: 3.6,
      color: '#202226',
      roughness: 0.25,
      metalness: 0.1,
      side: DoubleSide,
    }),
    pier: std({ color: '#5d5d5a', roughness: 0.85, map: concrete }),
    catenary: std({ color: '#2a2a2a', roughness: 0.4, metalness: 0.8 }),

    // --- platform furniture
    mast: std({ color: '#2b2c2d', roughness: 0.5, metalness: 0.6 }),
    fixture: std({ color: '#1e1e1f', roughness: 0.45, metalness: 0.6 }),
    lampLens: new MeshBasicMaterial({ color: new Color(palette.lampWhite).multiplyScalar(4.2) }),
    /** Separate instance so one tired fluorescent can flicker on its own. */
    lampLensFlicker: new MeshBasicMaterial({ color: new Color(palette.lampWhite).multiplyScalar(4.2) }),
    lampLensDim: new MeshBasicMaterial({ color: new Color(palette.lampWhite).multiplyScalar(2.2) }),
    signDark: std({ color: '#141414', roughness: 0.6, metalness: 0.2 }),
    benchMetal: std({ color: '#7d7e7f', roughness: 0.38, metalness: 0.75 }),
    binMetal: std({ color: '#3d3e3f', roughness: 0.45, metalness: 0.6 }),
    yellowPaint: std({ color: palette.yellow, roughness: 0.55 }),
    yellowGlow: new MeshBasicMaterial({ color: new Color(palette.yellow).multiplyScalar(2.2) }),
    whiteGlow: new MeshBasicMaterial({ color: new Color(palette.offWhite).multiplyScalar(1.6) }),
    glassCase: new MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.05,
      transmission: 0,
      transparent: true,
      opacity: 0.12,
      metalness: 0,
      depthWrite: false,
    }),

    // --- train
    trainBody: new MeshPhysicalMaterial({
      color: '#e7e6e1',
      roughness: 0.38,
      metalness: 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    }),
    trainBodyDirty: new MeshPhysicalMaterial({
      color: '#c9c8c3',
      roughness: 0.5,
      metalness: 0.05,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
    }),
    trainTrim: std({ color: '#1c1c1d', roughness: 0.35, metalness: 0.3 }),
    trainRubber: std({ color: '#0f0f0f', roughness: 0.9 }),
    trainUnder: std({ color: '#1a1a1a', roughness: 0.85, metalness: 0.3 }),
    trainInterior: std({ color: '#8f8d88', roughness: 0.7 }),
    trainFloor: std({ color: '#3b3b3b', roughness: 0.85 }),
    stainless: std({ color: '#c8c8c8', roughness: 0.22, metalness: 1 }),
    wheel: std({ color: '#4a4a4a', roughness: 0.4, metalness: 0.85 }),

    // --- effects
    lightPool: new MeshBasicMaterial({
      map: tex.radialGlow(),
      color: new Color(palette.lampWhite).multiplyScalar(0.16),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
    windowSpill: new MeshBasicMaterial({
      map: tex.windowSpill(),
      color: new Color(palette.interiorWhite).multiplyScalar(0.11),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  };
}

let lib: ReturnType<typeof build> | null = null;
export const materials = () => (lib ??= build());
export type MaterialLib = ReturnType<typeof build>;
