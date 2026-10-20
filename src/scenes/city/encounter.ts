import { audio } from '../../audio/AudioDirector';
import { clamp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { BEAT, BLOCK, KO } from './beats';
import { Gate, autoplay, gates, globalProgress, localProgress, playProgress, timeline } from '../../core/timeline';

/**
 * The encounter. What you see is a function of the scroll progress and of one
 * remembered fact, the visitor's decision at the gate. Nothing else persists:
 * scroll back before he walks up and he is standing in his doorway again;
 * scroll back into the fight and it is reconstructed at that moment.
 *
 * Intervals (Episode 2 local progress, see beats.ts):
 *   strangerMoves → stop    he walks up
 *   stop → cock             he squares up and holds your eye
 *   cock → commit           he winds up
 *   commit → gate           the punch starts; time slows to a tenth
 *   gate                    DEFEND: the story waits for your click (the only
 *                           real-time part: his fist keeps coming while you wait)
 *   gate → aftermath        the outcome, mapped onto progress: blocked (guard,
 *                           counter, ink) or knocked out (hit, fall, darkness)
 *   aftermath → 1           afterwards: he is on the pavement, or gone
 *
 * Once decided, the page plays the outcome by moving the progress itself
 * (timeline autoplay) and the gate stays open. Sounds are cues fired as that
 * playback crosses them; they never feed back into what is drawn.
 */
export type Outcome = 'blocked' | 'knockedOut' | null;

export { BEAT, BLOCK, KO } from './beats';

export const encounter = {
  /** The visitor's decision. Set once, at the gate. */
  outcome: null as Outcome,
  /** How far his punch had come when the decision fell (0..1). */
  punchAtDecision: 0,
  /** The DEFEND window is open: the story waits at the gate. */
  armed: false,
  /** performance.now() when the window opened. */
  armedAt: 0,
  /** Stranger's position (written by the stranger each frame, read by the camera). */
  stranger: { x: 0, z: 0 },
  /** His right fist (knuckles), world space, for checks and feedback. */
  fist: { x: 0, y: 0, z: 0 },
};

const gate: Gate = { episode: 'city', at: BEAT.gate, open: false };
gates.push(gate);

/** Seconds of real time between the DEFEND prompt and his fist landing. */
const PUNCH_WINDOW = 3.7;
/** How far the punch comes with the scroll alone, before the gate. */
const SCROLLED_PUNCH = 0.12;

/** Length of the outcome, in seconds of playback, spread over gate → aftermath. */
export const sequenceSeconds = (o: Outcome) => (o === 'knockedOut' ? KO.resolve : BLOCK.resolve);

/** Seconds into the outcome at a local progress (unclamped above), or -1 before it / undecided. */
export function sequenceTime(local: number) {
  if (!encounter.outcome || local < BEAT.gate) return -1;
  return ((local - BEAT.gate) / (BEAT.aftermath - BEAT.gate)) * sequenceSeconds(encounter.outcome);
}

export interface EncounterView {
  outcome: Outcome;
  /** Seconds into the outcome, or -1. */
  t: number;
  /** His punch: 0 wound up … 1 at your guard (before the outcome takes over). */
  punch: number;
  /** Camera jolt, 0..1.4, from the contacts. */
  shake: number;
}

const pulse = (t: number, at: number, amp: number) => (t >= at ? amp * Math.exp(-(t - at) * 4.5) : 0);

/** Everything the world, the camera and the overlay need, at a local progress. */
export function encounterAt(local: number): EncounterView {
  const o = encounter.outcome;
  const t = sequenceTime(local);
  const u = clamp((local - BEAT.commit) / (BEAT.gate - BEAT.commit), 0, 1);
  let punch = (o ? encounter.punchAtDecision : SCROLLED_PUNCH) * u;
  if (!o && encounter.armed) punch = Math.min(1, SCROLLED_PUNCH + (performance.now() - encounter.armedAt) / 1000 / PUNCH_WINDOW);
  if (t >= 0) punch = local < BEAT.aftermath ? encounter.punchAtDecision : 0;
  let shake = 0;
  if (t >= 0 && o === 'blocked') shake = pulse(t, BLOCK.contact, 1) + pulse(t, BLOCK.counterLands, 0.7);
  if (t >= 0 && o === 'knockedOut') shake = pulse(t, 0.03, 1.4);
  return { outcome: o, t, punch, shake };
}

/**
 * Time scale of the city: normal through the approach and the stand-off, a
 * tenth from the commit through the fight, a hush afterwards.
 */
export function cityTimeScale(local: number) {
  if (encounter.armed) return 0.1;
  if (encounter.outcome && local >= BEAT.gate) return local >= BEAT.aftermath ? 0.35 : 0.1;
  const s = smoothstep(clamp((local - BEAT.commit) / (BEAT.gate - BEAT.commit), 0, 1));
  return 1 - 0.9 * s;
}

// --- sound cues of the outcome, fired as the playback crosses them (never on a scrub backwards)
interface Cue { at: number; kind: Parameters<typeof audio.fight>[0] }
const CUES: Record<'blocked' | 'knockedOut', Cue[]> = {
  blocked: [
    { at: 0, kind: 'exhale1' },
    { at: BLOCK.contact, kind: 'block' },
    { at: BLOCK.counter - 0.04, kind: 'exhale2' },
    { at: BLOCK.counterLands, kind: 'punch' },
  ],
  knockedOut: [
    { at: 0, kind: 'exhale2' },
    { at: 0.03, kind: 'ko' },
    { at: 0.16, kind: 'ring' },
    { at: KO.fallTo, kind: 'fall' },
  ],
};
let lastT = -1;

/** Called every frame by the city world. */
export function updateEncounter() {
  const local = localProgress('city');
  if (!encounter.outcome) {
    if (!encounter.armed && local >= BEAT.gate - 0.002) {
      encounter.armed = true;
      encounter.armedAt = performance.now();
      story.setState({ prompt: 'defend' });
    } else if (encounter.armed && local < BEAT.gate - 0.02) {
      // the visitor scrolled back before acting: the moment is not over, just postponed
      disarm();
    }
    if (encounter.armed && encounterAt(local).punch >= 1) decide('knockedOut');
  }
  // sound follows the playback forwards only, and only while the page plays it
  const t = sequenceTime(local);
  const prev = Math.max(lastT, -0.001);
  if (encounter.outcome && autoplay.active && t > prev && t - prev < 0.5) {
    for (const c of CUES[encounter.outcome]) if (c.at > prev && c.at <= t) audio.fight(c.kind);
  }
  lastT = t;
}

/** Leaving the episode, or scrolling back past the gate, hides a waiting prompt. */
export function disarm() {
  if (!encounter.armed) return;
  encounter.armed = false;
  story.setState({ prompt: null });
}

/** The visitor's click. Returns whether it did anything. */
export function defend() {
  if (!encounter.armed || encounter.outcome) return false;
  audio.unlock();
  decide('blocked');
  return true;
}

function decide(o: 'blocked' | 'knockedOut') {
  encounter.punchAtDecision = Math.min(1, encounterAt(localProgress('city')).punch);
  encounter.outcome = o;
  encounter.armed = false;
  gate.open = true;
  story.setState({ prompt: null });
  // play the outcome: from the gate through the aftermath's first frames, at the sequence's own speed
  const from = BEAT.gate;
  const to = BEAT.aftermath + 0.045;
  const seconds = sequenceSeconds(o) * ((to - from) / (BEAT.aftermath - from));
  lastT = -1;
  playProgress(globalProgress('city', from), globalProgress('city', to), seconds);
  timeline.target = timeline.progress = globalProgress('city', from);
}
