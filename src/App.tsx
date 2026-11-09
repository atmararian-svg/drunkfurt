import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, ReactNode, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { FogExp2, Group, HalfFloatType, Material, Mesh, NoToneMapping, Object3D, PCFShadowMap, SRGBColorSpace, Scene, Texture, WebGLRenderTarget } from 'three';
import { story, useStory } from './core/store';
import { EpisodeId, TOTAL_LENGTH, autoplay, globalProgress, chapterTurn, gates, locate, readScroll, scriptOwnsScroll, scrollToProgress, stopAutoplay, timeline } from './core/timeline';
import { EPISODES, builtEpisodes } from './episodes';
import { cameraDirector, rigPose, ScrollCameraRig } from './player/ScrollCameraRig';
import { encounter, encounterAt } from './scenes/city/encounter';
import { letter } from './scenes/city/letter';
import { getaway } from './scenes/car/getaway';
import { LETTER_REVEAL, openLetter } from './ui/letterReveal';
import { Stylizer, stylize } from './render/Stylizer';
import { FrameGrab } from './render/FrameGrab';
import { chapterOf, chapterReadiness } from './core/chapters';
import { preloadRoom } from './scenes/home/RoomScene';
import { goToChapter, installChapterTransitions } from './ui/chapterTransition';
import { Overlay } from './ui/Overlay';
import { watchContextLoss } from './ui/stub';
import { Preloader } from './ui/Preloader';
import { DIAG, diagFrame, diagNote } from './ui/diag';
import { sinceTitleCard, titleCardOn, titleCardPlayed } from './ui/titleCards';

/**
 * Marks a chapter ready once its world has rendered: placed inside the
 * world's own Suspense boundary, after the world, it only mounts when
 * everything the world loads has arrived; two frames later its shaders have
 * been compiled and drawn.
 */
function ChapterReady({ chapter }: { chapter: 1 | 2 | 3 }) {
  useEffect(() => {
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => chapterReadiness.set(chapter, true))));
    return () => cancelAnimationFrame(raf);
  }, [chapter]);
  return null;
}

/** A world that fails to load takes down only itself: its chapter is reported as failed, the rest goes on. */
class WorldBoundary extends Component<{ chapter: 1 | 2 | 3; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(`[chapters] chapter ${this.props.chapter} could not be loaded`, err);
    chapterReadiness.set(this.props.chapter, 'failed');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Mounts the active episode's world, plus the next one in advance. Only the
 * active world is drawn; the next one waits hidden, so the hand-over under the
 * ink wipe is instant and two worlds never overlap on screen.
 */
function EpisodeWorlds() {
  const episode = useStory((s) => s.episode);
  // under the loading veil every mounted world draws once, so all shaders compile up front
  const loading = useStory((s) => s.phase === 'loading');
  const list = builtEpisodes();
  const i = Math.max(0, list.findIndex((e) => e.id === episode));
  const activeId = episode === 'outro' ? list[list.length - 1].id : episode;
  // an episode that plays in another's world (episode 3 on episode 2's street) draws and runs that world too
  const host = EPISODES[activeId as EpisodeId]?.sharesWorld;
  // the world you are in and the next (and the world an episode plays in): one left behind is
  // unmounted and its video memory freed (going back builds it again from the loaded models)
  const near = episode === 'outro' ? list.slice(-1) : list.slice(i, i + 2);
  const mounted = list.filter((e) => near.includes(e) || e.id === host);
  const shown = (id: EpisodeId) => id === activeId || id === host;
  return (
    <>
      {mounted.map((e) => {
        // each world loads on its own (the station does not wait for the street's models), and says when it is ready
        const chapter = chapterOf(e.id).number;
        return (
          <group key={e.id} visible={loading || shown(e.id)}>
            <WorldBoundary chapter={chapter}>
              <Suspense fallback={null}>
                <e.World active={shown(e.id)} />
                {/* (only the worlds still to come: one left behind is not compiled again) */}
                <Prewarm ahead={!loading && !shown(e.id) && list.indexOf(e) > i} />
                <FreeOnUnmount />
                {BACKDROP && <BackdropShown />}
                {e.id !== 'car' && e.id !== 'home' && <ChapterReady chapter={chapter} />}
              </Suspense>
            </WorldBoundary>
          </group>
        );
      })}
    </>
  );
}

/**
 * A world left behind is unmounted; this frees what it held on the graphics card: every
 * geometry, material and texture under its group (in the unmount, while they are still there).
 * Three keeps the objects usable: whatever is drawn again is simply uploaded again.
 */
function FreeOnUnmount() {
  const marker = useRef<Object3D>(null);
  useLayoutEffect(() => {
    const world = marker.current?.parent;
    return () => {
      if (!world) return;
      const seen = new Set<{ dispose(): void }>();
      world.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) seen.add(m.geometry);
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as Material[];
        for (const mat of mats) {
          seen.add(mat);
          for (const v of Object.values(mat)) if (v && (v as Texture).isTexture) seen.add(v as Texture);
        }
      });
      const d0 = performance.now();
      seen.forEach((x) => x.dispose());
      if (DIAG) diagNote(`world freed: ${seen.size} objects in ${(performance.now() - d0).toFixed(0)} ms`);
    };
  }, []);
  return <object3D ref={marker} />;
}

/**
 * On a phone the story does not run: the page in its place (ui/stub.ts) shows chapter 3's room behind
 * it, just entered, as a picture that lives (the camera drifting a little on the spot), with nothing to
 * scroll, click or hear. Set before the app is rendered (main.tsx).
 */
let BACKDROP = false;
export const setBackdrop = (on: boolean) => void (BACKDROP = on);
/** The room just inside the door (home's own progress), and how far the camera drifts either way of it. */
const BACKDROP_AT = 0.17;
const BACKDROP_SWAY = 0.035;
/** The room drawn a few times: the page shows it (fading it in over the stub's own black). */
function BackdropShown() {
  useEffect(() => {
    let n = 0;
    let raf = 0;
    const f = () => (++n < 6 ? (raf = requestAnimationFrame(f)) : document.documentElement.classList.add('backdrop-on'));
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
/** The backdrop's drift: slowly to and fro around the spot (no scroll page under it). */
function BackdropDrift() {
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    timeline.target = globalProgress('home', BACKDROP_AT + BACKDROP_SWAY * Math.sin((t * Math.PI * 2) / 26));
  });
  return null;
}

/** For a world's shaders compiled ahead of time: a linear target (for passes that draw into one), and a fog of the kind every world uses. */
const PREWARM_RT = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
const PREWARM_FOG = new FogExp2('#000000', 0.01);

/**
 * Compiles a world's shaders while another is on screen, so the chapter turn into it does not
 * stall on them. A shader depends on the lights it is drawn with: under the loading veil every
 * mounted world draws at once, all their lights together, so those shaders do not fit any one
 * world, and they were compiled again, all of them, at the turn (the long stall). Here the world
 * is compiled on its own, with its own lights and its fog, for both colour spaces a frame draws it
 * in (to the screen's and into a linear target), after the print treatment has patched its
 * materials.
 *
 * A little at a time: one object per kind of shader it needs (its material and the variant the
 * object asks for: skinned, instanced, receiving shadows, its vertex data), and only one at a
 * time: the next is asked for once the graphics card has finished the last (with the
 * KHR_parallel_shader_compile extension, asked without waiting), or else a third of a second
 * later. Never during a transition (the opening pixels, a chapter turn) or the preloader.
 * Issuing a compile costs nothing here, but the card compiles them one after another, and a
 * page that then reads its picture back (the pixel transitions do, every frame) waits for all of
 * them: issued all at once, as before, a hundred of them froze the page on a real GPU.
 */
function Prewarm({ ahead }: { ahead: boolean }) {
  const { gl, camera } = useThree();
  const marker = useRef<Object3D>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ahead || done.current) return;
    const parallel = gl.extensions.has('KHR_parallel_shader_compile');
    let timer = 0;
    let queue: Mesh[] | null = null;
    let pass = 0;
    let waiting: { isReady(): boolean } | null = null;
    let next = 0;
    const later = (ms: number) => (timer = window.setTimeout(step, ms));
    // (and not while a tip is up: the first one comes as the page settles, and the two would fall together)
    // (nor before the chapter's title card has come and gone: the page is just handed over, the card is
    // sliding in over a live 3D frame, and compiling as well tipped a retina Mac into a hang)
    const busy = () =>
      titleCardOn() ||
      !titleCardPlayed() ||
      sinceTitleCard() < 9000 ||
      document.querySelector<HTMLElement>('.tip')?.style.visibility === 'visible' ||
      chapterTurn.busy || document.hidden || !!document.querySelector('.pixel-reveal, .chapter-out') || document.documentElement.classList.contains('is-preloading');
    const step = () => {
      const root = marker.current?.parent as (Group & { fog?: FogExp2 | null }) | undefined;
      if (!root || busy()) return later(500);
      // the last one still being compiled by the card: wait for it
      if (waiting && parallel && !waiting.isReady()) return later(50);
      if (!parallel && performance.now() < next) return later(next - performance.now());
      waiting = null;
      if (!queue) {
        stylize(root, gl.getPixelRatio());
        // one object for each kind of shader the world needs
        const seen = new Set<string>();
        queue = [];
        root.traverse((o) => {
          const m = o as Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean; instanceColor?: unknown };
          if (!m.isMesh) return;
          const g = m.geometry;
          const variant = `${m.isSkinnedMesh ? 's' : ''}${m.isInstancedMesh ? 'i' : ''}${m.instanceColor ? 'c' : ''}${m.receiveShadow ? 'r' : ''}${g.getAttribute('tangent') ? 't' : ''}${g.getAttribute('color') ? 'v' : ''}${g.getAttribute('uv1') ? '1' : ''}${g.morphAttributes.position ? 'm' : ''}`;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Material[];
          const key = mats.map((x) => x.uuid).join('+') + variant;
          if (seen.has(key)) return;
          seen.add(key);
          queue!.push(m);
        });
      }
      const o = queue.pop();
      if (o) {
        const wasVisible = root.visible;
        const prevTarget = gl.getRenderTarget();
        const before = gl.info.programs?.length ?? 0;
        try {
          root.visible = true;
          root.fog = PREWARM_FOG;
          gl.setRenderTarget(pass === 0 ? null : PREWARM_RT);
          const c0 = performance.now();
          gl.compile(o, camera, root as unknown as Scene);
          if (DIAG) diagNote(`prewarm compile ${o.name || o.type} ${(performance.now() - c0).toFixed(0)} ms (programs ${gl.info.programs?.length})`);
          // a new program made: wait for it before the next (an existing one: go straight on)
          if ((gl.info.programs?.length ?? 0) > before) {
            const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as Material;
            waiting = (gl.properties.get(mat) as { currentProgram?: { isReady(): boolean } }).currentProgram ?? null;
            next = performance.now() + 330;
          }
        } catch (err) {
          console.warn('[prewarm]', err);
          queue.length = 0;
          pass = 1;
        } finally {
          gl.setRenderTarget(prevTarget);
          root.fog = null;
          root.visible = wasVisible;
        }
      }
      if (queue.length) return later(waiting ? 50 : 0);
      if (pass === 0) {
        // the same again, for the linear target
        pass = 1;
        queue = null;
        return later(0);
      }
      done.current = true;
    };
    // a while after the world is ready, once the page has settled
    later(5000);
    return () => window.clearTimeout(timer);
  }, [ahead, gl, camera]);
  return <object3D ref={marker} />;
}

/**
 * The 3D page's pixel density: up to 1.25, desktop and touch alike (the comic look's ink and
 * halftone hold up at it; at 1.5 a retina screen's frame buffers alone took some 300 MB of video
 * memory, which is what makes a browser take a page's WebGL away). Every frame is drawn about four times over (the picture and the ink's
 * normal and depth buffer), so density is what costs most: AdaptiveDpr lowers it, in steps, on a
 * machine that cannot keep up.
 */
const MAX_DPR = Math.min(window.devicePixelRatio || 1, 1.25);

/**
 * Lowers the pixel density a step (0.25, not below 1) when the frames have averaged over 22 ms
 * for two seconds. It only ever goes down: each change resizes every buffer of the frame (a
 * hitch of its own), so going back up and down again would stutter. Hidden tabs, single long
 * frames (a chapter loading) and chapter turns are not counted.
 */
function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef({ dpr: MAX_DPR, acc: 0, n: 0 });
  useFrame((_, delta) => {
    const s = st.current;
    if (s.dpr <= 1) return;
    if (delta > 0.25 || document.hidden || chapterTurn.busy || document.documentElement.classList.contains('is-preloading') || document.querySelector('.pixel-reveal, .chapter-out')) {
      s.acc = 0;
      s.n = 0;
      return;
    }
    s.acc += delta;
    s.n++;
    if (s.acc < 2) return;
    const ms = (s.acc / s.n) * 1000;
    s.acc = 0;
    s.n = 0;
    if (ms > 22) {
      s.dpr = Math.max(1, s.dpr - 0.25);
      setDpr(s.dpr);
    }
  });
  return null;
}

/**
 * Shadows are drawn every other frame (each light's shadow is the scene drawn again): at night,
 * under street lamps, a shadow that lags a frame behind a walking man does not show.
 */
function ShadowCadence() {
  const gl = useThree((s) => s.gl);
  const frame = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => void (gl.shadowMap.autoUpdate = true);
  }, [gl]);
  useFrame(() => {
    if ((frame.current++ & 1) === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}

export function App() {
  const episode = useStory((s) => s.episode);

  // chapters change through the chapter transition; chapter 3's assets load once chapter 2 is in
  useEffect(() => (BACKDROP ? undefined : installChapterTransitions()), []);
  useEffect(() => {
    let started = false;
    const next = () => {
      if (started || chapterReadiness.get(2) === false) return;
      started = true;
      preloadRoom().then(
        () => chapterReadiness.set(3, true),
        (err) => {
          console.error('[chapters] chapter 3 could not be loaded', err);
          chapterReadiness.set(3, 'failed');
        },
      );
    };
    next();
    return chapterReadiness.subscribe(next);
  }, []);

  useEffect(() => {
    if (BACKDROP) {
      // straight into the room, the story already under way (nothing loads but the room)
      timeline.target = timeline.progress = globalProgress('home', BACKDROP_AT);
      story.setState({ phase: 'ready', episode: 'home', sound: false });
      return;
    }
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    readScroll();
    timeline.progress = timeline.target;
    const onScroll = () => readScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // the visitor takes over from a scripted beat the moment they scroll themselves; a locked
    // one (a page turn, the getaway's launch) cannot be taken over, and while it plays the page
    // does not scroll under it either: wheel (including a trackpad's momentum), touch and scroll
    // keys are swallowed, so it ends exactly where it was going
    const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Space'];
    const interrupt = (e: Event) => {
      if (e instanceof KeyboardEvent && !scrollKeys.includes(e.code)) return;
      if (scriptOwnsScroll()) {
        // (a touch's start is never swallowed: that would also swallow the tap, and with it every
        // button while the page is held, the sound choice and the letter's close among them; its
        // move is what scrolls, and that is swallowed)
        if (e.cancelable && e.type !== 'touchstart') e.preventDefault();
        return;
      }
      stopAutoplay();
    };
    for (const ev of ['wheel', 'touchstart', 'touchmove', 'keydown'] as const) window.addEventListener(ev, interrupt, { passive: false });
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__drunkfurt = {
        timeline,
        autoplay,
        gates,
        story,
        chapterTurn,
        rigPose,
        locate,
        EPISODES,
        encounter,
        encounterAt,
        goToChapter,
        letter,
        openLetter,
        LETTER_REVEAL,
        getaway,
        get scene() {
          return (window as unknown as { __scene?: unknown }).__scene;
        },
        /** Hold the camera on a fixed frame (inspection only): pos, yaw/pitch in degrees, fov. */
        frame(pos: [number, number, number], yaw: number, pitch: number, fov = 40) {
          const k = { pos, yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180, fov };
          cameraDirector.stop();
          cameraDirector.play({ id: 'inspect', duration: 1e6, keys: [{ t: 0, ...k }, { t: 1, ...k }] });
        },
        /** Jump straight to a global progress value, without smoothing. */
        setProgress(p: number) {
          stopAutoplay(true);
          scrollToProgress(p, false);
          readScroll();
          timeline.progress = timeline.target;
        },
      };
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      for (const ev of ['wheel', 'touchstart', 'touchmove', 'keydown'] as const) window.removeEventListener(ev, interrupt);
    };
  }, []);

  return (
    <>
      <div className={BACKDROP ? 'stage stage--backdrop' : 'stage'} aria-hidden={BACKDROP || undefined} role="img" aria-label="DRUNKFURT, Episode 1: arriving at Frankfurt (Main) Hbf at night">
        <Canvas
          shadows={{ type: PCFShadowMap }}
          dpr={MAX_DPR}
          gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
          camera={{ fov: 54, near: 0.05, far: 1300 }}
          onCreated={({ gl }) => {
            gl.toneMapping = NoToneMapping;
            gl.outputColorSpace = SRGBColorSpace;
            // (behind the phone's page, a lost context only takes the picture away)
            if (BACKDROP) gl.domElement.addEventListener('webglcontextlost', () => document.documentElement.classList.remove('backdrop-on'));
            else watchContextLoss(gl.domElement);
            if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gl = gl;
            if (DIAG) {
              (window as unknown as { __diagState?: () => string }).__diagState = () => {
                const l = locate(timeline.progress);
                const m = gl.info.memory;
                return `${l.id} ${l.local.toFixed(3)}, prompt ${story.getState().prompt}, geo ${m.geometries} tex ${m.textures} programs ${gl.info.programs?.length}, dpr ${gl.getPixelRatio()}, letter ${letter.open ? 'open' : letter.read ? 'read' : '-'}`;
              };
              const render = gl.render.bind(gl);
              gl.render = (s, c) => {
                const r0 = performance.now();
                render(s, c);
                diagFrame(performance.now() - r0, `${story.getState().episode}, programs ${gl.info.programs?.length}, dpr ${gl.getPixelRatio()}`);
              };
            }
          }}
        >
          <Suspense fallback={null}>
            <AdaptiveDpr />
            <ShadowCadence />
            <ScrollCameraRig />
            <EpisodeWorlds />
            <Stylizer version={episode} />
            <FrameGrab />
            {BACKDROP && <BackdropDrift />}
          </Suspense>
        </Canvas>
      </div>
      {!BACKDROP && (
        <>
          <div className="scroll-track" style={{ height: `${TOTAL_LENGTH * 100}vh` }} aria-hidden />
          <Overlay />
          <Preloader />
        </>
      )}
    </>
  );
}
