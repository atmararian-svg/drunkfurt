import { audio } from '../../audio/AudioDirector';
import { clamp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { Gate, autoplay, gates, globalProgress, localProgress, pageTurnFrom, playProgress } from '../../core/timeline';

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
 *    real time. At 6,000 rpm the car launches, once (`launch()` is guarded by
 *    `armed`, which it clears): the gate opens and ONE scripted move of the
 *    page plays everything after it by itself, without stopping: the launch
 *    (REV → LAUNCH_END), the ink closing over it and the next page opening
 *    (core/timeline playProgress, `locked` so that scrolling, a trackpad's
 *    momentum or a key cannot halt it half-way). The car's place is only ever
 *    set from that progress (Mercedes.tsx), so nothing else moves it. Scroll
 *    back into it afterwards and the car is back where it was at that moment.
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
  /** The launch and its rush of speed are played over REV → LAUNCH_END; then the ink closes. */
  launchEnd: 0.955,
} as const;

export const IDLE_RPM = 800;
export const LAUNCH_RPM = 6000;
/**
 * Seconds of the launch (REV → LAUNCH_END) when it plays by itself: off the
 * line and up through the gears for 3.4 s, then the rush (1.8 s) as the city
 * streams past and the page goes.
 */
export const LAUNCH_SECONDS = 5.2;
const PULL_AWAY = 3.4;
/** Top of the rush (m/s): just over 200 km/h on the speedometer. */
const RUSH_SPEED = 57;

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

/** Road speed (m/s) t seconds into the launch: hard off the line, then the rush. */
function speedAt(t: number) {
  if (t <= PULL_AWAY) return 9.5 * t * (1 - 0.12 * t);
  const v0 = 9.5 * PULL_AWAY * (1 - 0.12 * PULL_AWAY);
  return v0 + (RUSH_SPEED - v0) * smoothstep(clamp((t - PULL_AWAY) / (LAUNCH_SECONDS - PULL_AWAY), 0, 1));
}
/** Distance travelled by t (m), integrated once into a table. */
const STEP = 0.01;
const DIST: number[] = [0];
for (let i = 1; i * STEP <= LAUNCH_SECONDS * 1.3; i++) DIST.push(DIST[i - 1] + ((speedAt((i - 1) * STEP) + speedAt(i * STEP)) / 2) * STEP);
const distanceAt = (t: number) => {
  const i = Math.min(DIST.length - 2, Math.floor(t / STEP));
  return DIST[i] + (DIST[i + 1] - DIST[i]) * (t / STEP - i);
};
/** Gear changes (s into the launch): the revs drop at each and climb again. */
const SHIFTS = [0, 1.15, 2.5, 3.6, 4.4, 99];

/**
 * The launch at a local progress: seconds into it, distance from the kerb
 * along its route (m), road speed (m/s, for the speedometer), the rpm (for the
 * tachometer and the engine), and the rush (0..1, the speed effect at its end).
 * Before the launch (or without one) the car stands where it was parked.
 */
export function launchAt(local: number) {
  if (!getaway.launched || local <= CAR_BEAT.rev) return { t: 0, s: 0, v: 0, rpm: -1, rush: 0 };
  const u = clamp((local - CAR_BEAT.rev) / (CAR_BEAT.launchEnd - CAR_BEAT.rev), 0, 1.25);
  const t = u * LAUNCH_SECONDS;
  let g = 0;
  while (t > SHIFTS[g + 1]) g++;
  const inGear = clamp((t - SHIFTS[g]) / Math.min(1.3, SHIFTS[g + 1] - SHIFTS[g]), 0, 1);
  const rpm = g === 0 ? 6000 + 400 * inGear : 4100 + 2300 * Math.sqrt(inGear);
  return { t, s: distanceAt(t), v: speedAt(t), rpm, rush: smoothstep(clamp((t - (PULL_AWAY - 0.4)) / 1.2, 0, 1)) };
}

/**
 * Where the Mercedes is parked: in the parking lane on your right, nose
 * towards the towers, a little further down the street than the fight (the
 * man ends up at z ≈ -36; the car's tail is at z ≈ -39). You only reach it
 * after him. The kerb is at x = 5, the parking lane's cars stand at x = 3.95;
 * its driver's door faces the road.
 */
export const PARK = { x: 3.95, z: -41.5 };
/** The lane it pulls out into (the right-hand driving lane, as the city's traffic uses it). */
export const LANE_X = 1.75;
/** It is in the lane after this many metres (the next parked car's tail is 20 m ahead). */
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

/**
 * 6,000 rpm: the one launch. Disarms the rev phase (so it cannot fire again
 * and D does nothing more), opens the gate, and hands the page to a single
 * locked scripted move from here to the next page: the launch, the rush, the
 * ink closing and the next page opening. It runs on the wall clock and needs
 * nothing from the visitor; the sound is only a listener to it.
 */
function launch() {
  getaway.launched = true;
  getaway.armed = false;
  releaseAll();
  gate.open = true;
  story.setState({ prompt: null });
  const from = globalProgress('car', CAR_BEAT.rev);
  const end = globalProgress('car', CAR_BEAT.launchEnd);
  // through the page turn that follows the launch, to where the next page has opened
  const to = pageTurnFrom(end)?.to ?? globalProgress('car', 1);
  playProgress(from, to, (LAUNCH_SECONDS * (to - from)) / (end - from), true);
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
  // sound follows; it can never hold the story up
  quietly(() => audio.engine(ignited ? getaway.rpm : 0, launch_.rpm >= 0 ? 1 : getaway.held ? 1 : 0.15));
}

/** Runs a sound call; a failure there (no audio device, a closed context) is ignored. */
export function quietly(f: () => void) {
  try {
    f();
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[getaway] sound failed', err);
  }
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
  quietly(() => audio.engine(0, 0));
}

/** Is the page playing the launch right now (sounds follow it only then). */
export const launching = () => getaway.launched && autoplay.active;
