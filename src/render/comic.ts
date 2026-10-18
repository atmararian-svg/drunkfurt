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
 *   false                     → leave the material untouched (signs, displays)
 *   { cell?: number }         → halftone cell size in CSS pixels (default 5)
 *   { flat?: number }         → 0..1, pulls texture detail towards the band value
 */
export interface ComicOptions {
  cell?: number;
  flat?: number;
}

const CHUNK = /* glsl */ `
float comicDot(vec2 frag, float cell) {
  // 45° rotated dot grid, distance to the nearest dot centre in 0..~0.71
  const float c = 0.70710678;
  vec2 p = mat2(c, -c, c, c) * frag / cell;
  vec2 f = fract(p) - 0.5;
  return length(f);
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
float comicTone(float lum, float dotv, float dark) {
  float x = log2(max(lum, 1e-5));
  // thresholds (log2 of linear luminance) and printed levels
  const float T0 = -5.9;  // ink   | charcoal
  const float T1 = -4.1;  // charcoal | mid
  const float T2 = -2.6;  // mid | light
  const float T3 = -1.45; // light | paper
  const float W = 0.4;    // half-width of the halftone transition (in stops)
  float L0 = 0.0035, L1 = 0.022, L2 = 0.085, L3 = 0.3, L4 = 0.86;
  float lvl = L0;
  // each transition: inside the band edge, dots of the brighter level grow with x
  float t;
  t = clamp((x - (T0 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L1, step(dark, t * 0.72));
  t = clamp((x - (T1 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L2, step(dark, t * 0.72));
  t = clamp((x - (T2 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L3, step(dotv, t * 0.72));
  t = clamp((x - (T3 - W)) / (2.0 * W), 0.0, 1.0); lvl = mix(lvl, L4, step(dotv, t * 0.72));
  // light sources and lamp-lit highlights keep their HDR value so bloom still finds them
  return lum > 1.25 ? lum : lvl;
}
`;

const APPLY = /* glsl */ `
{
  float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float dotv = comicDot(gl_FragCoord.xy, COMIC_CELL);
  // vertical surfaces take hatching in the shadows, horizontal ones keep dots
  vec3 wN = inverseTransformDirection(normal, viewMatrix);
  float dark = abs(wN.y) < 0.6 ? comicHatch(gl_FragCoord.xy, COMIC_CELL) : dotv;
  float tone = comicTone(lum, dotv, dark);
  // keep hue: scale the lit colour to the printed tone, but flatten texture noise
  vec3 hue = outgoingLight / max(lum, 1e-5);
  float sat = max(max(hue.r, hue.g), hue.b) - min(min(hue.r, hue.g), hue.b);
  hue = mix(vec3(1.0), hue, clamp(sat * 1.2, 0.0, 1.0));
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
  const cell = ((opts && opts.cell) || 5) * dpr;
  mat.onBeforeCompile = (shader) => {
    shader.defines = { ...(shader.defines ?? {}), COMIC_CELL: cell.toFixed(2) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CHUNK}`)
      .replace('#include <opaque_fragment>', APPLY);
  };
  mat.customProgramCacheKey = () => `comic-${cell.toFixed(2)}`;
  // Comic surfaces read as printed matter, not polished metal.
  mat.envMapIntensity = 0;
  mat.needsUpdate = true;
}
