import { Canvas, advance, useFrame, useThree } from '@react-three/fiber';
import { frameGap, frameGate } from './render/frameRate';
import { Component, ReactNode, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { Material, Mesh, NoToneMapping, Object3D, PCFShadowMap, SRGBColorSpace, Texture } from 'three';
import { story, useStory } from './core/store';
import { EpisodeId, TOTAL_LENGTH, autoplay, globalProgress, chapterTurn, gates, locate, readScroll, scriptOwnsScroll, scrollToProgress, stopAutoplay, timeline } from './core/timeline';
import { EPISODES, builtEpisodes } from './episodes';
import { cameraDirector, rigPose, ScrollCameraRig } from './player/ScrollCameraRig';
import { encounter, encounterAt } from './scenes/city/encounter';
import { letter } from './scenes/city/letter';
import { getaway } from './scenes/car/getaway';
import { LETTER_REVEAL, openLetter } from './ui/letterReveal';
import { Stylizer } from './render/Stylizer';
import { FrameGrab } from './render/FrameGrab';
import { chapterOf, chapterReadiness } from './core/chapters';
import { preloadRoom } from './scenes/home/RoomScene';
import { goToChapter, installChapterTransitions } from './ui/chapterTransition';
import { Overlay } from './ui/Overlay';
import { watchContextLoss } from './ui/stub';
import { Preloader } from './ui/Preloader';
import { GAME } from './game/mode';
import { DIAG, diagFrame, diagNote } from './ui/diag';
import { WorldWarm } from './render/WorldWarm';

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
  const list = builtEpisodes();
  const i = Math.max(0, list.findIndex((e) => e.id === episode));
  const activeId = episode === 'outro' ? list[list.length - 1].id : episode;
  // an episode that plays in another's world (episode 3 on episode 2's street) draws and runs that world too
  const host = EPISODES[activeId as EpisodeId]?.sharesWorld;
  // the world you are in and the next (and the world an episode plays in): one left behind is
  // unmounted and its video memory freed (going back builds it again from the loaded models)
  // (when the next episode plays on in this one's world, as the getaway on the street, the one after it too:
  // built here, under the turn into this chapter, not as the story crosses into that next episode in the
  // middle of a scene: the room being put together there was the hitch right after the invitation)
  const reach = list[i + 1]?.sharesWorld === list[i]?.id ? 3 : 2;
  const near = episode === 'outro' ? list.slice(-1) : list.slice(i, i + reach);
  const mounted = list.filter((e) => near.includes(e) || e.id === host);
  const shown = (id: EpisodeId) => id === activeId || id === host;
  return (
    <>
      {mounted.map((e) => {
        // each world loads on its own (the station does not wait for the street's models), and says when it is ready
        const chapter = chapterOf(e.id).number;
        return (
          // (its visibility is WorldWarm's: shown once its shaders are compiled)
          <group key={e.id}>
            <WorldBoundary chapter={chapter}>
              <Suspense fallback={null}>
                <e.World active={shown(e.id)} />
                {/* (only the worlds still to come: one left behind is not compiled again) */}
                <WorldWarm id={e.id} shown={shown(e.id)} />
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

/** The first frame's step (ms). */
const FIRST_STEP_MS = 16;

export function App() {
  const episode = useStory((s) => s.episode);

  // the frames: driven here (the canvas's own loop is off), at most 60 a second, fewer where hidden (render/frameRate.ts)
  useEffect(() => {
    const due = frameGate(() => frameGap(BACKDROP));
    let raf = 0;
    // (the clock counts from the first frame: its first step is a frame's, not the time the page took to load)
    let t0 = -1;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!due(now)) return;
      if (t0 < 0) t0 = now - FIRST_STEP_MS;
      advance((now - t0) / 1000, true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      // (the game: nothing scrolls the page but the walk, and no key stops the rails)
      if (GAME) {
        if (e.type === 'wheel' && e.cancelable) e.preventDefault();
        if (e instanceof KeyboardEvent && (e.code === 'Space' || e.code === 'PageUp' || e.code === 'PageDown' || e.code === 'Home' || e.code === 'End')) e.preventDefault();
        return;
      }
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
          frameloop="never"
          shadows={{ type: PCFShadowMap }}
          dpr={MAX_DPR}
          gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
          camera={{ fov: 54, near: 0.05, far: 1300 }}
          onCreated={({ gl }) => {
            gl.toneMapping = NoToneMapping;
            gl.outputColorSpace = SRGBColorSpace;
            // no shader error checks outside development: three asks for each program's log as it is first
            // used, and that question makes the page wait for the graphics card to finish linking it, one by
            // one (on a retina Mac, ~270 ms each: the 6.7 s freeze at the turn into chapter 2); unasked, the
            // card links them side by side while the frame goes on
            gl.debug.checkShaderErrors = import.meta.env.DEV;
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
