import {
  DoubleSide,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderer,
} from 'three';
import letterUrl from '../assets/letter.png';
import { letter } from '../scenes/city/letter';
import { pinScroll } from '../core/timeline';

/**
 * Reading the letter, after Framer's "CrumpledPaper Reveal": the image starts
 * as a crumpled ball and unfolds, in the middle of the page, into a flat print
 * that keeps its creases, with soft shadow, a slight corner curl and light
 * that answers the pointer. The component's own code is not public (it is
 * copied into Framer projects, not published as source), so this is a
 * reconstruction of its behaviour, in WebGL through three.js, which the page
 * already uses:
 *
 *  - one subdivided sheet with the letter (src/assets/letter.png, the supplied
 *    image, at its own aspect ratio, never cropped) as its texture;
 *  - a vertex shader moves each point between the flat sheet (plus fine
 *    creases, a ridged noise, and a curl at the corners) and its place on a
 *    lumpy ball; the middle unfolds first, the edges last, as paper does;
 *  - the facets are shaded from their own screen-space normals, so the ball
 *    reads as crumpled paper and the flat sheet keeps its creases; the light
 *    leans towards the pointer; the back of the sheet is plain paper.
 *
 * Around it: the page darkens (a layer over everything but the letter, fading
 * in), the cursor becomes CLICK TO CLOSE (a label that follows the pointer),
 * and a click closes it (the sheet folds back up, the dark fades out). On touch
 * screens, and for the keyboard, there is a visible close button; Escape
 * closes too. While it is open the scroll is held and nothing reaches the 3D
 * scene. If WebGL is unavailable, the image itself unfolds in CSS instead.
 */
const OPEN_MS = 1700;
const CLOSE_MS = 900;
/** The sheet's aspect (width / height): the supplied image's, 448 × 563. */
const ASPECT = 448 / 563;

const vertex = /* glsl */ `
uniform float uUnfold;
uniform float uTime;
varying vec2 vUv;
varying vec3 vPos;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float ridge(vec2 p){ float r=0.0, a=0.5; for(int i=0;i<4;i++){ r += a*(1.0-abs(n2(p)*2.0-1.0)); p*=2.03; a*=0.5; } return r; }
void main(){
  vUv = uv;
  vec3 flat3 = position;
  // creases that stay after unfolding, and a curl at the corners
  flat3.z += (ridge(uv*vec2(5.0,6.0)) - 0.5) * 0.018;
  float corner = smoothstep(0.55, 1.0, max(abs(uv.x-0.5), abs(uv.y-0.5)) * 2.0);
  flat3.z += corner * corner * 0.035;
  // the ball: each point pulled onto a lumpy sphere, by its direction from the middle of the sheet
  vec2 c = position.xy;
  vec3 dir = normalize(vec3(c.x * 1.7, c.y * 1.4, (n2(uv*7.0) - 0.5) * 1.6 + 0.001));
  float lump = 0.8 + 0.45 * n2(uv*9.0 + 3.0) + 0.25 * ridge(uv*13.0);
  vec3 ball = dir * 0.16 * lump;
  // the middle opens first, the edges last
  float r = length((uv - 0.5) * vec2(1.0, 1.25));
  float u = clamp((uUnfold * 1.45 - r * 0.55), 0.0, 1.0);
  u = u * u * (3.0 - 2.0 * u);
  vec3 p = mix(ball, flat3, u);
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const fragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uLight;
uniform float uUnfold;
varying vec2 vUv;
varying vec3 vPos;
void main(){
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (!gl_FrontFacing) n = -n;
  vec3 l = normalize(vec3(uLight * 0.8, 1.0));
  float d = clamp(dot(n, l), 0.0, 1.0);
  // crumpled, the facets are strongly shaded; flat, only the creases show
  float shade = mix(0.55 + 0.6 * d, 0.86 + 0.18 * d, smoothstep(0.6, 1.0, uUnfold));
  vec3 paper = vec3(0.925, 0.905, 0.86);
  vec3 col = gl_FrontFacing ? texture2D(uMap, vUv).rgb : paper;
  gl_FragColor = vec4(col * shade, 1.0);
  #include <colorspace_fragment>
}`;

interface Open {
  root: HTMLDivElement;
  close: () => void;
}
let current: Open | null = null;
let picture: Promise<HTMLImageElement> | null = null;
const image = () =>
  (picture ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = letterUrl;
  }));

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Opens the letter (once at a time). `onClosed` runs when it has folded away. */
export function openLetter(onClosed: () => void) {
  if (current) return;
  letter.open = true;
  pinScroll(true);
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'letter-layer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'The letter');
  const dim = document.createElement('div');
  dim.className = 'letter-dim';
  const stageEl = document.createElement('div');
  stageEl.className = 'letter-stage';
  const label = document.createElement('div');
  label.className = 'letter-cursor';
  label.textContent = 'CLICK TO CLOSE';
  label.setAttribute('aria-hidden', 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'letter-close';
  button.textContent = 'CLICK TO CLOSE';
  // for assistive technology: the letter's own words are in the image; it is described as what it is
  const alt = document.createElement('p');
  alt.className = 'dc-sr';
  alt.textContent =
    "A letter. Subject: We can't keep losing clients like this. To Daniel Drungel, Business Operations, and Dimasta Eblon, CEO. I've been looking at this quarter's numbers, and there's a pattern we can't ignore anymore. We're losing potential clients to competitors with weaker services but much better websites. People visit our site, look around, and leave. We're paying for traffic that goes nowhere. We've talked about redesigning the website for months, but nothing has changed. Meanwhile, our competitors are investing in their online presence, winning new contracts, and making us look outdated. We have a good business, a solid team, and a service people need. But none of that matters if we can't communicate our value before a potential client walks away. We need to take this seriously and get the right person to rebuild our website. Not another quick fix. Something that actually represents what we've built. We can't afford to keep falling behind. Signed.";
  root.append(dim, stageEl, alt, label, button);
  document.body.appendChild(root);
  document.documentElement.classList.add('is-reading');

  // the sheet's size on the page: as large as fits with margins, never past 1.6 × the image's own pixels
  const fit = () => {
    const maxH = Math.min(window.innerHeight * 0.86, 563 * 1.6);
    const maxW = Math.min(window.innerWidth * 0.9, 448 * 1.6);
    const h = Math.min(maxH, maxW / ASPECT);
    return { w: h * ASPECT, h };
  };

  let raf = 0;
  let t0 = performance.now();
  let closing = false;
  let closed = false;
  let unfold = 0;
  let from = 0;
  let to = 1;
  let ms = OPEN_MS;
  const light = new Vector2(0.3, 0.4);
  const target = new Vector2(0.3, 0.4);

  // --- WebGL, or the CSS fallback
  let renderer: WebGLRenderer | null = null;
  let mat: ShaderMaterial | null = null;
  let tex: Texture | null = null;
  let geo: PlaneGeometry | null = null;
  let scene: Scene | null = null;
  let cam: PerspectiveCamera | null = null;
  let sheet: Mesh | null = null;
  let fallback: HTMLImageElement | null = null;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'letter-canvas';
    stageEl.appendChild(renderer.domElement);
    scene = new Scene();
    cam = new PerspectiveCamera(30, 1, 0.01, 20);
    geo = new PlaneGeometry(ASPECT, 1, 70, 88);
    tex = new Texture();
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      side: DoubleSide,
      uniforms: { uMap: { value: tex }, uUnfold: { value: 0 }, uTime: { value: 0 }, uLight: { value: light } },
    });
    sheet = new Mesh(geo, mat);
    scene.add(sheet);
  } catch (err) {
    console.warn('[letter] no WebGL, unfolding the image in CSS', err);
    renderer = null;
  }
  if (!renderer) {
    fallback = document.createElement('img');
    fallback.className = 'letter-img';
    fallback.alt = '';
    fallback.src = letterUrl;
    stageEl.appendChild(fallback);
  }

  const size = () => {
    const { w, h } = fit();
    if (renderer && cam) {
      // the canvas covers the page; the camera stands where the flat sheet is exactly w × h px
      renderer.setSize(window.innerWidth, window.innerHeight);
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.position.set(0, 0, 1 / (2 * Math.tan((cam.fov * Math.PI) / 360)) * (window.innerHeight / h));
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
    }
    if (fallback) {
      fallback.style.width = `${w}px`;
      fallback.style.height = `${h}px`;
    }
  };
  size();
  window.addEventListener('resize', size);

  const draw = (now: number) => {
    const u = reduced ? 1 : Math.min(1, (now - t0) / ms);
    unfold = from + (to - from) * ease(u);
    light.lerp(target, 0.08);
    if (renderer && mat && sheet && scene && cam) {
      mat.uniforms.uUnfold.value = unfold;
      // picked up from below, turning as it opens; a slight drift in the hand once open
      const k = 1 - unfold;
      sheet.position.set(0, -0.55 * k * k, 0);
      sheet.rotation.set(0.9 * k + Math.sin(now / 2100) * 0.012 * unfold, -0.7 * k + Math.sin(now / 2700) * 0.015 * unfold, 0.5 * k);
      sheet.scale.setScalar(0.45 + 0.55 * Math.min(1, unfold * 1.2));
      renderer.render(scene, cam);
    } else if (fallback) {
      const k = 1 - unfold;
      fallback.style.transform = `translateY(${30 * k}vh) rotate(${-25 * k}deg) scale(${0.2 + 0.8 * unfold}, ${0.12 + 0.88 * unfold})`;
      fallback.style.opacity = String(Math.min(1, unfold * 2));
    }
    dim.style.opacity = String(Math.min(1, unfold * 1.6));
    if (u < 1 || !closing) raf = requestAnimationFrame(draw);
    else finish();
  };

  const move = (e: PointerEvent) => {
    label.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    root.classList.toggle('has-pointer', e.pointerType !== 'touch');
    target.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };
  const opened = performance.now();
  const click = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // the click that opened it does not close it
    if (performance.now() - opened < 350) return;
    close();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('click', click);
  // nothing under the layer gets the wheel or a touch drag while it is open
  const swallow = (e: Event) => e.preventDefault();
  root.addEventListener('wheel', swallow, { passive: false });
  root.addEventListener('touchmove', swallow, { passive: false });
  window.addEventListener('keydown', key);

  function close() {
    if (closing) return;
    closing = true;
    from = unfold;
    to = 0;
    ms = CLOSE_MS * Math.max(0.3, unfold);
    t0 = performance.now();
    root.classList.add('is-closing');
  }
  function finish() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    window.removeEventListener('keydown', key);
    renderer?.dispose();
    renderer?.forceContextLoss();
    geo?.dispose();
    mat?.dispose();
    tex?.dispose();
    root.remove();
    document.documentElement.classList.remove('is-reading');
    current = null;
    letter.open = false;
    pinScroll(false);
    onClosed();
  }

  current = { root, close };
  image()
    .then((img) => {
      if (closed) return;
      if (tex) {
        tex.image = img;
        tex.needsUpdate = true;
      }
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
      button.focus({ preventScroll: true });
    })
    .catch(() => {
      // the image could not be decoded: nothing to read, so nothing holds the story
      finish();
    });
}

/** Closes the letter if it is open (leaving the chapter). */
export function closeLetterNow() {
  current?.close();
}
