import { Material, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

/**
 * Comic shading for the existing lit materials.
 *
 * Lighting, shadows and textures are still computed by three's standard
 * pipeline (so every light, shadow and map in the scene keeps working); we only
 * replace the final step. Each fragment's luminance is quantised into a few
 * printed tonal bands — paper-white, light grey, mid grey, charcoal, ink — and
 * the boundaries between bands are rendered as screen-space halftone dots, the
 * way a printed comic resolves a gradient. Hue is preserved, so yellow stays
 * yellow at every band.
 *
 * Per-material control via `material.userData.comic`:
 *   false                   → leave the material untouched (signs, displays)
 *   { cell?: number }       → halftone cell size in CSS pixels (default 6)
 *   { halftone?: number }   → width of the dotted transitions, 0 = clean band edges,
 *                             1 = default; large smooth surfaces want less
 *   { mono?: boolean }      → print in greys only (for textured models whose colours
 *                             would otherwise survive the banding)
 *   { hatch?: boolean }     → hatch the two darkest transitions on vertical faces
 *                             instead of dots (masonry, platform walls, undercarriage)
 */
export interface ComicOptions {
  cell?: number;
  halftone?: number;
  hatch?: boolean;
  mono?: boolean;
}

const CHUNK = /* glsl */ `
float comicHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float comicHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float comicNoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(comicHash3(i), comicHash3(i + vec3(1,0,0)), f.x), mix(comicHash3(i + vec3(0,1,0)), comicHash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(comicHash3(i + vec3(0,0,1)), comicHash3(i + vec3(1,0,1)), f.x), mix(comicHash3(i + vec3(0,1,1)), comicHash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float comicNoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(comicHash(i), comicHash(i + vec2(1, 0)), f.x), mix(comicHash(i + vec2(0, 1)), comicHash(i + vec2(1, 1)), f.x), f.y);
}

float comicDot(vec2 frag, float cell) {
  // 45° rotated dot grid with slightly irregular dots, like a coarse print screen
  const float c = 0.70710678;
  vec2 p = mat2(c, -c, c, c) * frag / cell;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5 + (vec2(comicHash(id), comicHash(id + 7.0)) - 0.5) * 0.12;
  return length(f) * (0.9 + comicHash(id + 3.0) * 0.2);
}

// grain of a soft pencil / charcoal: for the lighter transitions
float comicGrain(vec2 frag) {
  // smudge scale, not pixel speckle: soft clumps a few pixels across
  return comicNoise2(frag / 5.0) * 0.5 + comicNoise2(frag / 17.0) * 0.5;
}

float comicHatch(vec2 frag, float cell) {
  // diagonal ink hatching, distance to the nearest line in 0..0.5
  const float c = 0.70710678;
  float u = (c * frag.x + c * frag.y) / (cell * 0.8);
  return abs(fract(u) - 0.5) * 1.44;
}

// Tonal bands in linear luminance. Levels are what the band prints as.
// 'dark' is the pattern used for the two darkest transitions (hatching on walls,
// dots on floors); 'dotv' is the halftone used for the lighter ones.
float comicTone(float lum, float dotv, float dark, float wobble) {
  // band edges wander a little across surfaces, like a brush rather than a ruler
  float x = log2(max(lum, 1e-5)) + wobble;
  // thresholds (log2 of linear luminance) and printed levels
  const float T0 = -5.9;  // ink   | charcoal
  const float T1 = -4.1;  // charcoal | mid
  const float T2 = -2.6;  // mid | light
  const float T3 = -1.45; // light | paper
  const float W = COMIC_W; // half-width of the halftone transition (in stops)
  float L0 = 0.0035, L1 = 0.022, L2 = 0.085, L3 = 0.3, L4 = 0.86;
  float lvl = L0;
  // each transition: inside the band edge, dots of the brighter level grow with x
  float t;
  t = clamp((x - (T0 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L1, step(dark, t * 0.72));
  t = clamp((x - (T1 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L2, step(dark, t * 0.72));
  t = clamp((x - (T2 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L3, step(dotv, t));
  t = clamp((x - (T3 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L4, step(dotv, t));
  // light sources and lamp-lit highlights keep their HDR value so bloom still finds them
  return lum > 1.25 ? lum : lvl;
}
`;

const APPLY = /* glsl */ `
{
  float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  vec3 wp = (inverse(viewMatrix) * vec4(-vViewPosition, 1.0)).xyz;
  float wobble = (comicNoise3(wp * 0.9) - 0.5) * 0.7 + (comicNoise3(wp * 3.1) - 0.5) * 0.25;
  float dotv = comicGrain(gl_FragCoord.xy);
  float dark = comicDot(gl_FragCoord.xy, COMIC_CELL);
  #if COMIC_HATCH
    // chosen materials hatch their shadow transitions on vertical faces
    vec3 wN = inverseTransformDirection(normal, viewMatrix);
    if (abs(wN.y) < 0.6) dark = comicHatch(gl_FragCoord.xy, COMIC_CELL);
  #endif
  float tone = comicTone(lum, dotv, dark, wobble);
  // keep hue: scale the lit colour to the printed tone, but flatten texture noise
  vec3 hue = outgoingLight / max(lum, 1e-5);
  float sat = max(max(hue.r, hue.g), hue.b) - min(min(hue.r, hue.g), hue.b);
  hue = mix(vec3(1.0), hue, clamp(sat * 1.2, 0.0, 1.0));
  #if COMIC_MONO
    hue = vec3(1.0);
  #endif
  outgoingLight = hue * tone;
}
#include <opaque_fragment>
`;

const PATCHED = new WeakSet<Material>();

export function applyComic(mat: Material, dpr: number) {
  if (PATCHED.has(mat)) return;
  if (!(mat instanceof MeshStandardMaterial) && !(mat instanceof MeshPhysicalMaterial)) return;
  const opts = mat.userData.comic as ComicOptions | false | undefined;
  if (opts === false) return;
  PATCHED.add(mat);
  const cell = ((opts && opts.cell) || 9) * dpr;
  // 0.28 stops each side by default: dots stay at band edges instead of filling whole surfaces
  const w = Math.max(0.001, 0.28 * (opts && opts.halftone !== undefined ? opts.halftone : 1));
  const hatch = opts && opts.hatch ? 1 : 0;
  const mono = opts && opts.mono ? 1 : 0;
  mat.onBeforeCompile = (shader) => {
    shader.defines = { ...(shader.defines ?? {}), COMIC_CELL: cell.toFixed(2), COMIC_W: w.toFixed(3), COMIC_HATCH: hatch, COMIC_MONO: mono };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CHUNK}`)
      .replace('#include <opaque_fragment>', APPLY);
  };
  mat.customProgramCacheKey = () => `comic-${cell.toFixed(2)}-${w.toFixed(3)}-${hatch}-${mono}`;
  // Comic surfaces read as printed matter, not polished metal.
  mat.envMapIntensity = 0;
  mat.needsUpdate = true;
}
