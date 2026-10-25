import { Canvas } from '@react-three/fiber';
import { Component, ReactNode, Suspense, useEffect } from 'react';
import { NoToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { story, useStory } from './core/store';
import { EpisodeId, TOTAL_LENGTH, autoplay, chapterTurn, gates, locate, readScroll, scriptOwnsScroll, scrollToProgress, stopAutoplay, timeline } from './core/timeline';
import { EPISODES, builtEpisodes } from './episodes';
import { cameraDirector, rigPose, ScrollCameraRig } from './player/ScrollCameraRig';
import { encounter, encounterAt } from './scenes/city/encounter';
import { Stylizer } from './render/Stylizer';
import { FrameGrab } from './render/FrameGrab';
import { chapterOf, chapterReadiness } from './core/chapters';
import { preloadRoom } from './scenes/home/RoomScene';
import { installChapterTransitions } from './ui/chapterTransition';
import { Overlay } from './ui/Overlay';
import { Preloader } from './ui/Preloader';

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
  const near = episode === 'outro' ? list.slice(-1) : list.slice(Math.max(0, i - 1), i + 2);
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
 * The 3D page's pixel density: up to 1.75 on a desktop; on touch devices (phones, tablets, with
 * dense screens and small GPUs) up to 1.25, where the comic look's ink and halftone hold up and
 * the frame rate does too.
 */
const TOUCH_DPR: [number, number] = window.matchMedia?.('(pointer: coarse)').matches ? [1, 1.25] : [1, 1.75];

export function App() {
  const episode = useStory((s) => s.episode);

  // chapters change through the chapter transition; chapter 3's assets load once chapter 2 is in
  useEffect(() => installChapterTransitions(), []);
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
      <div className="stage" role="img" aria-label="DRUNKFURT, Episode 1: arriving at Frankfurt (Main) Hbf at night">
        <Canvas
          shadows={{ type: PCFShadowMap }}
          dpr={TOUCH_DPR}
          gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }}
          camera={{ fov: 54, near: 0.05, far: 1300 }}
          onCreated={({ gl }) => {
            gl.toneMapping = NoToneMapping;
            gl.outputColorSpace = SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <ScrollCameraRig />
            <EpisodeWorlds />
            <Stylizer version={episode} />
            <FrameGrab />
          </Suspense>
        </Canvas>
      </div>
      <div className="scroll-track" style={{ height: `${TOTAL_LENGTH * 100}vh` }} aria-hidden />
      <Overlay />
      <Preloader />
    </>
  );
}
