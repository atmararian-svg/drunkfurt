import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Group } from 'three';
import { clamp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { localProgress } from '../../core/timeline';
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
import { MAST_Z, PLATFORM, PLATFORM_2, TRACKS } from './layout';
import { LEAF_TRAVEL, TrainSpec } from './trainGeometry';

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
 * Episode 1 world — Frankfurt (Main) Hbf, Gleis 7, a few minutes before midnight.
 * The camera belongs to the episode track; this component only builds the
 * world and runs the scroll-driven events inside it.
 */
export function StationScene() {
  const { gl, scene, camera } = useThree();
  const leaf = useRef<Group>(null);

  // Compile shaders up front, then fade in.
  useEffect(() => {
    let cancelled = false;
    gl.compile(scene, camera);
    let frames = 0;
    const tick = () => {
      if (cancelled) return;
      if (++frames < 3) requestAnimationFrame(tick);
      else story.setState({ phase: 'ready' });
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera]);

  // Scroll event: once we're off the train, its door slides shut behind us.
  useFrame(() => {
    const t = localProgress('station');
    const g = leaf.current;
    if (!g) return;
    const close = clamp((t - 0.4) / 0.08, 0, 1);
    const slide = smoothstep(clamp(close / 0.8, 0, 1));
    const plug = smoothstep(clamp((close - 0.75) / 0.25, 0, 1));
    g.position.set(LEAF_TRAVEL.x * plug, 0, LEAF_TRAVEL.z * slide);
  });

  return (
    <>
      <Lighting />
      <Hall />
      <Platform {...PLATFORM} />
      <Platform {...PLATFORM_2} />
      <Tracks xs={[TRACKS.a, TRACKS.b, TRACKS.c]} buffered />
      <Train trackX={TRACKS.a} spec={TRAIN_A} variant={0} leafRef={leaf} />
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
