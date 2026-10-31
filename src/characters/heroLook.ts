import {
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';

/**
 * You, as you are seen in the fight (the portrait the owner supplied): dark hair swept back, a
 * full dark beard, warm brown skin, a black T-shirt, dark jeans. Printed in the "Spider-Verse"
 * manner of the reference model, without its suit: flat, banded colour lit by the street, a hot
 * red rim on one side and a cold violet one on the other, coarse halftone in the transitions, and
 * the print slightly off register (a red and a blue outline, each shifted a little, behind the
 * black one the page's ink already draws).
 *
 * Your body only shows while the camera has stepped back from your eyes; `fade` (0 … 1) brings it
 * in and out through an ordered dither, so it never pops in front of the lens.
 */
export interface HeroLook {
  fade(v: number): void;
  dispose(): void;
}

/** Shared by every material of this look: how much of you shows, and the screen size (for the off-register shift). */
const U = {
  uFade: { value: 0 },
  uPx: { value: [1 / 1280, 1 / 720] as [number, number] },
};

const DITHER = /* glsl */ `
uniform float uFade;
float heroBayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4 × 4 ordered dither, thresholds 0..15 / 16
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[int(i)] + 0.5) / 16.0;
}
`;

// banded colour, the two rims and halftone dots, on top of three's own lighting
const SHADE = /* glsl */ `
{
  if (heroBayer(gl_FragCoord.xy) > uFade) discard;
  vec3 alb = max(diffuseColor.rgb, vec3(1e-4));
  #ifdef HERO_BEARD
  {
    // a full, dark beard and moustache painted on the skin, placed on the body as it was bound (metres,
    // feet on the ground): along the jaw from the sideburns, over the chin and under it, the lips left bare
    vec3 r = vRest;
    float ax = abs(r.x);
    float y = r.y - HERO_TOP;
    float fz = r.z - HERO_CZ;
    // the upper edge: across the cheeks, rising to the sideburns at the sides
    float cheek = -0.165 + 0.07 * smoothstep(0.025, 0.07, ax);
    float noise = (fract(sin(dot(floor(r.xy * 900.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.008;
    float beard = (1.0 - smoothstep(cheek - 0.004, cheek + 0.004, y + noise)) // below the cheek line
                * smoothstep(-0.285, -0.262, y + noise)                // down onto the throat
                * smoothstep(-0.03, -0.005, fz + 0.012 * smoothstep(0.03, 0.07, ax)); // in front of the ears
    // the lips: a small bare band across the mouth
    float lips = (1.0 - smoothstep(0.022, 0.03, ax)) * smoothstep(-0.2, -0.194, y) * (1.0 - smoothstep(-0.182, -0.176, y));
    beard *= 1.0 - lips;
    alb = mix(alb, vec3(0.012, 0.009, 0.008), beard);
  }
  #endif
  float aLum = dot(alb, vec3(0.2126, 0.7152, 0.0722));
  float lit = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) / aLum;
  // dots: a 45° screen, the size of the print's own cells
  const float c = 0.70710678;
  vec2 dp = mat2(c, -c, c, c) * gl_FragCoord.xy / HERO_CELL;
  float dotv = length(fract(dp) - 0.5);
  // three printed bands of the lit colour; the edges between them in dots
  float x = log2(max(lit, 1e-4));
  float b1 = clamp((x + 3.2) / 0.9, 0.0, 1.0);
  float b2 = clamp((x + 1.4) / 0.9, 0.0, 1.0);
  float tone = mix(0.55, 0.8, step(dotv, b1 * 0.72));
  tone = mix(tone, 1.0, step(dotv, b2 * 0.72));
  vec3 col = alb * tone * HERO_GAIN;
  // rims: the hot red from the left of the frame, the cold violet from the right and above
  vec3 n = normalize(normal);
  vec3 v = normalize(vViewPosition);
  float edge = 1.0 - abs(dot(n, v));
  float red = smoothstep(0.52, 0.6, edge * (0.55 + 0.75 * max(-n.x, 0.0)));
  float blue = smoothstep(0.52, 0.6, edge * (0.3 + 0.75 * max(n.x, 0.0) + 0.3 * max(n.y, 0.0)));
  // the inner side of each rim breaks into dots
  float redDots = step(dotv, smoothstep(0.38, 0.52, edge * (0.55 + 0.75 * max(-n.x, 0.0))) * 0.6);
  float blueDots = step(dotv, smoothstep(0.38, 0.52, edge * (0.3 + 0.75 * max(n.x, 0.0) + 0.3 * max(n.y, 0.0))) * 0.6);
  col = mix(col, vec3(0.98, 0.13, 0.22), max(red, redDots * 0.85) * HERO_RIM);
  col = mix(col, vec3(0.36, 0.25, 1.0), max(blue, blueDots * 0.8) * HERO_RIM * (1.0 - red));
  outgoingLight = col;
}
#include <opaque_fragment>
`;

interface HeadMark {
  /** Top of the head and the middle of its depth (m, the body as bound, feet on the ground), and the model's scale (m per unit). */
  top: number;
  cz: number;
  scale: number;
}

/**
 * Where the head is in the pose the body was bound in (not the pose he stands in, which is lower):
 * its top and the middle of its depth, from the skin's own vertices, in metres.
 */
function headMark(model: Object3D, scale: number): HeadMark {
  let top = -1e9;
  const v = new Vector3();
  const skins: SkinnedMesh[] = [];
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && /body/i.test(`${m.name} ${(m.material as Material).name}`)) skins.push(m);
  });
  for (const m of skins) {
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) top = Math.max(top, v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix).y * scale);
  }
  let minZ = 1e9;
  let maxZ = -1e9;
  for (const m of skins) {
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.bindMatrix).multiplyScalar(scale);
      if (v.y < top - 0.12) continue;
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
  }
  return { top, cz: (minZ + maxZ) / 2, scale };
}

const shaded = (color: string, opts: { gain?: number; rim?: number; map?: Texture | null; normalMap?: MeshStandardMaterial['normalMap']; cards?: boolean; beard?: HeadMark } = {}) => {
  const mat = new MeshStandardMaterial({
    color,
    map: opts.map ?? null,
    normalMap: opts.normalMap ?? null,
    roughness: 0.85,
    metalness: 0,
    alphaTest: opts.cards ? 0.4 : 0,
  });
  if (opts.cards) mat.side = DoubleSide;
  if (mat.normalMap) mat.normalScale.set(0.6, 0.6);
  // not the street's print: this look has its own
  mat.userData.comic = false;
  mat.envMapIntensity = 0;
  const gain = (opts.gain ?? 1).toFixed(3);
  const rim = (opts.rim ?? 1).toFixed(3);
  mat.onBeforeCompile = (s) => {
    s.uniforms.uFade = U.uFade;
    s.defines = { ...(s.defines ?? {}), HERO_CELL: (7 * Math.min(2, window.devicePixelRatio || 1)).toFixed(2), HERO_GAIN: gain, HERO_RIM: rim };
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${DITHER}`).replace('#include <opaque_fragment>', SHADE);
    const b = opts.beard;
    if (b) {
      Object.assign(s.defines, { HERO_BEARD: 1, HERO_TOP: b.top.toFixed(4), HERO_CZ: b.cz.toFixed(4), HERO_K: b.scale.toFixed(6) });
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_SKINNING\nvRest = (bindMatrix * vec4(position, 1.0)).xyz * HERO_K;\n#else\nvRest = position * HERO_K;\n#endif');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;');
    }
  };
  mat.customProgramCacheKey = () => `hero-${gain}-${rim}-${!!opts.cards}-${opts.beard ? 'beard' : ''}`;
  return mat;
};

/** An outline shell behind the mesh: grown along its normals, shifted on the page by `shift` pixels. */
const shell = (color: string, grow: number, shift: [number, number], skinned = true) => {
  const mat = new MeshBasicMaterial({ color: new Color(color), side: BackSide });
  mat.userData.comic = false;
  mat.onBeforeCompile = (s) => {
    s.uniforms.uFade = U.uFade;
    s.uniforms.uPx = U.uPx;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec2 uPx;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\ntransformed += normalize(${skinned ? 'objectNormal' : 'normal'}) * ${grow.toFixed(4)};`)
      .replace('#include <project_vertex>', `#include <project_vertex>\ngl_Position.xy += vec2(${shift[0].toFixed(2)}, ${shift[1].toFixed(2)}) * 2.0 * uPx * gl_Position.w;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${DITHER}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\nif (heroBayer(gl_FragCoord.xy) > uFade) discard;`);
  };
  mat.customProgramCacheKey = () => `hero-shell-${color}-${grow}-${shift.join(',')}-${skinned}`;
  return mat;
};

/** Hair strands for the swept-back hair (light streaks running back over the head). */
const strands = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 128, 128);
  for (let k = 0; k < 70; k++) {
    const px = (k * 53) % 128;
    x.strokeStyle = `rgba(0,0,0,${0.25 + ((k * 31) % 5) * 0.1})`;
    x.lineWidth = 1 + ((k * 17) % 3);
    x.beginPath();
    x.moveTo(px, 0);
    x.bezierCurveTo(px + 6, 40, px - 6, 90, px + 3, 128);
    x.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
};

/**
 * Dresses the walking man as you: his materials replaced by this look (by what each mesh is),
 * the hair (`hair`, already fitted to his head) given its own, and the off-register shells added
 * for the body, clothes and hair.
 */
export function dressHero(model: Object3D, hair: Mesh, scale: number): HeroLook {
  const head = headMark(model, scale);
  const made: Material[] = [];
  const hairMap = strands();
  const keep = <T extends Material>(m: T) => (made.push(m), m);
  const skin = keep(shaded('#b8673d', { gain: 1.5, beard: head }));
  const shells = [keep(shell('#ff1f3d', 0.9, [-2.2, 1.2])), keep(shell('#4b3bff', 0.9, [2.2, -1.2]))];
  const shellTargets: SkinnedMesh[] = [];
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isMesh) return;
    const src = m.material as MeshStandardMaterial;
    const name = `${m.name} ${src.name}`;
    let mat: MeshStandardMaterial;
    if (/beard|moustache/i.test(name)) mat = keep(shaded('#5a4a44', { map: src.map, cards: true, gain: 1, rim: 0.8 }));
    else if (/top/i.test(name)) mat = keep(shaded('#1a1a1d', { gain: 1.6 }));
    else if (/bottom/i.test(name)) mat = keep(shaded('#232a3c', { gain: 1.5 }));
    else if (/shoe/i.test(name)) mat = keep(shaded('#101010', { gain: 1.2 }));
    else if (/eye/i.test(name)) mat = keep(shaded('#d9d4cc', { rim: 0 }));
    else mat = skin;
    m.material = mat;
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.userData.ink = /beard|moustache|eye/i.test(name) ? false : 'silhouette';
    if (m.isSkinnedMesh && !/beard|moustache|eye/i.test(name)) shellTargets.push(m);
  });
  const hairMat = keep(shaded('#16100e', { map: hairMap, gain: 1.4, rim: 0.85 }));
  hair.material = hairMat;
  hair.castShadow = true;
  hair.userData.ink = 'silhouette';
  // the shells: copies of the skinned meshes that share their geometry and skeleton
  for (const m of shellTargets) {
    for (const mat of shells) {
      const c = new SkinnedMesh(m.geometry, mat);
      c.bind(m.skeleton, m.bindMatrix);
      c.frustumCulled = false;
      c.userData.ink = 'none';
      c.renderOrder = -1;
      m.parent!.add(c);
    }
  }
  for (const mat of [shell('#ff1f3d', 0.006, [-2.2, 1.2], false), shell('#4b3bff', 0.006, [2.2, -1.2], false)]) {
    keep(mat);
    const c = new Mesh(hair.geometry, mat);
    c.userData.ink = 'none';
    hair.add(c);
  }
  return {
    fade(v) {
      U.uFade.value = Math.min(1, Math.max(0, v)) * 1.0001;
      U.uPx.value = [1 / Math.max(1, window.innerWidth), 1 / Math.max(1, window.innerHeight)];
    },
    dispose() {
      made.forEach((m) => m.dispose());
      hairMap.dispose();
    },
  };
}
