import { audio } from '../../audio/AudioDirector';
import { clamp, smoothstep } from '../../core/math';
import { story } from '../../core/store';
import { BEAT } from './beats';
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

export { BEAT } from './beats';

export const encounter = {
  state: 'approach' as EncounterState,
  /** performance.now() of the strike, for the overlay. */
  impactAt: 0,
  /** Extra metres the stranger creeps while the story waits at the gate. */
  creep: 0,
  /** Stranger's position (written by the stranger each frame, read by the camera). */
  stranger: { x: 0, z: 0 },
};

const gate: Gate = { episode: 'city', at: BEAT.gate, open: false };
gates.push(gate);

/** Time scale of the city: normal, then easing down to 10% as the stranger closes in. */
export function cityTimeScale(local: number) {
  if (encounter.state === 'resolved' && local >= BEAT.cut) return 0.35; // the hush afterwards
  if (encounter.state === 'impact') return 0.1;
  const s = smoothstep(clamp((local - BEAT.slowFrom) / (BEAT.gate - BEAT.slowFrom), 0, 1));
  return 1 - 0.9 * s;
}

/** Called every frame by the city world. */
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
  if (encounter.state === 'armed') encounter.creep = Math.min(1.1, encounter.creep + dt * 0.13);
  else if (encounter.state === 'approach') encounter.creep = Math.max(0, encounter.creep - dt * 0.5);
  if (encounter.state === 'impact' && performance.now() - encounter.impactAt > 1500) resolve();
}

/** The visitor's click. Returns whether it did anything. */
export function defend() {
  if (encounter.state !== 'armed') return false;
  encounter.state = 'impact';
  encounter.impactAt = performance.now();
  gate.open = true;
  story.setState({ prompt: null });
  audio.unlock();
  audio.impact(1);
  window.setTimeout(() => audio.impact(2), 230);
  window.setTimeout(resolve, 1100);
  return true;
}

function resolve() {
  if (encounter.state !== 'impact') return;
  encounter.state = 'resolved';
  scrollToProgress(globalProgress('city', BEAT.aftermath + 0.045));
}
