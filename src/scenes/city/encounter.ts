import { audio } from '../../audio/AudioDirector';
import { clamp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { BEAT, BLOCK } from './beats';
import { Gate, gates, globalProgress, localProgress, scrollToProgress } from '../../core/timeline';

/**
 * The encounter, as a small state machine shared by the world and the UI:
 *
 *   approach → armed → impact → resolved
 *
 *  - approach: the stranger's walk is driven by scroll; time slows towards the gate.
 *  - armed:    the story waits at the gate (scroll cannot pass); DEFEND is shown.
 *  - impact:   the click landed; the comic strike plays (about a second).
 *  - resolved: the gate is open for good and the camera moves on to the aftermath.
 *
 * Resolution is permanent, so scrolling back and forth never re-arms the prompt
 * or replays the strike. Nothing waits on an animation: the click resolves the
 * gate immediately, and the move to the aftermath is scheduled on a timer.
 */
export type EncounterState = 'approach' | 'armed' | 'impact' | 'resolved';

export { BEAT, BLOCK } from './beats';

export const encounter = {
  state: 'approach' as EncounterState,
  /** performance.now() of the strike, for the overlay. */
  impactAt: 0,
  /** The punch, 0 (wound up) … 1 (fist at your guard). Advances in slow motion while armed. */
  punch: 0,
  /** Camera shake, decays by itself. */
  shake: 0,
  /** Stranger's position (written by the stranger each frame, read by the camera). */
  stranger: { x: 0, z: 0 },
  /** His right fist (knuckles), world space, for checks and feedback. */
  fist: { x: 0, y: 0, z: 0 },
};

const gate: Gate = { episode: 'city', at: BEAT.gate, open: false };
gates.push(gate);

/**
 * Time scale of the city. Normal speed through the approach and the stand-off;
 * the moment he commits to the punch, everything drops to a tenth.
 */
export function cityTimeScale(local: number) {
  if (encounter.state === 'resolved' && local >= BEAT.cut) return 0.35; // the hush afterwards
  if (encounter.state === 'impact' || encounter.state === 'armed') return 0.1;
  const s = smoothstep(clamp((local - BEAT.commit) / (BEAT.gate - BEAT.commit), 0, 1));
  return 1 - 0.9 * s;
}

/** Dev inspection: pin the block sequence at a time (seconds) to look at single frames. */
export const debug = { blockT: -1 };

/** Seconds since the click, or -1. */
export const blockTime = () => debug.blockT >= 0 ? debug.blockT : (encounter.impactAt > 0 && encounter.state !== 'approach' && encounter.state !== 'armed' ? (performance.now() - encounter.impactAt) / 1000 : -1);

/** Called every frame by the city world. `dt` is already scaled by cityTimeScale. */
export function updateEncounter(dt: number) {
  const local = localProgress('city');
  if (encounter.state === 'approach' && local >= BEAT.gate - 0.002) {
    encounter.state = 'armed';
    story.setState({ prompt: 'defend' });
  } else if (encounter.state === 'armed' && local < BEAT.gate - 0.02) {
    // the visitor scrolled back before acting: the moment is not over, just postponed
    encounter.state = 'approach';
    story.setState({ prompt: null });
  }
  // the punch: the first few percent come with the scroll, then it keeps coming at a tenth of real speed
  // (a full punch takes ~0.3 s, so ~3 s here), and stops just short of you if you never react
  const scrolled = 0.12 * clamp((local - BEAT.commit) / (BEAT.gate - BEAT.commit), 0, 1);
  if (encounter.state === 'armed') encounter.punch = Math.min(0.82, Math.max(encounter.punch, scrolled) + dt * 0.1 * 3.2 * (1 - encounter.punch * 0.6));
  else if (encounter.state === 'approach') encounter.punch = scrolled;
  encounter.shake = Math.max(0, encounter.shake - dt * 3.5);
  if (encounter.state === 'impact' && debug.blockT < 0 && performance.now() - encounter.impactAt > BLOCK.resolve * 1000 + 400) resolve();
}

/** The visitor's click. Returns whether it did anything. */
export function defend() {
  if (encounter.state !== 'armed') return false;
  encounter.state = 'impact';
  encounter.impactAt = performance.now();
  gate.open = true;
  story.setState({ prompt: null });
  audio.unlock();
  // you raise your guard with a grunt; his fist meets your forearm; you answer with a straight right
  audio.fight('exhale1');
  window.setTimeout(() => {
    audio.fight('block');
    encounter.shake = 1;
  }, BLOCK.contact * 1000);
  window.setTimeout(() => audio.fight('exhale2'), (BLOCK.counter - 0.04) * 1000);
  window.setTimeout(() => {
    audio.fight('punch');
    encounter.shake = 0.7;
  }, BLOCK.counterLands * 1000);
  window.setTimeout(resolve, BLOCK.resolve * 1000);
  return true;
}

function resolve() {
  if (encounter.state !== 'impact') return;
  encounter.state = 'resolved';
  scrollToProgress(globalProgress('city', BEAT.aftermath + 0.045));
}
