import { Vector3 } from 'three';
import { CameraTrack } from '../../core/cameraTrack';
import { clamp, deg, smoothstep } from '../../core/math';
import type { CameraPose } from '../../core/sequence';
import { localProgress } from '../../core/timeline';
import type { EpisodeDef } from '../../episodes/types';
import { DRIVER_EYE } from './carRig';
import { CAR_BEAT, PARK, carAt, launchAt } from './getaway';

/**
 * Episode 3 camera. It starts exactly where episode 2's last shot is (you,
 * crouched by the man on the pavement, your bag still on your shoulder), so
 * there is no page turn between them.
 *
 *  0.00–0.06  the last shot holds; the title comes up over it
 *  0.06–0.13  you get up and look on down the street: the Mercedes at the kerb
 *  0.13–0.40  about ten steps on, past him (he stays behind you), off the kerb
 *             and along the car to its driver's door on the road side. Its
 *             lights come up as you reach it (0.27–0.31)
 *  0.40–0.47  the door opens
 *  0.47–0.60  in: duck under the roof line, through the door opening, into
 *             the seat, turning to face the windscreen
 *  0.60–0.64  the door shuts; 0.645 ignition; your eyes go to the instrument
 *             cluster; 0.66 the story waits: hold D
 *  0.66–      the launch (played by itself once you reach 6,000 rpm)
 *
 * Positions inside and around the car are worked out from its own frame
 * (driver's eye, door opening, roof line in carRig.ts) and the parking spot;
 * the walk keeps more than a metre from the man and his knife.
 */
// the car's frame → world, for the parked car (facing -z): x and z flip
const W = (lx: number, ly: number, lz: number): [number, number, number] => [PARK.x - lx, -0.15 + ly, PARK.z - lz];
const SEAT = W(DRIVER_EYE.x, DRIVER_EYE.y, DRIVER_EYE.z);

export const carTrack = new CameraTrack([
  // episode 2's last frame, exactly (city track, t = 1)
  { t: 0, pos: [5.5, 1.4, -32.9], yaw: deg(-24), pitch: deg(-21), fov: 44 },
  { t: CAR_BEAT.hold, pos: [5.5, 1.4, -32.9], yaw: deg(-24), pitch: deg(-21), fov: 44 },
  // up, looking on down the street past him: the Mercedes stands at the kerb ahead
  { t: CAR_BEAT.turn, pos: [5.4, 1.68, -33.2], yaw: deg(18), pitch: deg(-7), fov: 50 },
  { t: 0.2, pos: [5.15, 1.68, -34.3], yaw: deg(24), pitch: deg(-6), fov: 50 },
  // off the kerb (the road is 15 cm lower), giving him a wide berth
  { t: 0.25, pos: [4.3, 1.54, -35.6], yaw: deg(26), pitch: deg(-6), fov: 50 },
  { t: 0.31, pos: [3.4, 1.53, -37.5], yaw: deg(22), pitch: deg(-6), fov: 50 },
  { t: 0.36, pos: [2.35, 1.53, -39.4], yaw: deg(6), pitch: deg(-7), fov: 50 },
  // at the driver's door, facing it
  { t: CAR_BEAT.walk, pos: [...W(1.85, 1.68, -0.4)], yaw: deg(-68), pitch: deg(-11), fov: 50 },
  { t: CAR_BEAT.doorOpened, pos: [...W(1.87, 1.68, -0.44)], yaw: deg(-80), pitch: deg(-14), fov: 50 },
  // in: lean in and duck below the roof line (1.33 m in the car's frame at the opening), then sit
  { t: 0.52, pos: [...W(1.35, 1.42, -0.33)], yaw: deg(-62), pitch: deg(-12), fov: 52 },
  { t: 0.56, pos: [...W(0.95, 1.17, -0.29)], yaw: deg(-38), pitch: deg(-7), fov: 52 },
  { t: CAR_BEAT.seated, pos: SEAT, yaw: deg(-10), pitch: deg(-6), fov: 50 },
  { t: CAR_BEAT.doorClosed, pos: SEAT, yaw: deg(0), pitch: deg(-9), fov: 46 },
  // the cluster comes alive: your eyes drop to it, through the steering wheel
  { t: CAR_BEAT.rev, pos: SEAT, yaw: deg(0), pitch: deg(-14), fov: 35 },
  { t: 1, pos: SEAT, yaw: deg(0), pitch: deg(-14), fov: 35 },
]);

const eye = new Vector3();

/**
 * From the seat on, the camera rides in the car: its eye point and heading
 * follow the car (its launch, getaway.ts). As it goes, your eyes come up from
 * the cluster to the road; the acceleration pushes you back into the seat and
 * lifts the nose a little; the road sends a fine shudder; and in the rush at
 * the end the view widens as the street streams past.
 */
function ride(local: number, pose: CameraPose) {
  const sitting = smoothstep(clamp((local - 0.5) / (CAR_BEAT.seated - 0.5), 0, 1));
  pose.seated = sitting;
  if (local < CAR_BEAT.seated) return;
  const run = launchAt(local);
  if (run.rpm < 0) return; // parked: the track has it
  const at = carAt(run.s);
  // the push of the acceleration, strongest off the line
  const g = clamp(1 - 0.24 * run.t, 0, 1) * smoothstep(clamp(run.t / 0.25, 0, 1));
  const c = Math.cos(at.yaw);
  const s = Math.sin(at.yaw);
  eye.set(DRIVER_EYE.x, DRIVER_EYE.y, DRIVER_EYE.z - 0.05 * g);
  // car frame (facing +z) → world: rotate by the car's heading, then place it
  pose.position.set(at.x + eye.x * c + eye.z * s, -0.15 + eye.y, at.z - eye.x * s + eye.z * c);
  pose.yaw = at.yaw - Math.PI;
  // eyes up from the cluster to the road in the first half second
  const up = smoothstep(clamp(run.t / 0.6, 0, 1));
  pose.pitch = deg(-14) + (deg(-5) - deg(-14)) * up + deg(2.2) * g;
  const shudder = clamp(run.v / 20, 0, 1) * (1 + run.rush);
  pose.position.y += Math.sin(run.t * 71) * 0.003 * shudder + Math.sin(run.t * 37 + 1) * 0.002 * shudder;
  pose.roll = Math.sin(run.t * 29) * 0.002 * shudder;
  pose.fov = 35 + 17 * up + 6 * smoothstep(clamp(run.v / 20, 0, 1)) + 16 * run.rush;
}

/** Episode 3 plays on episode 2's street; its own world adds nothing (the car is part of the city). */
function NoWorld() {
  return null;
}

export const carEpisode: EpisodeDef = {
  id: 'car',
  number: 3,
  title: 'Getaway',
  subtitle: 'Kaiserstraße · 00:04',
  World: NoWorld,
  sharesWorld: 'city',
  track: carTrack,
  adjustPose: ride,
  // in the seat, the head stays inside the cabin (the rig already scales it down)
  clampHead: (_base, o) => {
    const inside = smoothstep(clamp((localProgress('car') - 0.5) / 0.1, 0, 1));
    const k = 1 - 0.6 * inside;
    o.x *= k;
    o.y = Math.min(o.y * k, 0.02 + 0.04 * (1 - inside));
    o.z *= k;
  },
  captions: [
    { from: 0.15, to: 0.3, place: 'tl', text: 'The bag stayed on my shoulder. The car was waiting.' },
    { from: 0.67, to: 0.95, place: 'tl', tone: 'yellow', text: 'Time to get out of Drunkfurt.' },
  ],
  beats: [0, CAR_BEAT.turn, CAR_BEAT.walk, CAR_BEAT.doorOpened, CAR_BEAT.doorClosed, CAR_BEAT.rev, 1],
};
