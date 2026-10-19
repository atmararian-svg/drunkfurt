import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { NoToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { useStory } from './core/store';
import { TOTAL_LENGTH, locate, readScroll, scrollToProgress, timeline } from './core/timeline';
import { EPISODES, builtEpisodes } from './episodes';
import { cameraDirector, rigPose, ScrollCameraRig } from './player/ScrollCameraRig';
import { debug as encounterDebug, encounter } from './scenes/city/encounter';
import { Stylizer } from './render/Stylizer';
import { Overlay } from './ui/Overlay';

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
  const mounted = episode === 'outro' ? list.slice(-1) : list.slice(Math.max(0, i - 1), i + 2);
  const activeId = episode === 'outro' ? list[list.length - 1].id : episode;
  return (
    <>
      {mounted.map((e) => (
        <group key={e.id} visible={loading || e.id === activeId}>
          <e.World active={e.id === activeId} />
        </group>
      ))}
    </>
  );
}

export function App() {
  const episode = useStory((s) => s.episode);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    readScroll();
    timeline.progress = timeline.target;
    const onScroll = () => readScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__drunkfurt = {
        timeline,
        rigPose,
        locate,
        EPISODES,
        encounter,
        encounterDebug,
        /** Hold the camera on a fixed frame (inspection only): pos, yaw/pitch in degrees, fov. */
        frame(pos: [number, number, number], yaw: number, pitch: number, fov = 40) {
          const k = { pos, yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180, fov };
          cameraDirector.stop();
          cameraDirector.play({ id: 'inspect', duration: 1e6, keys: [{ t: 0, ...k }, { t: 1, ...k }] });
        },
        /** Jump straight to a global progress value, without smoothing. */
        setProgress(p: number) {
          scrollToProgress(p, false);
          readScroll();
          timeline.progress = timeline.target;
        },
      };
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <>
      <div className="stage" role="img" aria-label="DRUNKFURT, Episode 1: arriving at Frankfurt (Main) Hbf at night">
        <Canvas
          shadows={{ type: PCFShadowMap }}
          dpr={[1, 1.75]}
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
          </Suspense>
        </Canvas>
      </div>
      <div className="scroll-track" style={{ height: `${TOTAL_LENGTH * 100}vh` }} aria-hidden />
      <Overlay />
    </>
  );
}
