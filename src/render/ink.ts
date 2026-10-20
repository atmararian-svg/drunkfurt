import { Effect } from 'postprocessing';
import { HalfFloatType, NearestFilter, ShaderMaterial, Texture, Uniform, Vector2, WebGLRenderTarget } from 'three';
import { Color } from 'three';
import { palette } from '../config/palette';

/** Render layer for geometry that gets ink lines. */
export const INK_LAYER = 5;
/** Geometry that draws its outer contour and overlaps, but no internal creases (people). */
export const INK_SILHOUETTE_LAYER = 7;
/** Opaque geometry that hides lines behind it but never draws its own. */
export const OCCLUDER_LAYER = 6;

/**
 * Writes view-space normal xy (rg), ink weight (b) and linear depth / far (a).
 * The standard chunks make it work for instanced meshes as well.
 */
export function createInkBufferMaterial(weight: number) {
  return new ShaderMaterial({
    uniforms: { uFar: { value: 1300 }, uWeight: { value: weight } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN;
      varying float vDepth;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal);
        vDepth = -mvPosition.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFar;
      uniform float uWeight;
      varying vec3 vN;
      varying float vDepth;
      void main() {
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        gl_FragColor = vec4(n.xy * 0.5 + 0.5, uWeight, vDepth / uFar);
      }
    `,
  });
}

export function createInkTarget() {
  const rt = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true });
  rt.texture.minFilter = rt.texture.magFilter = NearestFilter;
  return rt;
}

/**
 * Ink lines from the normal/depth buffer. Depth discontinuities (silhouettes)
 * print heavy; normal creases (architectural edges) print light; both thin out
 * and fade with distance so the far end of the hall dissolves into tone rather
 * than a mesh of wires. Only INK_LAYER geometry contributes, so glows, signs,
 * light spill, dust and sky never get outlined.
 */
export class InkEffect extends Effect {
  constructor(buffer: Texture) {
    super('InkEffect', FRAGMENT, {
      uniforms: new Map<string, Uniform>([
        ['tInk', new Uniform(buffer)],
        ['uTexel', new Uniform(new Vector2(1, 1))],
        ['uInk', new Uniform(new Color(palette.nearBlack).convertSRGBToLinear())],
        ['uWidth', new Uniform(1.0)],
        ['uFar', new Uniform(1300)],
        ['uDebug', new Uniform(0)],
        ['uTime', new Uniform(0)],
      ]),
    });
  }
  setSize(width: number, height: number) {
    (this.uniforms.get('uTexel')!.value as Vector2).set(1 / width, 1 / height);
  }
}

const FRAGMENT = /* glsl */ `
uniform sampler2D tInk;
uniform vec2 uTexel;
uniform vec3 uInk;
uniform float uWidth;
uniform float uFar;
uniform float uDebug;
uniform float uTime;

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}

vec4 S(vec2 uv) { return texture2D(tInk, uv); }

vec3 paper(vec3 col, vec2 px) {
  // paper: fibre and tooth, plus a warm tint where the page shows through
  float fib = n21(px * vec2(0.9, 0.12)) * 0.5 + n21(px * vec2(0.13, 0.8)) * 0.5;
  float tooth = n21(px * 0.55);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= 0.955 + fib * 0.06 + tooth * 0.03;
  return mix(col, col * vec3(1.0, 0.975, 0.92), smoothstep(0.25, 0.9, lum));
}

void mainImage(const in vec4 inputColor, const in vec2 uv0, out vec4 outputColor) {
  vec2 px = uv0 / uTexel;
  // the line "boils": its wobble is redrawn a few times a second, like animated ink
  float frame = floor(uTime * 4.0);
  vec2 jitter = (vec2(n21(px / 26.0 + frame * 3.1), n21(px / 26.0 + 40.0 + frame * 1.7)) - 0.5) * 1.6;
  vec2 uv = uv0 + jitter * uTexel;
  vec4 c = S(uv);
  if (uDebug > 0.5) { outputColor = vec4(c.rg, c.b, 1.0); return; }
  float dm = c.a * uFar;            // metres
  bool empty = c.a >= 0.999 || c.a <= 0.0;
  // line width: heavier close to the eye, hairline in the distance
  // pen pressure: width swells and thins along the line
  float pressure = 0.7 + n21(px / 18.0 + 11.0) * 0.75;
  float w = uWidth * mix(2.6, 1.0, smoothstep(3.0, 45.0, dm)) * pressure;
  vec2 o = uTexel * w;
  vec4 s[8];
  s[0] = S(uv + vec2( o.x, 0.0)); s[1] = S(uv + vec2(-o.x, 0.0));
  s[2] = S(uv + vec2(0.0,  o.y)); s[3] = S(uv + vec2(0.0, -o.y));
  s[4] = S(uv + o);               s[5] = S(uv - o);
  s[6] = S(uv + vec2(o.x, -o.y)); s[7] = S(uv + vec2(-o.x, o.y));

  if (empty || c.b < 0.25) { outputColor = vec4(paper(inputColor.rgb, px), inputColor.a); return; }
  float sil = 0.0;
  float crease = 0.0;
  vec3 n = vec3(c.rg * 2.0 - 1.0, 0.0);
  n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy)));
  for (int i = 0; i < 8; i++) {
    float d = s[i].a;
    bool e = d >= 0.999 || d <= 0.0;
    if (e) { sil = 1.0; continue; }                 // ink object against sky
    // relative depth jump; only the nearer side draws, so lines stay single
    float rel = (d - c.a) / max(c.a, 1e-5);
    sil = max(sil, smoothstep(0.05, 0.12, rel));
    if (s[i].b < 0.75 || c.b < 0.75) continue;      // creases only between full-ink surfaces
    vec3 m = vec3(s[i].rg * 2.0 - 1.0, 0.0);
    m.z = sqrt(max(0.0, 1.0 - dot(m.xy, m.xy)));
    crease = max(crease, smoothstep(0.3, 0.55, 1.0 - dot(n, m)));
  }
  float fade = 1.0 - smoothstep(55.0, 150.0, dm);
  // dry ink: the odd gap where the pen skipped
  float dry = smoothstep(0.12, 0.3, n21(px / 9.0 + frame * 0.7));
  float ink = max(sil, crease * 0.75) * fade * mix(0.55, 1.0, dry);
  outputColor = vec4(paper(mix(inputColor.rgb, uInk, ink), px), inputColor.a);
}
`;
