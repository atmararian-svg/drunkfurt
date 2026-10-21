import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { suspend } from 'suspend-react';
import { Object3D, SpotLight, Vector3 } from 'three';
import mercedesUrl from '../../assets/mercedes.glb?url';
import { audio } from '../../audio/AudioDirector';
import { localProgress } from '../../core/timeline';
import { useStory } from '../../core/store';
import { loadGlb } from '../../characters/inlineModel';
import { ROAD_Y } from '../city/layout';
import { buildCar } from './carRig';
import { CAR_BEAT, quietly, carAt, doorAt, getaway, ignitedAt, launchAt, leaveGetaway, lightsAt, setThrottle, updateGetaway } from './getaway';

/** Headlamp positions in the car's frame (m): left and right, at the lamp units. */
const LAMPS = [new Vector3(0.66, 0.67, 1.98), new Vector3(-0.66, 0.67, 1.98)];

/**
 * The getaway car in the city: parked where the episode needs it, and posed
 * every frame from the scroll position (getaway.ts): headlights, the driver's
 * door, the cluster, and after the launch its place on the road and its
 * rolling wheels. Also owns the episode's keyboard input (hold D) while the
 * episode is active, and the sounds that mark its beats.
 */
export function Mercedes() {
  // the car is part of the city; its input and engine run while episode 3 is on screen
  const active = useStory((s) => s.episode === 'car');
  const gltf = suspend(() => loadGlb(mercedesUrl), ['drunkfurt-mercedes']);
  const car = useMemo(() => {
    const c = buildCar(gltf);
    c.root.name = 'mercedes';
    return c;
  }, [gltf]);
  const spots = useRef<(SpotLight | null)[]>([]);
  const targets = useMemo(() => LAMPS.map(() => new Object3D()), []);
  const last = useRef(-1);
  const tmp = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__getaway = { getaway, setThrottle, car };
  }, [car]);

  // hold D to rev; the key is released if the window loses focus or the page is hidden
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'KeyD' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (getaway.armed) e.preventDefault();
      setThrottle(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyD') setThrottle(false);
    };
    const release = () => setThrottle(false);
    const hidden = () => document.visibilityState === 'hidden' && setThrottle(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
      leaveGetaway();
    };
  }, [active]);

  const clock = useRef(0);
  useFrame(() => {
    const local = localProgress('car');
    // the revs run on the wall clock, so the climb takes the same time at any frame rate
    const now = performance.now();
    const dt = clock.current ? Math.min((now - clock.current) / 1000, 0.25) : 0;
    clock.current = now;
    // where it is: parked, or on its launch
    const run = launchAt(local);
    const at = carAt(run.s);
    car.root.position.set(at.x, ROAD_Y, at.z);
    car.root.rotation.y = at.yaw;
    car.roll(run.s);
    // the car knows you, opens for you, starts
    const lit = lightsAt(local);
    car.lights(lit);
    car.door(doorAt(local));
    if (active) updateGetaway(dt);
    // the cluster: rpm from the engine (your revs, or the launch's gears), km/h from the road speed
    car.cluster(getaway.rpm, run.v * 3.6, ignitedAt(local) ? 1 : 0);
    car.root.updateMatrixWorld(true);
    LAMPS.forEach((p, i) => {
      const s = spots.current[i];
      if (!s) return;
      car.toWorld(p, s.position);
      // forward 20 m and down to the road
      car.toWorld(tmp.set(p.x * 1.6, -0.6, 22), targets[i].position);
      targets[i].updateMatrixWorld();
      s.intensity = 38 * lit;
      s.visible = lit > 0.01;
    });

    // the beats' sounds, as the scroll crosses them (going back plays the reverse action)
    if (active && audio.running && last.current >= 0) {
      const crossed = (b: number) => (last.current < b && local >= b ? 1 : last.current >= b && local < b ? -1 : 0);
      const unlock = crossed(CAR_BEAT.lightsOn) === 1;
      const o = crossed(CAR_BEAT.doorOpen);
      const c = crossed(CAR_BEAT.doorClosed - 0.008);
      const start = crossed(CAR_BEAT.ignition) === 1;
      quietly(() => {
        if (unlock) audio.carUnlock();
        if (o) audio.carDoor(o > 0);
        if (c) audio.carDoor(c < 0);
        if (start) audio.engineStart();
      });
    }
    last.current = active ? local : -1;
  });

  return (
    <>
      <primitive object={car.root} />
      {targets.map((t, i) => (
        <primitive key={`t${i}`} object={t} />
      ))}
      {LAMPS.map((_, i) => (
        <spotLight
          key={i}
          ref={(s) => (spots.current[i] = s)}
          target={targets[i]}
          color="#f4f2ea"
          intensity={0}
          angle={0.42}
          penumbra={0.55}
          decay={1.6}
          distance={34}
          visible={false}
        />
      ))}
    </>
  );
}
