/**
 * The phone page's logo, liquid: after the supplied LiquidLogo (Framer), its shader and its behaviour as
 * they are: a finger drawn over the logo leaves wakes in it that swirl, pull and fade (1.4 s); with no
 * finger on it, a pseudo-pointer wanders over it slowly, so it is never quite still. Its defaults:
 * strength 0.06, radius 0.18, no chroma, idle on (strength 0.45, frequency 0.45).
 *
 * Its own small WebGL context (the logo's size, at the screen's density up to 3: the reference drew its
 * source at 3 × that, nothing gained on a phone), its buffers made once (the reference made new arrays
 * every frame), 30 frames a second while it only wanders, 60 while a finger is on it, none while the page
 * is hidden. Where WebGL is refused, the logo stays the plain drawing it is.
 */
const MAX_WAKES = 12;
const EFFECT_REFERENCE_PX = 400;
const P = { strength: 0.06, radius: 0.18, decay: 1400, idleStrength: 0.45, idleFrequency: 0.45 };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const VS = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
// (the reference's fragment shader, its chroma branch left out: it is off)
const FS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_logo;
uniform float u_time;
uniform vec4 u_wakes[12];
uniform vec2 u_wakeVelocity[12];
uniform int u_wakeCount;
uniform vec2 u_pointer;
uniform float u_pointerMix;
uniform float u_distortionStrength;
uniform float u_hoverRadius;
uniform float u_decayTime;
uniform vec2 u_aspect;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i); float b = hash(i + vec2(1.0, 0.0)); float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
vec2 toAspectSpace(vec2 v) { return v * u_aspect; }
vec2 fromAspectSpace(vec2 v) { return v / max(u_aspect, vec2(0.0001)); }
vec4 sampleSource(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(u_logo, uv);
}
vec3 unpremultiply(vec4 c) { return c.a > 0.0001 ? c.rgb / c.a : vec3(0.0); }
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 displacement = vec2(0.0);
  vec2 toPointerAspect = toAspectSpace(uv - u_pointer);
  float pointerDist = length(toPointerAspect) + 0.0001;
  float pointerRadius = u_hoverRadius * 1.5;
  float pointerFalloff = exp(-(pointerDist * pointerDist) / max(pointerRadius * pointerRadius, 0.00001));
  vec2 pointerDirAspect = toPointerAspect / pointerDist;
  vec2 pointerTangentAspect = vec2(-pointerDirAspect.y, pointerDirAspect.x);
  float n1 = noise(uv * 10.0 + vec2(u_time * 0.35, -u_time * 0.22));
  float n2 = noise(uv * 16.0 + vec2(-u_time * 0.28, u_time * 0.31));
  float idle = (n1 - 0.5) * 2.0 + (n2 - 0.5) * 1.2;
  vec2 pointerDispAspect = (pointerTangentAspect * (0.20 + idle * 0.08) - pointerDirAspect * 0.14) * pointerFalloff * u_pointerMix;
  displacement += fromAspectSpace(pointerDispAspect);
  for (int i = 0; i < 12; i++) {
    if (i >= u_wakeCount) break;
    vec2 wakePos = u_wakes[i].xy;
    float born = u_wakes[i].z;
    float force = u_wakes[i].w;
    vec2 velocity = u_wakeVelocity[i];
    float speed = length(velocity);
    float age = max(u_time - born, 0.0);
    float life = clamp(age / max(u_decayTime / 1000.0, 0.0001), 0.0, 1.0);
    float fade = pow(1.0 - life, 1.65);
    vec2 toPixelAspect = toAspectSpace(uv - wakePos);
    float dist = length(toPixelAspect) + 0.0001;
    vec2 radialAspect = toPixelAspect / dist;
    vec2 tangentAspect = vec2(-radialAspect.y, radialAspect.x);
    vec2 velocityAspect = toAspectSpace(velocity);
    float velocityAspectLen = length(velocityAspect);
    vec2 velocityDirAspect = velocityAspectLen > 0.0001 ? velocityAspect / velocityAspectLen : vec2(0.0, 0.0);
    float radius = u_hoverRadius * mix(1.15, 2.1, force);
    float falloff = exp(-(dist * dist) / max(radius * radius, 0.00001));
    float behind = max(0.0, dot(radialAspect, -velocityDirAspect));
    float ahead = max(0.0, dot(radialAspect, velocityDirAspect));
    vec2 dragAspect = velocityDirAspect * falloff * fade * behind * (0.30 + speed * 0.08);
    vec2 pullAspect = -radialAspect * falloff * fade * (0.22 + force * 0.25);
    vec2 swellAspect = radialAspect * falloff * fade * ahead * 0.07;
    vec2 swirlAspect = tangentAspect * falloff * fade * (0.32 + force * 0.18 + speed * 0.03);
    displacement += fromAspectSpace((dragAspect + swirlAspect + pullAspect + swellAspect) * force);
  }
  vec2 finalUV = uv + displacement * u_distortionStrength;
  vec4 src = sampleSource(finalUV);
  gl_FragColor = vec4(unpremultiply(src) * src.a, src.a);
}`;

interface Wake {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
  force: number;
}

export function mountLiquidLogo(host: HTMLElement, svg: string) {
  const canvas = document.createElement('canvas');
  canvas.className = 'logo-liquid';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true }) as WebGLRenderingContext | null;
  if (!gl) return () => undefined;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VS);
  const fs = sh(gl.FRAGMENT_SHADER, FS);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[liquid logo]', gl.getProgramInfoLog(program));
    return () => undefined;
  }
  gl.useProgram(program);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const u = (n: string) => gl.getUniformLocation(program, n);
  const U = {
    logo: u('u_logo'),
    time: u('u_time'),
    wakes: u('u_wakes'),
    vel: u('u_wakeVelocity'),
    count: u('u_wakeCount'),
    pointer: u('u_pointer'),
    mix: u('u_pointerMix'),
    strength: u('u_distortionStrength'),
    radius: u('u_hoverRadius'),
    decay: u('u_decayTime'),
    aspect: u('u_aspect'),
  };
  gl.uniform1i(U.logo, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let alive = true;
  let raf = 0;
  let last = -Infinity;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let ready = false;
  const start = performance.now();
  const wakes: Wake[] = [];
  const wakeData = new Float32Array(MAX_WAKES * 4);
  const velData = new Float32Array(MAX_WAKES * 2);
  const raw = { x: 0.5, y: 0.5 };
  const smooth = { x: 0.5, y: 0.5 };
  const vel = { x: 0, y: 0 };
  let mix = 0;
  let touching = false;
  let lastPointer: { x: number; y: number; t: number } | null = null;
  let lastInjected: { x: number; y: number; t: number } | null = null;
  let lastMove = performance.now();
  let idle = { active: false, start: 0, fadeIn: 1.4, ax1: 0, ax2: 0, ay1: 0, ay2: 0, fx1: 0, fx2: 0, fy1: 0, fy2: 0, px1: 0, px2: 0, py1: 0, py2: 0, last: null as null | { x: number; y: number; t: number } };

  const inject = (x: number, y: number, vx: number, vy: number, force: number) => {
    const now = performance.now();
    while (wakes.length && now - wakes[0].t >= P.decay) wakes.shift();
    wakes.push({ x, y, t: now, vx, vy, force: clamp(force, 0.16, 1.5) });
    while (wakes.length > MAX_WAKES) wakes.shift();
  };

  /** The logo drawn white at the canvas's size, into the texture. */
  const upload = () =>
    new Promise<void>((resolve) => {
      const r = host.getBoundingClientRect();
      dpr = Math.min(3, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = W;
      canvas.height = H;
      const im = new Image();
      const white = svg.replace(/currentColor/g, '#fff').replace(/<svg\b([^>]*)>/, (_m, a: string) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="${W}" height="${H}">`);
      im.onload = () => {
        if (!alive) return resolve();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        ready = true;
        host.classList.add('has-liquid');
        resolve();
      };
      im.onerror = () => resolve();
      im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(white)}`;
    });

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!ready || document.hidden) return;
    // (60 a second with a finger on it, 30 while it only wanders)
    if (now - last < (touching ? 12 : 30)) return;
    last = now;
    if (!idle.active && !touching && now - lastMove > 1200 + (1 - P.idleFrequency) * 1400) {
      const s = P.idleStrength;
      idle = { active: true, start: now, fadeIn: 1.4, ax1: 0.5 + s * 0.18, ax2: 0.08 + s * 0.06, ay1: 0.38 + s * 0.16, ay2: 0.07 + s * 0.05, fx1: rand(0.12, 0.2), fx2: rand(0.28, 0.48), fy1: rand(0.1, 0.18), fy2: rand(0.24, 0.42), px1: rand(0, 6.28), px2: rand(0, 6.28), py1: rand(0, 6.28), py2: rand(0, 6.28), last: null };
    }
    if (idle.active) {
      const t = (now - idle.start) / 1000;
      const b = clamp(t / idle.fadeIn, 0, 1);
      const x = 0.5 + (idle.ax1 * Math.sin(t * idle.fx1 * Math.PI * 2 + idle.px1) + idle.ax2 * Math.sin(t * idle.fx2 * Math.PI * 2 + idle.px2)) * b;
      const y = 0.5 + (idle.ay1 * Math.sin(t * idle.fy1 * Math.PI * 2 + idle.py1) + idle.ay2 * Math.sin(t * idle.fy2 * Math.PI * 2 + idle.py2)) * b;
      raw.x = x;
      raw.y = y;
      if (idle.last) {
        const dt = Math.max((now - idle.last.t) / 1000, 1e-4);
        inject(x, y, (x - idle.last.x) / dt, (y - idle.last.y) / dt, clamp(0.07 + P.idleStrength * 0.14, 0.06, 0.24));
      }
      idle.last = { x, y, t: now };
    }
    const on = touching || idle.active;
    mix = lerp(mix, on ? 1 : 0, on ? 0.12 : 0.08);
    smooth.x = lerp(smooth.x, raw.x, 0.07);
    smooth.y = lerp(smooth.y, raw.y, 0.07);
    while (wakes.length && now - wakes[0].t >= P.decay) wakes.shift();
    wakeData.fill(0);
    velData.fill(0);
    wakes.forEach((w, i) => {
      wakeData[i * 4] = w.x;
      wakeData[i * 4 + 1] = w.y;
      wakeData[i * 4 + 2] = (w.t - start) / 1000;
      wakeData[i * 4 + 3] = w.force;
      velData[i * 2] = w.vx;
      velData[i * 2 + 1] = -w.vy;
    });
    const minCss = Math.max(1, Math.min(W / dpr, H / dpr));
    const k = EFFECT_REFERENCE_PX / minCss;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.time, (now - start) / 1000);
    gl.uniform4fv(U.wakes, wakeData);
    gl.uniform2fv(U.vel, velData);
    gl.uniform1i(U.count, wakes.length);
    gl.uniform2f(U.pointer, smooth.x, smooth.y);
    gl.uniform1f(U.mix, mix);
    gl.uniform1f(U.strength, P.strength * k);
    gl.uniform1f(U.radius, P.radius * k);
    gl.uniform1f(U.decay, P.decay);
    gl.uniform2f(U.aspect, W / Math.min(W, H), H / Math.min(W, H));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  // the finger (or a mouse, where there is one) on the logo
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0) return null;
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  const move = (e: PointerEvent) => {
    const p = at(e);
    if (!p) return;
    const now = performance.now();
    raw.x = p.x;
    raw.y = p.y;
    let vx = 0;
    let vy = 0;
    if (lastPointer) {
      const dt = Math.max((now - lastPointer.t) / 1000, 1e-4);
      vx = (p.x - lastPointer.x) / dt;
      vy = (p.y - lastPointer.y) / dt;
    }
    vel.x = lerp(vel.x, vx, 0.2);
    vel.y = lerp(vel.y, vy, 0.2);
    const speed = Math.hypot(vel.x, vel.y);
    const force = clamp(0.16 + speed * 0.018, 0.16, 1.25);
    const moved = lastInjected ? Math.hypot(p.x - lastInjected.x, p.y - lastInjected.y) : 1;
    if (touching && (!lastInjected || now - lastInjected.t > 8) && moved > 0.0025) {
      inject(p.x, p.y, vel.x, vel.y, force);
      lastInjected = { x: p.x, y: p.y, t: now };
    }
    lastPointer = { x: p.x, y: p.y, t: now };
  };
  const enter = (e: PointerEvent) => {
    touching = true;
    idle.active = false;
    idle.last = null;
    lastMove = performance.now();
    move(e);
    inject(raw.x, raw.y, 0, 0, 0.4);
  };
  const leave = () => {
    touching = false;
    lastPointer = null;
    lastInjected = null;
    vel.x = vel.y = 0;
    lastMove = performance.now();
  };
  const onMove = (e: PointerEvent) => {
    lastMove = performance.now();
    idle.active = false;
    idle.last = null;
    if (touching) move(e);
  };
  canvas.addEventListener('pointerdown', enter);
  canvas.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && enter(e));
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', leave);
  canvas.addEventListener('pointercancel', leave);
  canvas.addEventListener('pointerleave', leave);

  host.append(canvas);
  // (the observer reports the size once at the start too: the first upload)
  const ro = new ResizeObserver(() => void upload());
  ro.observe(host);
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
    host.classList.remove('has-liquid');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}
