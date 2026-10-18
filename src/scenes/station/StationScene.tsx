import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { story, useStory } from '../../core/store';
import { FirstPersonRig, RigMode, cameraDirector, requestTeleport, rigPose } from '../../player/FirstPersonRig';
import { input } from '../../player/input';
import { Concourse } from './Concourse';
import { Dust } from './Dust';
import { DistantMasts, Furniture } from './Furniture';
import { Hall } from './Hall';
import { Lighting } from './Lighting';
import { Outside } from './Outside';
import { Passengers } from './Passengers';
import { Pigeon } from './Pigeon';
import { Platform } from './Platform';
import { Tracks } from './Tracks';
import { Train } from './Train';
import { EYE_HEIGHT, MAST_Z, PLATFORM, PLATFORM_2, TRACKS, WALK_BOUNDS } from './layout';
import { stationColliders } from './props';
import { ARRIVAL_ANCHOR, stepOutShot } from './shots';
import { TrainSpec } from './trainGeometry';

/** Our train on Gleis 7: arrived, terminating, door open. */
const TRAIN_A: TrainSpec = {
  noseZ: -98.45,
  cars: 7,
  rearPowerCar: true,
  openDoor: { car: 2, side: 1 },
  platformSide: 1,
  litChance: 1,
  seed: 4,
};

/** Gleis 8: a train waiting for its (delayed) departure. Some cars dark. */
const TRAIN_B: TrainSpec = {
  noseZ: -96.2,
  cars: 7,
  rearPowerCar: true,
  firstClassCars: [1],
  platformSide: -1,
  litChance: 0.6,
  seed: 11,
};

const DUST_LAMPS = MAST_Z.filter((z) => z > -35 && z < 20);

/**
 * Scene 1 — Arrival at Frankfurt (Main) Hbf, Gleis 7, a few minutes before midnight.
 */
export function StationScene() {
  const phase = useStory((s) => s.phase);
  const { gl, scene, camera } = useThree();

  // Compile shaders up front, then let the visitor in.
  useEffect(() => {
    let cancelled = false;
    gl.compile(scene, camera);
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      if (++frames < 3) requestAnimationFrame(tick);
      else if (story.getState().phase === 'loading') story.setState({ phase: 'arrival' });
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);

  // The step-out is a one-way state change; the director refuses overlapping shots.
  useEffect(() => {
    if (phase !== 'stepping-out') return;
    cameraDirector.play(stepOutShot(rigPose), () => story.setState({ phase: 'platform' }));
  }, [phase]);

  // Dev-only inspection handle (used for automated screenshots).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__drunkfurt = { story, rigPose, input, requestTeleport, scene };
  }, []);

  const mode: RigMode = phase === 'arrival' ? 'anchored' : phase === 'platform' ? 'free' : 'locked';

  return (
    <>
      <FirstPersonRig
        mode={mode}
        anchor={ARRIVAL_ANCHOR}
        eyeHeight={EYE_HEIGHT}
        bounds={WALK_BOUNDS}
        colliders={stationColliders}
      />
      <Lighting />
      <Hall />
      <Platform {...PLATFORM} />
      <Platform {...PLATFORM_2} />
      <Tracks xs={[TRACKS.a, TRACKS.b, TRACKS.c]} buffered />
      <Train trackX={TRACKS.a} spec={TRAIN_A} variant={0} />
      <Train trackX={TRACKS.b} spec={TRAIN_B} variant={1} />
      <Furniture />
      <DistantMasts x={(PLATFORM_2.x0 + PLATFORM_2.x1) / 2} zs={MAST_Z} />
      <Concourse />
      <Outside />
      <Passengers />
      <Pigeon home={[3.4, -7.2]} />
      <Dust lampZ={DUST_LAMPS} />
    </>
  );
}
