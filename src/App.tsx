import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { NoToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { useStory } from './core/store';
import { TOTAL_LENGTH, locate, readScroll, scrollToProgress, timeline } from './core/timeline';
import { EPISODES, builtEpisodes } from './episodes';
import { rigPose, ScrollCameraRig } from './player/ScrollCameraRig';
import { Stylizer } from './render/Stylizer';
import { Overlay } from './ui/Overlay';

/** Mounts the active episode's world, plus the next one shortly before the hand-over. */
function EpisodeWorlds() {
  const episode = useStory((s) => s.episode);
  const list = builtEpisodes();
  const i = Math.max(0, list.findIndex((e) => e.id === episode));
  const mounted = episode === 'outro' ? list.slice(-1) : list.slice(i, i + 2);
  return (
    <>
      {mounted.map((e) => (
        <e.World key={e.id} />
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
