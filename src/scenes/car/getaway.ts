import { audio } from '../../audio/AudioDirector';
import { clamp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { Gate, autoplay, gates, globalProgress, localProgress, playProgress } from '../../core/timeline';

/**
 * Episode 3, the getaway: beats in local progress, and the one interactive
 * phase (revving the engine).
 *
 * Two kinds of state, kept apart on purpose:
 *
 *  - Everything you see before and after the rev phase is a pure function of
 *    the scroll position: where you walk, the headlights, the door, the camera
 *    entering the car, and (after the launch) where the car is, how far its
 *    wheels have turned and what the needle reads. Scroll back and it all
 *    plays backwards exactly.
 *
 *  - The rev phase itself is interactive: the story waits at REV (a closed
 *    gate on the scroll) while you hold D. `getaway.rpm` follows your key in
 *    real time. At 6,000 rpm the car launches once: the gate opens and the
 *    page plays REV → LAUNCH_END by itself (core/timeline playProgress). The
 *    launch is then just more scroll: scroll back into it and the car is back
 *    where it was at that moment.
 *
 * Rewinding past the rev phase (before REV - 0.03, i.e. back out of the
 * driver's seat) forgets the launch: the gate closes again, the rpm drops to
 * zero and the next pass through needs you to rev again. Nothing from a
 * launch can stay behind at an earlier position, because nothing earlier
 * reads `launched`.
 */
export const CAR_BEAT = {
  /** The city's last shot holds while the title shows. */
  hold: 0.06,
  /** You get up and turn to the car. */
  turn: 0.13,
  /** Walking: about seven steps, round its bonnet to the driver's door. */
  walk: 0.4,
  /** The car knows you: headlights come up (ramp start, end). */
  lightsOn: 0.27,
  lightsFull: 0.31,
  /** The driver's door opens (start, end). */
  doorOpen: 0.4,
  doorOpened: 0.47,
  /** Into the seat. */
  seated: 0.6,
  /** The door shuts behind you (start, end). */
  doorClose: 0.6,
  doorClosed: 0.64,
  /** Ignition: the cluster lights and the engine catches. */
  ignition: 0.645,
  /** The story waits here for you to rev. */
  rev: 0.66,
  /** The launch is played over REV → LAUNCH_END, then the page turns. */
  launchEnd: 0.955,
} as const;

export const IDLE_RPM = 800;
export const LAUNCH_RPM = 6000;
/** Seconds the launch takes when it plays by itself. */
export const LAUNCH_SECONDS = 3.6;

export const getaway = {
  /** Live engine speed while you rev (rpm). */
  rpm: 0,
  /** D (or a press on the tachometer) is held. */
  held: false,
  /** Waiting at the rev gate for you. */
  armed: false,
  /** The car has launched (on this pass through the episode). */
  launched: false,
};

const gate: Gate = { episode: 'car', at: CAR_BEAT.rev, open: false };
gates.push(gate);

const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);

/** Door opening (0 shut … 1 open) at a local progress. */
export const doorAt = (local: number) =>
  smoothstep(ramp(local, CAR_BEAT.doorOpen, CAR_BEAT.doorOpened)) * (1 - smoothstep(ramp(local, CAR_BEAT.doorClose, CAR_BEAT.doorClosed)));
/** Headlights (0 off … 1 on). */
export const lightsAt = (local: number) => smoothstep(ramp(local, CAR_BEAT.lightsOn, CAR_BEAT.lightsFull));
/** Engine on (the cluster lights). */
export const ignitedAt = (local: number) => local >= CAR_BEAT.ignition;

/**
 * The launch at a local progress: seconds into it, distance from the kerb
 * along its route (m), and the rpm the needle shows (through three gears).
 * Before the launch (or without one) the car stands where it was parked.
 */
export function launchAt(local: number) {
  if (!getaway.launched || local <= CAR_BEAT.rev) return { t: 0, s: 0, v: 0, rpm: -1 };
  const u = clamp((local - CAR_BEAT.rev) / (CAR_BEAT.launchEnd - CAR_BEAT.rev), 0, 1.2);
  const t = u * LAUNCH_SECONDS;
  // hard off the line, easing as the gears go up: about 9 m/s² at first
  const a0 = 9.5;
  const v = a0 * t * (1 - 0.12 * t);
  const s = a0 * (t * t / 2 - (0.12 * t * t * t) / 3);
  // revs: each gear runs up from ~3,800 to ~6,400 rpm, a short dip at each shift
  const gears = [0, 1.15, 2.5, 99];
  let g = 0;
  while (t > gears[g + 1]) g++;
  const inGear = (t - gears[g]) / Math.min(1.6, gears[g + 1] - gears[g]);
  const rpm = (g === 0 ? 6000 : 3900) + (g === 0 ? 400 : 2500) * clamp(inGear, 0, 1);
  return { t, s, v, rpm };
}

/**
 * Where the Mercedes is parked: in the parking lane on your right, nose
 * towards the towers, a few steps from where the fight ended (the kerb is at
 * x = 5, the parking lane's cars stand at x = 3.95). Its driver's door faces
 * the road.
 */
export const PARK = { x: 3.95, z: -29.3 };
/** The lane it pulls out into (the right-hand driving lane, as the city's traffic uses it). */
export const LANE_X = 1.75;
/** It is in the lane after this many metres (the next parked car is 16.7 m ahead). */
const PULL_OUT = 15;
/** The rear axle, behind the model's origin (m). */
const REAR_AXLE = 1.46;

/**
 * The car on the road after s metres of its launch: it pulls out of the
 * parking lane into the driving lane along a smooth S, then runs straight down
 * the boulevard. As a real car does, it steers about its rear axle: the S is
 * the rear axle's path and the car points along it, so the tail does not swing
 * out over the kerb. Heading: the model faces +z, so π is towards the towers.
 */
export function carAt(s: number) {
  const u = clamp(s / PULL_OUT, 0, 1);
  const x = PARK.x + (LANE_X - PARK.x) * smoothstep(u);
  // heading from the slope of the S (dx/ds), so it never slides sideways
  const slope = s < PULL_OUT ? ((LANE_X - PARK.x) * 6 * u * (1 - u)) / PULL_OUT : 0;
  const yaw = Math.PI - Math.atan(slope);
  // the rear axle on the S; the model's origin is ahead of it along the heading
  const zAxle = PARK.z + REAR_AXLE - s;
  return { x: x + Math.sin(yaw) * REAR_AXLE, z: zAxle + Math.cos(yaw) * REAR_AXLE, yaw };
}

/** What is holding the throttle: the D key, a press on the tachometer. */
const holds = { key: false, pointer: false };

/**
 * D down / up (or a press on the tachometer). The key is remembered even
 * before the story waits for it, so holding D while you sit down revs as soon
 * as the engine is ready; it only counts while the rev phase is armed.
 */
export function setThrottle(on: boolean, source: keyof typeof holds = 'key') {
  holds[source] = on;
  getaway.held = getaway.armed && (holds.key || holds.pointer);
}
const releaseAll = () => {
  holds.key = holds.pointer = false;
  getaway.held = false;
};

function launch() {
  getaway.launched = true;
  getaway.armed = false;
  releaseAll();
  gate.open = true;
  story.setState({ prompt: null });
  playProgress(globalProgress('car', CAR_BEAT.rev), globalProgress('car', CAR_BEAT.launchEnd), LAUNCH_SECONDS * 0.985);
}

/** Forget a launch (scrolled back out of the car, or left the episode backwards). */
export function resetGetaway() {
  getaway.launched = false;
  getaway.armed = false;
  releaseAll();
  gate.open = false;
  if (story.getState().prompt === 'rev') story.setState({ prompt: null });
}

/**
 * Called every frame while the episode is on screen. Advances the rpm (the one
 * real-time quantity), arms and disarms the rev phase, launches at the
 * threshold, and keeps the engine sound in step.
 */
export function updateGetaway(dt: number) {
  const local = localProgress('car');
  if (getaway.launched && local < CAR_BEAT.rev - 0.03) resetGetaway();
  const waiting = !getaway.launched && local >= CAR_BEAT.rev - 0.002;
  if (waiting !== getaway.armed) {
    getaway.armed = waiting;
    story.setState({ prompt: waiting ? 'rev' : null });
  }
  getaway.held = getaway.armed && (holds.key || holds.pointer);
  const ignited = ignitedAt(local);
  const launch_ = launchAt(local);
  if (launch_.rpm >= 0) {
    getaway.rpm = launch_.rpm;
  } else if (!ignited) {
    // engine off: the needle falls back to zero
    getaway.rpm = Math.max(0, getaway.rpm - dt * 4000);
  } else if (getaway.held) {
    // a deliberate climb: about two seconds from idle to the red line
    getaway.rpm = Math.min(LAUNCH_RPM + 50, getaway.rpm + dt * (1500 + 0.35 * getaway.rpm));
  } else {
    // released (or just started): settle to idle; the starter brings it up from zero
    const target = IDLE_RPM;
    getaway.rpm = getaway.rpm < target ? Math.min(target, getaway.rpm + dt * 1600) : target + (getaway.rpm - target) * Math.exp(-dt * 2.2);
  }
  if (getaway.armed && getaway.rpm >= LAUNCH_RPM) launch();
  audio.engine(ignited ? getaway.rpm : 0, launch_.rpm >= 0 ? 1 : getaway.held ? 1 : 0.15);
}

/** The episode is off screen: no input, no engine. */
export function leaveGetaway() {
  releaseAll();
  // left backwards (into the city): the launch is forgotten, as when scrolling back out of the seat
  if (localProgress('car') < CAR_BEAT.rev) resetGetaway();
  if (getaway.armed) {
    getaway.armed = false;
    story.setState({ prompt: null });
  }
  audio.engine(0, 0);
}

/** Is the page playing the launch right now (sounds follow it only then). */
export const launching = () => getaway.launched && autoplay.active;
