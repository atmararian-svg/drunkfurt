import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { audio } from '../../audio/AudioDirector';
import { createCrowd } from '../../characters/crowd';
import { People } from '../../characters/People';
import { clamp } from '../../core/math';
import { story } from '../../core/store';
import { localProgress } from '../../core/timeline';
import { Buildings } from './Buildings';
import { Cars } from './Cars';
import { CITY_PEOPLE } from './cast';
import { cityNav } from './nav';
import { BEAT, cityTimeScale, encounter, updateEncounter } from './encounter';
import { PORTAL, STATION_FACE_Z } from './layout';
import { Skyline } from './Skyline';
import { PlayerArms } from './PlayerArms';
import { Bag, Stranger, StrangerBoundary } from './Stranger';
import { Street } from './Street';
import { StreetFurniture } from './StreetFurniture';

const timeScale = () => cityTimeScale(localProgress('city'));

/** The city's sound: a quiet bed that thins out and muffles as the stranger closes in. */
function Soundscape({ active }: { active: boolean }) {
  const st = useMemo(() => ({ cutoff: 20000 }), []);
  useEffect(() => {
    if (!active) {
      audio.setAmbience(0, 1.5);
      audio.setHeartbeat(0);
      audio.setWorldMuffle(20000, 0.8);
      st.cutoff = 20000;
    }
  }, [active, st]);
  useFrame(() => {
    if (!active || !audio.running) return;
    audio.startCityAmbience();
    const local = localProgress('city');
    const resolved = encounter.state === 'resolved';
    const tension = resolved ? 0 : clamp((local - BEAT.strangerMoves) / (BEAT.gate - BEAT.strangerMoves), 0, 1);
    const after = resolved && local >= BEAT.cut;
    audio.setAmbience(after ? 0.3 : 1 - 0.65 * tension, 0.8);
    const cutoff = after ? 2600 : 20000 * Math.pow(650 / 20000, tension);
    if (Math.abs(cutoff - st.cutoff) / st.cutoff > 0.04) {
      audio.setWorldMuffle(cutoff, 0.5);
      st.cutoff = cutoff;
    }
    audio.setHeartbeat(!resolved && tension > 0.6 ? 1 : 0);
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

  useFrame((_, dt) => {
    if (!active) return;
    updateEncounter(Math.min(dt, 0.05) * timeScale());
  });

  // leaving the episode backwards hides any pending prompt
  useEffect(() => {
    if (!active && encounter.state === 'armed') {
      encounter.state = 'approach';
      story.setState({ prompt: null });
    }
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
      <Bag active={active} />
      <PlayerArms active={active} />
      <Soundscape active={active} />
    </>
  );
}
