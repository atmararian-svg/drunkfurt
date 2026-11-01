import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Object3D } from 'three';
import { audio } from '../../audio/AudioDirector';
import { createCrowd } from '../../characters/crowd';
import { People } from '../../characters/People';
import { clamp, smoothstep } from '../../core/math';
import { localProgress, locate, timeline } from '../../core/timeline';
import { Mercedes } from '../car/Mercedes';
import { Buildings } from './Buildings';
import { Cars } from './Cars';
import { CITY_PEOPLE } from './cast';
import { cityNav } from './nav';
import { BEAT, cityTimeScale, disarm, encounter, updateEncounter } from './encounter';
import { PORTAL, STATION_FACE_Z } from './layout';
import { Skyline } from './Skyline';
import { LaundryLight, Stranger, StrangerBoundary } from './Stranger';
import { updateLetter } from './letter';
import { LetterProp } from './LetterProp';
import { Street } from './Street';
import { StreetFurniture } from './StreetFurniture';

/** The city's clock: the encounter's slow motion, then, as you walk to the car (episode 3), back to normal. */
const timeScale = () => {
  const car = localProgress('car');
  if (car <= 0) return cityTimeScale(localProgress('city'));
  return cityTimeScale(1) + (1 - cityTimeScale(1)) * smoothstep(clamp(car / 0.3, 0, 1));
};

/**
 * Compiles every material of the street once, as the chapter opens, including those of things
 * that only appear later (the knife on the pavement, the letter, the laundry window's light on
 * him): otherwise each is compiled the moment it first shows, a hitch right after the fight. Its
 * marker sits in the city's own group; the hidden parts are shown for the compile and hidden
 * again at once (nothing is drawn in between).
 */
function Precompile({ active }: { active: boolean }) {
  const { gl, scene, camera } = useThree();
  const marker = useRef<Object3D>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!active || done.current) return;
    let raf = 0;
    let n = 0;
    // a few frames in, after the print treatment has patched the street's materials
    const go = () => {
      if (++n < 4) {
        raf = requestAnimationFrame(go);
        return;
      }
      const root = marker.current?.parent;
      if (!root) return;
      const hidden: Object3D[] = [];
      root.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      try {
        gl.compile(root, camera, scene);
      } catch (err) {
        console.warn('[city] precompile', err);
      }
      hidden.forEach((o) => (o.visible = false));
      done.current = true;
    };
    raf = requestAnimationFrame(go);
    return () => cancelAnimationFrame(raf);
  }, [active, gl, scene, camera]);
  return <object3D ref={marker} />;
}

/** The city's sound: a quiet bed that thins out and muffles as the stranger closes in. */
function Soundscape({ active }: { active: boolean }) {
  const st = useMemo(() => ({ cutoff: 20000 }), []);
  useEffect(() => {
    const quiet = () => {
      audio.setAmbience(0, 1.5);
      audio.setHeartbeat(0);
      audio.setWorldMuffle(20000, 0.8);
      st.cutoff = 20000;
    };
    if (!active) quiet();
    // unmounted while on screen (the page turn into episode 4 takes the street away): fall silent too
    return () => {
      if (active) quiet();
    };
  }, [active, st]);
  useFrame(() => {
    if (!active || !audio.running) return;
    // the closing card after the getaway: the street falls silent under it
    if (locate(timeline.progress).id === 'outro') {
      audio.setAmbience(0, 1.2);
      audio.setHeartbeat(0);
      return;
    }
    audio.startCityAmbience();
    const local = localProgress('city');
    // all from the progress: tension builds as he walks up, breaks once the fight is decided
    const decided = !!encounter.outcome && local >= BEAT.gate;
    const tension = decided ? 0 : clamp((local - BEAT.strangerMoves) / (BEAT.gate - BEAT.strangerMoves), 0, 1);
    const after = decided && local >= BEAT.cut;
    // walking away to the car (episode 3), the street comes back
    const back = smoothstep(clamp(localProgress('car') / 0.3, 0, 1));
    audio.setAmbience(after ? 0.3 + 0.45 * back : 1 - 0.65 * tension, 0.8);
    const cutoff = after ? 2600 * Math.pow(20000 / 2600, back) : 20000 * Math.pow(650 / 20000, tension);
    if (Math.abs(cutoff - st.cutoff) / st.cutoff > 0.04) {
      audio.setWorldMuffle(cutoff, 0.5);
      st.cutoff = cutoff;
    }
    audio.setHeartbeat(!decided && tension > 0.6 ? 1 : 0);
  });
  return null;
}

/**
 * Episode 2 world: midnight outside the station. The square in front of the
 * portal, the boulevard towards the towers, a few people out late, and one who
 * is not just passing by.
 */
export function CityScene({ active }: { active: boolean }) {
  const crowd = useMemo(() => createCrowd(CITY_PEOPLE, cityNav), []);
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (!active) return;
    gl.compile(scene, camera);
  }, [active, gl, scene, camera]);

  useFrame(() => {
    if (!active) return;
    updateEncounter();
    updateLetter();
  });

  // leaving the episode backwards hides any pending prompt
  useEffect(() => {
    if (!active) disarm();
  }, [active]);

  return (
    <>
      {active && <color attach="background" args={['#0b0c0f']} />}
      {active && <fogExp2 attach="fog" args={['#0e0f12', 0.0085]} />}
      <hemisphereLight args={['#2f343c', '#121212', 0.5]} />
      {/* a cold glow off the low clouds, from down the street, for rim light on silhouettes */}
      <directionalLight position={[10, 40, -200]} intensity={0.22} color="#a7adb8" />
      {/* the lit station hall behind the visitor spills out through the portal */}
      <pointLight position={[PORTAL.x, 6, STATION_FACE_Z + 6]} intensity={60} distance={30} decay={2} color="#efeadb" />
      <Street />
      <Buildings />
      <Skyline />
      <StreetFurniture active={active} />
      <Cars active={active} timeScale={timeScale} />
      <People crowd={crowd} scroll={() => localProgress('city')} timeScale={timeScale} enabled={active} />
      <StrangerBoundary>
        <Stranger active={active} timeScale={timeScale} />
      </StrangerBoundary>
      <LaundryLight active={active} />
      {/* the letter he dropped, after the fight */}
      <LetterProp active={active} />
      {/* the getaway car stands at the kerb from the start; episode 3 is played with it */}
      <Mercedes />
      <Soundscape active={active} />
      <Precompile active={active} />
    </>
  );
}
