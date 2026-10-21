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
 *    gate on the scroll) until you press D. That starts one four-second rev
 *    sequence on the wall clock (REV_SEQUENCE): four presses of the
 *    throttle, one a second, the needle climbing with each, and at 4 s, at
 *    6,000 rpm, the launch. Once started it plays to the end by itself
 *    (letting go of D does not stop it, pressing again does not restart it).
 *    The car launches once (`launch()` is guarded by `armed`, which it
 *    clears): the gate opens and ONE scripted move of the
 *    page plays everything after it by itself, without stopping: the launch
 *    (REV → LAUNCH_END) and on into the chapter transition to the next chapter
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
  /** The launch and its rush of speed are played over REV → LAUNCH_END; then the chapter turns. */
  launchEnd: 0.955,
} as const;

export const IDLE_RPM = 800;
export const LAUNCH_RPM = 6000;

/**
 * The rev sequence, in seconds since D was pressed: four throttle presses, one
 * a second, and the launch at 4 s. Each press brings the needle up to a peak
 * (when the recording's own rev peaks, AudioDirector REV_SLICES) and it sags a
 * little before the next; the fourth climbs all the way to 6,000 at 4 s.
 */
export const REV_SEQUENCE = {
  seconds: 4,
  presses: [0, 1, 2, 3],
  /** rpm keys: [t, rpm] */
  rpm: [
    [0, IDLE_RPM],
    [0.62, 3000],
    [1, 2350],
    [1.46, 3900],
    [2, 3250],
    [2.6, 4900],
    [3, 4250],
    [4, LAUNCH_RPM],
  ] as [number, number][],
};

/** The needle during the rev sequence: eased between the keys (in and out of each peak, no corners). */
function revRpm(t: number) {
  const k = REV_SEQUENCE.rpm;
  if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1][0]) i++;
  const [t0, r0] = k[i];
  const [t1, r1] = k[i + 1];
  const u = clamp((t - t0) / (t1 - t0), 0, 1);
  // the last climb accelerates into the launch; the others ease in and out
  const e = i === k.length - 2 ? u * u * (1.6 - 0.6 * u) : smoothstep(u);
  return r0 + (r1 - r0) * e;
}

/**
 * The throttle pedal during the rev sequence (0 up … 1 floored): each press goes
 * down quickly (0.16 s), is held a moment, and comes most of the way back up;
 * the fourth stays down into the launch.
 */
export function revPedal(t: number) {
  if (t < 0) return 0;
  const i = Math.min(3, Math.floor(t));
  const u = t - i;
  const down = smoothstep(clamp(u / 0.16, 0, 1));
  if (i === 3) return down;
  const up = smoothstep(clamp((u - 0.42) / 0.42, 0, 1));
  return down * (1 - 0.88 * up);
}
/**
 * The launch's sound and its gear changes, on one clock. The gear-shift
 * recording is started 3.00 s into the file at the moment of the launch, and
 * the gear changes heard in it (at 4.30, 7.30 and 10.45 s of the file) fall
 * at these times after the launch: the instrument cluster changes gear at
 * exactly these times, read from the same launch clock (seconds since the
 * launch, which is also the scroll position the launch plays).
 */
export const SHIFT_AUDIO_OFFSET = 3.0;
export const SHIFTS_IN_RECORDING = [4.3, 7.3, 10.45];
export const SHIFT_TIMES = SHIFTS_IN_RECORDING.map((t) => +(t - SHIFT_AUDIO_OFFSET).toFixed(3)); // 1.30, 4.30, 7.45

/**
 * Seconds of the launch (REV → LAUNCH_END) when it plays by itself: off the
 * line and up through three gear changes (the last at 7.45 s), the rush of
 * speed in the last two seconds, then the chapter transition.
 */
export const LAUNCH_SECONDS = 8.6;
/** When the rush builds (s into the launch). */
const RUSH_FROM = 6.6;

export const getaway = {
  /** Live engine speed while you rev (rpm). */
  rpm: 0,
  /** D (or a press on the prompt) is down. */
  held: false,
  /** When the rev sequence started (performance.now()), or -1. */
  revStart: -1,
  /** The throttle pedal, 0 up … 1 floored (for the car's own pedal and the prompt). */
  pedal: 0,
  /** Waiting at the rev gate for you. */
  armed: false,
  /** The car has launched (on this pass through the episode). */
  launched: false,
  /** The gear the cluster shows (0 parked; 1–4 on the launch). */
  gear: 0,
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
 * Road speed (m/s) t seconds into the launch: a hard launch that eases as the
 * gears go up (about 11 m/s² off the line, 150 km/h by the end), and a little
 * more in the rush.
 */
function speedAt(t: number) {
  const rush = smoothstep(clamp((t - RUSH_FROM) / 2, 0, 1));
  return 48 * (1 - Math.exp(-t / 4.4)) + 9 * rush;
}
/** Distance travelled by t (m), integrated once into a table. */
const STEP = 0.01;
const DIST: number[] = [0];
for (let i = 1; i * STEP <= LAUNCH_SECONDS * 1.3; i++) DIST.push(DIST[i - 1] + ((speedAt((i - 1) * STEP) + speedAt(i * STEP)) / 2) * STEP);
const distanceAt = (t: number) => {
  const i = Math.min(DIST.length - 2, Math.floor(t / STEP));
  return DIST[i] + (DIST[i + 1] - DIST[i]) * (t / STEP - i);
};

/** The gear at t seconds into the launch (1 off the line, up one at each SHIFT_TIMES). */
export const gearAt = (t: number) => 1 + SHIFT_TIMES.filter((s) => t >= s).length;

/**
 * Engine rpm t seconds into the launch, for the tachometer: the clutch takes
 * up at the 6,000 you launched at; in each gear the revs climb to about 6,300;
 * at each gear change the needle drops to about 4,200 in 0.18 s and climbs
 * again.
 */
function rpmAt(t: number) {
  const g = gearAt(t);
  const from = g === 1 ? 0 : SHIFT_TIMES[g - 2];
  const to = g <= SHIFT_TIMES.length ? SHIFT_TIMES[g - 1] : LAUNCH_SECONDS * 1.25;
  const since = t - from;
  if (g === 1) return 6000 + 300 * clamp(since / to, 0, 1);
  const top = g > SHIFT_TIMES.length ? 5800 : 6300;
  const climb = 4200 + (top - 4200) * Math.pow(clamp(since / (to - from), 0, 1), 0.8);
  // the drop itself: from the previous gear's top down to 4,200
  const drop = smoothstep(clamp(since / 0.18, 0, 1));
  return 6300 + (climb - 6300) * drop;
}

/**
 * The launch at a local progress: seconds into it, distance from the kerb
 * along its route (m), road speed (m/s, for the speedometer), the rpm (for the
 * tachometer), the gear, and the rush (0..1, the speed effect at its end).
 * Before the launch (or without one) the car stands where it was parked.
 */
export function launchAt(local: number) {
  if (!getaway.launched || local <= CAR_BEAT.rev) return { t: 0, s: 0, v: 0, rpm: -1, gear: 0, rush: 0 };
  const u = clamp((local - CAR_BEAT.rev) / (CAR_BEAT.launchEnd - CAR_BEAT.rev), 0, 1.25);
  const t = u * LAUNCH_SECONDS;
  return { t, s: distanceAt(t), v: speedAt(t), rpm: rpmAt(t), gear: gearAt(t), rush: smoothstep(clamp((t - RUSH_FROM) / 1.6, 0, 1)) };
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
 * D down / up (or a press on the prompt). The key is remembered even before the
 * story waits for it, so holding D while you sit down starts the revs as soon
 * as the engine is ready; it only counts while the rev phase is armed. Only the
 * first press starts the sequence (updateGetaway); repeats do nothing.
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
 * chapter transition to the next chapter. It runs on the wall clock and needs
 * nothing from the visitor; the sound is only a listener to it.
 */
function launch() {
  getaway.launched = true;
  getaway.armed = false;
  getaway.revStart = -1;
  releaseAll();
  gate.open = true;
  story.setState({ prompt: null });
  const from = globalProgress('car', CAR_BEAT.rev);
  const end = globalProgress('car', CAR_BEAT.launchEnd);
  // on into the chapter transition that follows the launch: once the progress enters it, the
  // transition (ui/chapterTransition.ts) cuts to the next chapter by itself
  const turn = pageTurnFrom(end);
  const to = turn ? turn.from + 0.0002 : globalProgress('car', 1);
  playProgress(from, to, (LAUNCH_SECONDS * (to - from)) / (end - from), true);
  // and its sound, on the same clock (started now; if a recording is not decoded yet, it is
  // started on a later frame, further into the file by however late it is)
  sound.launchPending = true;
  sound.launchAt = performance.now();
  quietly(() => {
    if (audio.launchStart(SHIFT_AUDIO_OFFSET)) sound.launchPending = false;
  });
}

/** The getaway's sound state: what has been started, so nothing starts twice. */
const sound = { launchPending: false, launchAt: 0 };

/** Forget a launch (scrolled back out of the car, or left the episode backwards). */
export function resetGetaway() {
  getaway.launched = false;
  getaway.armed = false;
  releaseAll();
  gate.open = false;
  getaway.revStart = -1;
  getaway.pedal = 0;
  sound.launchPending = false;
  quietly(() => audio.carStop(0.3));
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
  getaway.gear = launch_.gear;
  // scrolled back off the seat before the sequence finished: it is cancelled, and the next press starts it again
  if (getaway.revStart >= 0 && !getaway.armed && !getaway.launched) {
    getaway.revStart = -1;
    quietly(() => audio.revStop(0.25));
  }
  // the first press of D (while the story waits for it) starts the one rev sequence
  if (getaway.held && getaway.revStart < 0 && !getaway.launched && ignited) {
    getaway.revStart = performance.now();
    quietly(() => audio.revSequence());
  }
  if (launch_.rpm >= 0) {
    getaway.rpm = launch_.rpm;
    getaway.pedal = 1;
  } else if (!ignited) {
    // engine off: the needle falls back to zero
    getaway.rpm = Math.max(0, getaway.rpm - dt * 4000);
    getaway.pedal = 0;
  } else if (getaway.revStart >= 0) {
    // the sequence: rpm and pedal from its own clock; at 4 s, 6,000 rpm and the launch, once
    const t = (performance.now() - getaway.revStart) / 1000;
    getaway.rpm = revRpm(t);
    getaway.pedal = revPedal(t);
    if (t >= REV_SEQUENCE.seconds && getaway.armed) launch();
  } else {
    // waiting (or just started): settle to idle; the starter brings it up from zero
    const target = IDLE_RPM;
    getaway.rpm = getaway.rpm < target ? Math.min(target, getaway.rpm + dt * 1600) : target + (getaway.rpm - target) * Math.exp(-dt * 2.2);
    getaway.pedal = 0;
  }
  // the launch's recordings, if they could not start at the launch itself (not decoded yet):
  // only while the launch is still playing, and further into the file by the delay
  if (sound.launchPending) {
    const late = (performance.now() - sound.launchAt) / 1000;
    if (!autoplay.active || late > SHIFT_TIMES[SHIFT_TIMES.length - 1]) sound.launchPending = false;
    else quietly(() => {
      if (audio.launchStart(SHIFT_AUDIO_OFFSET, late)) sound.launchPending = false;
    });
  }
  // the idle: the engine-default recording, once the start recording has played through, whenever
  // the engine is on and the revs are not up; it steps aside for the rev sequence and the launch.
  // The synthesised engine only stands in if that recording is not there.
  const idling = ignited && getaway.revStart < 0 && !audio.revving && !audio.launching && launch_.rpm < 0;
  quietly(() => {
    if (!ignited) audio.engineOff();
    else audio.idle(idling);
    const synth = !audio.hasIdle && ignited && !audio.revving && !audio.launching;
    audio.engine(synth ? getaway.rpm : 0, launch_.rpm >= 0 || getaway.revStart >= 0 ? 1 : 0.15);
  });
  // sound follows all of this; none of it can hold the story up
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
  // the scene is over (the page has turned, or you went back to the city): everything fades out
  sound.launchPending = false;
  getaway.revStart = -1;
  quietly(() => {
    audio.engine(0, 0);
    audio.engineOff();
    audio.carStop(0.8);
  });
}
