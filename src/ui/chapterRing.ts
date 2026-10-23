import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearFilter,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  NoToneMapping,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  LatheGeometry,
  Texture,
  Vector2,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import ringUrl from '../assets/ring.glb?url';
import { loadGlb } from '../characters/inlineModel';
import { CHAPTERS, chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { TOTAL_LENGTH, chapterTurn, chapterTurns, locate, scriptOwnsScroll, timeline } from '../core/timeline';
import { letter } from '../scenes/city/letter';
import { monitor } from '../scenes/home/monitor';
import { goToChapter } from './chapterTransition';
import { decodeIn } from './decode';
import { RED } from './palette';

/**
 * The chapter ring: the supplied ring (assets/ring.glb, tools/ring2glb.mjs),
 * kept at its own scale at the right edge of the page, vertically centred,
 * almost all of it beyond the edge: only a sliver shows, with the current
 * chapter's marker lit at nine o'clock. It is where you are in the story and
 * the way to another chapter.
 *
 *  - Three markers, 120 degrees apart, one per chapter, lit in the page's red:
 *    the current one fully, chapters behind you dimly, those ahead not at all.
 *    The inner ring carries this project's own engravings (drawn here, into a
 *    texture laid around the ring by angle): fine divisions, a track line,
 *    and at each marker the chapter's glyph (01 arrival: an axis crossed by
 *    short strokes; 02 conflict: an axis broken and crossed; 03 creation: an
 *    open frame around an axis), its number and a serial, DF-0n.
 *  - It follows the story, never leads it: the chapter is the scroll's
 *    (`locate(timeline.progress)`). Nearing the end of a chapter, its
 *    engravings light one after another towards the next marker; when the
 *    chapter turns (the chapter transition), the ring makes one eased
 *    rotation to the next marker while the light runs on into it, overshoots a
 *    hair, settles, and the new marker flares once. Going back, the same in
 *    reverse. A change while it turns retargets from where it is, so it never
 *    spins more than once or falls out of step.
 *  - Pointer over the sliver: the ring comes further in and a little larger,
 *    with the chapter's name and DRAG TO NAVIGATE beside it. Dragging turns it
 *    like a dial (mouse or touch); the marker nearest nine o'clock is the one
 *    previewed (lit apart from the current one, its name shown); let go and it
 *    snaps to a marker and, once settled, goes to that chapter through the
 *    usual chapter transition (goToChapter). The current chapter is not
 *    restarted; while something must not be interrupted (a transition, a
 *    scripted beat, the open letter, the flight into the screen) it does not
 *    turn at all.
 *
 * One WebGL canvas of its own (pointer-events none: the page stays clickable
 * around it; the pointer is followed on the window), drawn only when something
 * changed. Everything is removed by the function `mountChapterRing` returns.
 */

/** Marker angle (ring-local, degrees) of each chapter, and the ring's turn that brings it to nine o'clock. */
const MARKER_DEG = [90, 210, 330];
const turnFor = (n: number) => 180 - MARKER_DEG[n - 1];
/** The engraved band: inner and outer radius of the inner ring (ring units, outer radius 1). */
const BAND = { r0: 0.78, r1: 0.893 };
/** How much of the ring's diameter shows, idle and revealed; the reveal's slight growth. */
const SHOW = { idle: 0.105, open: 0.26, grow: 1.06 };
/** Before a chapter's end, over this much scroll (viewport heights), its engravings light towards the next marker. */
const APPROACH_VH = 1.6;
const TURN_MS = 1500;
/** Degrees of turn per degree of rim dragged past (the dial's gearing). */
const DRAG_GEAR = 1.6;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const chapterNow = () => chapterOf(locate(timeline.progress).id).number;
const NAMES = ['THE ARRIVAL', 'NO WELCOME', 'THE CAVE'];
const pad = (n: number) => String(n).padStart(2, '0');

/** May the ring take you to another chapter now? */
const safeToTurn = () =>
  story.getState().phase === 'ready' && !chapterTurn.busy && !scriptOwnsScroll() && !letter.open && !monitor.entering;

// --- the engravings ------------------------------------------------------------

/**
 * The inner ring's surface, unrolled: x is the angle (clockwise, so the text
 * reads upright), y the radius (outer edge at the top). R: the metal's tone,
 * G: where it is engraved, B: the strokes that belong to a chapter (its
 * glyph, number and frame; which chapter, the angle says), lit with it.
 */
function engravings(): CanvasTexture {
  const W = 4096;
  const H = 128;
  const xOf = (deg: number) => ((((360 - deg) % 360) + 360) % 360) * (W / 360);
  const mask = document.createElement('canvas');
  mask.width = W;
  mask.height = H;
  const m = mask.getContext('2d')!;
  const ids = document.createElement('canvas');
  ids.width = W;
  ids.height = H;
  const b = ids.getContext('2d')!;
  m.fillStyle = b.fillStyle = '#000';
  m.fillRect(0, 0, W, H);
  b.fillRect(0, 0, W, H);
  m.strokeStyle = m.fillStyle = '#fff';
  m.lineCap = 'square';

  // fine divisions: every 3 degrees, longer every 15; a track line inside them, a hairline at the inner edge
  for (let d = 0; d < 360; d += 3) {
    const x = xOf(d);
    m.lineWidth = d % 15 === 0 ? 3 : 2;
    m.beginPath();
    m.moveTo(x, 9);
    m.lineTo(x, d % 15 === 0 ? 30 : 20);
    m.stroke();
  }
  m.fillRect(0, 35, W, 2);
  m.fillRect(0, 116, W, 1.5);

  // between the markers: a sector code and alignment marks
  m.font = '600 15px "JetBrains Mono", ui-monospace, monospace';
  m.textAlign = 'center';
  m.textBaseline = 'middle';
  MARKER_DEG.forEach((deg, i) => {
    const mid = deg + 60;
    m.fillText(`DF-${i + 1}${((i + 1) % 3) + 1} / 120`, xOf(mid), 76);
    for (const off of [-30, 30]) {
      const x = xOf(mid + off);
      m.fillRect(x - 9, 74, 6, 2);
      m.fillRect(x + 3, 74, 6, 2);
    }
  });

  // each chapter: its glyph under the marker, framed, its number one side, its serial the other
  const glyph = (ctx: CanvasRenderingContext2D, n: number, cx: number) => {
    const top = 48;
    const h = 52;
    const mid = top + h / 2;
    ctx.lineWidth = 5;
    ctx.lineCap = 'square';
    ctx.beginPath();
    if (n === 1) {
      // arrival: an axis, entered by three short strokes growing towards it, a notch at its end
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, top + h);
      for (const [y, w] of [
        [top + 10, 10],
        [mid, 18],
        [top + h - 10, 26],
      ]) {
        ctx.moveTo(cx - w, y);
        ctx.lineTo(cx + w, y);
      }
      ctx.moveTo(cx - 7, top + 6);
      ctx.lineTo(cx, top - 1);
      ctx.lineTo(cx + 7, top + 6);
    } else if (n === 2) {
      // conflict: the axis broken and shifted, crossed by one hard diagonal
      ctx.moveTo(cx - 6, top);
      ctx.lineTo(cx - 6, mid - 6);
      ctx.moveTo(cx + 6, mid + 6);
      ctx.lineTo(cx + 6, top + h);
      ctx.moveTo(cx - 22, top + 8);
      ctx.lineTo(cx + 22, top + h - 8);
      ctx.moveTo(cx - 22, mid);
      ctx.lineTo(cx - 12, mid);
      ctx.moveTo(cx + 12, mid);
      ctx.lineTo(cx + 22, mid);
    } else {
      // creation: an open frame, an axis standing in it
      ctx.moveTo(cx + 12, top);
      ctx.lineTo(cx - 22, top);
      ctx.lineTo(cx - 22, top + h);
      ctx.lineTo(cx + 22, top + h);
      ctx.lineTo(cx + 22, top + 18);
      ctx.moveTo(cx, top + 12);
      ctx.lineTo(cx, top + h - 12);
    }
    ctx.stroke();
  };
  MARKER_DEG.forEach((deg, i) => {
    const n = i + 1;
    const cx = xOf(deg);
    // the chapter's own strokes, marked in B so they light with it
    for (const ctx of [m, b]) {
      ctx.strokeStyle = ctx.fillStyle = ctx === m ? '#fff' : '#00f';
      glyph(ctx, n, cx);
      ctx.font = '700 26px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pad(n), cx + 66, 76);
      // the frame: four corners
      ctx.lineWidth = 2.5;
      for (const [x, dx] of [
        [cx - 40, 1],
        [cx + 40, -1],
      ] as const)
        for (const [y, dy] of [
          [42, 1],
          [108, -1],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(x + dx * 10, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * 10);
          ctx.stroke();
        }
    }
    m.font = '600 15px "JetBrains Mono", ui-monospace, monospace';
    m.fillStyle = '#fff';
    m.fillText(`DF-${pad(n)}`, cx - 74, 76);
  });

  // the metal: a grey with a fine grain along the ring, darker where engraved
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const o = out.getContext('2d')!;
  const img = o.createImageData(W, H);
  const md = m.getImageData(0, 0, W, H).data;
  const bd = b.getImageData(0, 0, W, H).data;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rowGrain = Array.from({ length: H }, () => rnd());
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const g = md[i] / 255;
      const tone = 0.42 + rowGrain[y] * 0.08 + (rnd() - 0.5) * 0.06;
      img.data[i] = Math.round(255 * clamp(tone * (1 - 0.7 * g), 0, 1));
      img.data[i + 1] = md[i];
      img.data[i + 2] = bd[i + 2];
      img.data[i + 3] = 255;
    }
  o.putImageData(img, 0, 0);
  const t = new CanvasTexture(out);
  t.colorSpace = NoColorSpace;
  t.flipY = false;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** The inner ring's material: the engravings laid on it by angle, lit along an arc and by chapter. */
function ringMaterial(base: MeshStandardMaterial, engraving: Texture, local: Matrix4) {
  const mat = base.clone();
  const uniforms = {
    uEngrave: { value: engraving },
    uLocal: { value: local },
    // the lit arc: start (rad, ring-local), signed length (rad), tail (fraction of the length already dark), level
    uArc: { value: [0, 0, 0, 0] as number[] },
    uGlyph: { value: [0, 0, 0] as number[] },
    uRed: { value: new Color(RED) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uLocal;\nvarying vec2 vRingXY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRingXY = (uLocal * vec4(position, 1.0)).xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uEngrave;
uniform vec4 uArc;
uniform vec3 uGlyph;
uniform vec3 uRed;
varying vec2 vRingXY;`,
      )
      .replace(
        '#include <map_fragment>',
        `float ringR = length(vRingXY);
float ringA = atan(vRingXY.y, vRingXY.x);
vec4 eng = texture2D(uEngrave, vec2(fract(-ringA / 6.2831853), clamp((${BAND.r1.toFixed(3)} - ringR) / ${(BAND.r1 - BAND.r0).toFixed(3)}, 0.0, 1.0)));
diffuseColor.rgb *= pow(eng.r, 2.2) * 2.4;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float len = abs(uArc.y);
  float along = mod((ringA - uArc.x) * sign(uArc.y + 1e-6), 6.2831853);
  float lit = 0.0;
  if (len > 0.001) {
    float head = smoothstep(len, len - 0.05, along);
    float tail = smoothstep(uArc.z * len - 0.08, uArc.z * len, along);
    // the head burns a little hotter than the light it leaves behind
    lit = head * tail * (0.55 + 0.45 * smoothstep(len - 0.35, len, along)) * uArc.w;
  }
  // a chapter's own strokes (B) light with it; which chapter, the angle says (each sits at its marker)
  if (eng.b > 0.02) {
    float deg = degrees(ringA);
    float g = abs(mod(deg - ${MARKER_DEG[0]}.0 + 180.0, 360.0) - 180.0) < 20.0 ? uGlyph.x
      : abs(mod(deg - ${MARKER_DEG[1]}.0 + 180.0, 360.0) - 180.0) < 20.0 ? uGlyph.y : uGlyph.z;
    lit = max(lit, g * eng.b);
  }
  totalEmissiveRadiance += uRed * eng.g * lit * 1.6;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'drunkfurt-ring';
  return { mat, uniforms };
}

// --- the ring --------------------------------------------------------------------

/** Set while the ring owns the pointer (over it, or a drag just ended), so the page's click does not act. */
const pointer = { over: false, until: 0 };
/** Development only: how much of the ring to show (px), to look at it whole. */
const debug: { show?: number } = {};
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ring = debug;
export const ringOwnsPointer = () => pointer.over || performance.now() < pointer.until;

export function mountChapterRing(host: HTMLElement): () => void {
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'ring';
  canvas.setAttribute('aria-hidden', 'true');
  const label = document.createElement('div');
  label.className = 'ring-label';
  label.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'ring-name';
  const hint = document.createElement('span');
  hint.className = 'ring-hint';
  hint.dataset.text = 'DRAG TO NAVIGATE';
  hint.textContent = 'DRAG TO NAVIGATE';
  label.append(name, hint);
  host.append(canvas, label);

  let disposed = false;
  let renderer: WebGLRenderer | null = null;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (err) {
    console.warn('[ring] no WebGL', err);
  }
  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 1, -1, -4000, 4000);
  const tilt = new Group(); // turned a little towards the page, so its depth shows
  const spin = new Group(); // the ring's rotation
  tilt.add(spin);
  scene.add(tilt);
  scene.add(new AmbientLight('#ffffff', 0.35));
  const key = new DirectionalLight('#ffffff', 1.6);
  key.position.set(-0.6, 0.8, 1);
  scene.add(key);
  if (renderer) {
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  const markers: MeshStandardMaterial[] = [];
  let ring: ReturnType<typeof ringMaterial> | null = null;
  const owned: (Material | Texture)[] = [];
  let ready = false;
  if (renderer)
    loadGlb(ringUrl)
      .then((gltf) => {
        if (disposed) return;
        const engraving = engravings();
        owned.push(engraving);
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          const base = mesh.material as MeshStandardMaterial;
          if (mesh.name.startsWith('marker_')) {
            const k = Number(mesh.name.slice(7));
            const mat = base.clone();
            mat.emissive = new Color(RED);
            mat.emissiveIntensity = 0;
            // an unlit lens is dark glass, not a mirror of the room
            mat.envMapIntensity = 0.35;
            // (the lens's own glow map is grey: its light is the page's red alone)
            // marker_0 is at 90 degrees (chapter 1), marker_2 at 210 (chapter 2), marker_1 at 330 (chapter 3)
            markers[[0, 2, 1][k]] = mat;
            mesh.material = mat;
            owned.push(mat);
          }
        });
        // the inner ring: a plain band in place of the model's (whose symbols are modelled into it), engraved here
        const band = new LatheGeometry(
          [
            [BAND.r0, 0.008],
            [BAND.r0, 0.032],
            [BAND.r0 + 0.008, 0.045],
            [BAND.r1 - 0.008, 0.045],
            [BAND.r1, 0.032],
            [BAND.r1, 0.008],
          ].map(([x, y]) => new Vector2(x, y)),
          360,
        ).rotateX(Math.PI / 2);
        ring = ringMaterial(new MeshStandardMaterial({ color: '#9a9994', metalness: 0.45, roughness: 0.52, side: DoubleSide }), engraving, new Matrix4());
        const inner = new Mesh(band, ring.mat);
        inner.name = 'ring';
        owned.push(ring.mat);
        gltf.scene.add(inner);
        spin.add(gltf.scene);
        ready = true;
        dirty = true;
      })
      .catch((err) => console.warn('[ring] could not load', err));

  // --- the ring's state --------------------------------------------------------------
  let active: number = chapterNow();
  /** The rotation (degrees) the ring shows, and the one it is heading for. */
  let angle = turnFor(active);
  const tween = { from: angle, to: angle, t0: -1, ms: TURN_MS, fromChapter: active, toChapter: active };
  let flareAt = -1;
  let reveal = 0; // 0 idle … 1 revealed (eased)
  let wantReveal = false;
  let drag: { id: number; y0: number; startAngle: number; moved: boolean } | null = null;
  let preview = 0; // the chapter previewed while dragging (0: none)
  let settleGo = 0; // timer: after a snap, go to the chapter
  let D = 600; // the ring's diameter on the page (px)
  let dirty = true;
  let raf = 0;
  let lastKey = '';

  const size = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    D = clamp(Math.min(H * 0.86, W * 1.3), 320, 980);
    const cw = Math.ceil(debug.show !== undefined ? debug.show + 40 : D * (SHOW.open * SHOW.grow + 0.03));
    const ch = Math.ceil(D * SHOW.grow * 1.04);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(cw, ch, false);
    }
    // pixels as units: x from the canvas's left edge, y up from its middle
    camera.left = 0;
    camera.right = cw;
    camera.top = ch / 2;
    camera.bottom = -ch / 2;
    camera.updateProjectionMatrix();
    dirty = true;
  };

  /** Where the ring is on the page now: its centre and radius (px). */
  const place = () => {
    const e = smooth(reveal);
    const r = (D / 2) * (1 + (SHOW.grow - 1) * e);
    const show = debug.show ?? D * (SHOW.idle + (SHOW.open - SHOW.idle) * e);
    return { x: window.innerWidth - show + r, y: window.innerHeight / 2, r, show };
  };
  const hit = (x: number, y: number, slack = 1) => {
    const p = place();
    return x >= p.x - p.r * 1.02 * slack && Math.hypot(x - p.x, y - p.y) <= p.r * 1.02 * slack;
  };

  /** Turns the ring to a chapter (from wherever it is), the light running along with it. */
  const turnTo = (to: number, fromChapter: number) => {
    // the same marker reached by the shortest way from where the ring heads now… unless the story moved
    // forward or back: then it turns that way (forward is clockwise, the next marker coming up from below)
    const base = tween.t0 >= 0 ? tween.to : angle;
    let target = turnFor(to);
    target = base + wrap180(target - base);
    const dir = Math.sign(to - fromChapter);
    if (dir > 0 && target > base + 1) target -= 360;
    if (dir < 0 && target < base - 1) target += 360;
    Object.assign(tween, { from: angle, to: target, t0: performance.now(), ms: reduced ? 1 : TURN_MS, fromChapter, toChapter: to });
    dirty = true;
  };

  const setLabel = (n: number, previewing: boolean) => {
    const text = `${pad(n)} — ${NAMES[n - 1]}`;
    if (name.dataset.text === text && label.classList.contains('is-preview') === previewing) return;
    name.dataset.text = text;
    label.classList.toggle('is-preview', previewing);
    void decodeIn(name, 420, 0, { rise: 0 });
  };

  // --- each frame ---------------------------------------------------------------------
  let lastNow = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    // the chapter is the story's: when it changes, the ring follows
    const n = chapterNow();
    if (n !== active) {
      const was = active;
      active = n;
      window.clearTimeout(settleGo);
      if (!drag) turnTo(n, was);
      if (!wantReveal) setLabel(n, false);
    }
    // reveal and hide, eased on the clock
    const target = wantReveal || drag ? 1 : 0;
    if (reveal !== target) {
      reveal = target > reveal ? Math.min(1, reveal + (reduced ? 1 : dt / 0.38)) : Math.max(0, reveal - (reduced ? 1 : dt / 0.45));
      dirty = true;
    }
    // the turn
    let turnK = 1;
    if (tween.t0 >= 0) {
      const u = clamp((now - tween.t0) / tween.ms, 0, 1);
      turnK = u;
      // one eased rotation, a hair past the marker, then settling back onto it: the alignment
      const over = 0.025;
      const e = u < 0.82 ? (1 + over) * inOut(u / 0.82) : 1 + over - over * outCubic((u - 0.82) / 0.18);
      angle = tween.from + (tween.to - tween.from) * e;
      if (u >= 0.82 && flareAt < tween.t0) flareAt = now;
      if (u >= 1) {
        angle = tween.to;
        tween.t0 = -1;
      }
      dirty = true;
    }
    const flare = flareAt < 0 ? 0 : Math.max(0, 1 - (now - flareAt) / 700);
    if (flare > 0) dirty = true;

    // the light: during a turn it runs from the marker left to the one reached; otherwise, near a
    // chapter's end, it creeps from the current marker towards the next as the scroll comes on
    let arc = [0, 0, 0, 0];
    const rad = Math.PI / 180;
    if (tween.t0 >= 0 && tween.fromChapter !== tween.toChapter) {
      const span = (MARKER_DEG[tween.toChapter - 1] - MARKER_DEG[tween.fromChapter - 1]) * rad;
      const signed = span !== 0 ? Math.sign(tween.toChapter - tween.fromChapter) * (((Math.abs(span) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI) : 0;
      arc = [MARKER_DEG[tween.fromChapter - 1] * rad, signed * Math.min(1, 0.4 + turnK * 0.75), clamp((turnK - 0.55) / 0.45, 0, 1), 1];
    } else if (!drag && n < CHAPTERS.length) {
      const z = chapterTurns()[n - 1];
      const span = APPROACH_VH / TOTAL_LENGTH;
      const a = z ? clamp((timeline.progress - (z.from - span)) / span, 0, 1) : 0;
      if (a > 0.001) arc = [MARKER_DEG[n - 1] * rad, ((120 * rad) * 0.4 * a), 0, smooth(Math.min(1, a * 3))];
    }

    // markers and glyphs: the current lit, those behind dimly, those ahead dark; a previewed one apart
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    const level = (k: number) => {
      if (preview && k === preview && k !== active) return 0.55 + 0.3 * pulse;
      if (k === active) return 1 + flare * 0.6;
      return k < active ? 0.22 : 0;
    };
    if (preview) dirty = true;
    const lv = [level(1), level(2), level(3)];
    const shown = angle + (drag ? dragOffset : 0);
    const keyNow = `${shown.toFixed(2)}|${reveal.toFixed(3)}|${lv.map((v) => v.toFixed(2)).join()}|${arc.map((v) => v.toFixed(3)).join()}|${D}`;
    if (!ready || !renderer || (!dirty && keyNow === lastKey)) return;
    lastKey = keyNow;
    dirty = false;
    // (the lens glow map is mostly mid-grey: three times the level brings its middle to the full red)
    markers.forEach((m, i) => (m.emissiveIntensity = lv[i] * 3));
    if (ring) {
      ring.uniforms.uArc.value = arc;
      ring.uniforms.uGlyph.value = lv.map((v) => Math.min(1, v));
    }
    const p = place();
    const cw = parseFloat(canvas.style.width);
    // canvas pixels: its right edge is the page's right edge
    tilt.position.set(cw - p.show + p.r, 0, 0);
    tilt.scale.setScalar(p.r);
    tilt.rotation.set(0, -0.32 + 0.12 * smooth(reveal), 0);
    spin.rotation.z = shown * rad;
    canvas.classList.toggle('is-open', reveal > 0.02);
    label.style.right = `${Math.round(p.show + 18)}px`;
    renderer.render(scene, camera);
  };

  // --- the pointer ---------------------------------------------------------------------
  let dragOffset = 0;
  const nearestChapter = (deg: number) => {
    let best = active;
    let bd = 1e9;
    for (let k = 1; k <= 3; k++) {
      const d = Math.abs(wrap180(deg - turnFor(k)));
      if (d < bd) (bd = d), (best = k);
    }
    return best;
  };
  const setOver = (on: boolean) => {
    pointer.over = on;
    document.documentElement.classList.toggle('is-over-ring', on);
  };
  const reveals = (on: boolean) => {
    if (wantReveal === on) return;
    wantReveal = on;
    label.classList.toggle('is-on', on);
    if (on) {
      setLabel(active, false);
      void decodeIn(hint, 500, 120, { rise: 0 });
    }
  };
  const move = (e: PointerEvent) => {
    if (story.getState().phase !== 'ready' || document.documentElement.classList.contains('site-handoff')) return;
    if (drag && e.pointerId === drag.id) {
      // the part you hold is the sliver at nine o'clock, where the rim runs up and down: a drag down
      // turns it on (counter-clockwise), up turns it back, geared a little so a third of a turn is a short drag
      const d = ((e.clientY - drag.y0) / place().r) * (180 / Math.PI) * DRAG_GEAR;
      if (Math.abs(d) > 1.5) drag.moved = true;
      dragOffset = drag.startAngle + d - angle;
      const k = nearestChapter(angle + dragOffset);
      if (k !== preview) {
        preview = k;
        setLabel(k, k !== active);
      }
      dirty = true;
      return;
    }
    if (e.pointerType === 'touch') return;
    // a little give on the way out, so the edge of the reveal does not flicker
    const over = hit(e.clientX, e.clientY, wantReveal ? 1.06 : 1);
    if (over !== pointer.over) setOver(over);
    reveals(over);
  };
  const down = (e: PointerEvent) => {
    if (story.getState().phase !== 'ready' || !hit(e.clientX, e.clientY) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    setOver(true);
    reveals(true);
    // nothing turns while something must not be interrupted; the ring only shows itself
    if (!safeToTurn()) return;
    e.preventDefault();
    window.clearTimeout(settleGo);
    tween.t0 = -1;
    drag = { id: e.pointerId, y0: e.clientY, startAngle: angle, moved: false };
    dragOffset = 0;
    preview = active;
    document.documentElement.classList.add('is-turning-ring');
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    const shown = angle + dragOffset;
    const k = nearestChapter(shown);
    drag = null;
    document.documentElement.classList.remove('is-turning-ring');
    pointer.until = performance.now() + 350;
    angle = shown;
    dragOffset = 0;
    // snap onto the marker, then (once it has settled) go there
    let to = turnFor(k);
    to = shown + wrap180(to - shown);
    Object.assign(tween, { from: shown, to, t0: performance.now(), ms: reduced ? 1 : 520, fromChapter: k, toChapter: k });
    preview = 0;
    if (moved && k !== active) {
      settleGo = window.setTimeout(() => {
        if (safeToTurn() && k !== chapterNow()) goToChapter(k);
        else turnTo(chapterNow(), k);
      }, reduced ? 0 : 560);
    } else if (k !== active) turnTo(active, k);
    setLabel(active, false);
    if (e.pointerType === 'touch') {
      setOver(false);
      reveals(false);
    }
    dirty = true;
  };
  const leaveWindow = () => {
    if (drag) return;
    setOver(false);
    reveals(false);
  };
  // on a touch screen a drag on the ring must not scroll the page
  const touch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t && story.getState().phase === 'ready' && hit(t.clientX, t.clientY)) e.preventDefault();
  };

  const touchMove = (e: TouchEvent) => {
    if (drag) e.preventDefault();
  };

  size();
  setLabel(active, false);
  window.addEventListener('resize', size);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  document.documentElement.addEventListener('pointerleave', leaveWindow);
  window.addEventListener('touchstart', touch, { passive: false });
  window.addEventListener('touchmove', touchMove, { passive: false });
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(settleGo);
    window.removeEventListener('resize', size);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.documentElement.removeEventListener('pointerleave', leaveWindow);
    window.removeEventListener('touchstart', touch);
    window.removeEventListener('touchmove', touchMove);
    setOver(false);
    document.documentElement.classList.remove('is-turning-ring');
    scene.traverse((o) => (o as Mesh).geometry?.dispose());
    owned.forEach((x) => x.dispose());
    scene.environment?.dispose();
    renderer?.dispose();
    canvas.remove();
    label.remove();
  };
}
