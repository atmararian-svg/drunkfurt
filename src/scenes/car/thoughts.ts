import { story } from '../../core/store';
import { Gate, gates, localProgress, readScroll } from '../../core/timeline';
import { CAR_BEAT } from './getaway';

/**
 * The thoughts in the car. Once you are in and the door has shut, the story
 * waits (a gate just after CAR_BEAT.doorClosed, before the ignition) while
 * they are typed at the bottom of the page, line by line (the overlay plays
 * them with the supplied typewriter); when the last line is in and has stood
 * a moment, the gate opens: the engine starts and the rev prompt follows.
 *
 * Scrolling back out of the seat forgets them (they play again next time),
 * as does the chapter starting again (`resetThoughts`, with the getaway).
 */
export const THOUGHTS = {
  /** Where the story waits (car local progress): the door is shut, the engine not yet on. */
  gate: CAR_BEAT.doorClosed + 0.002,
  /** Shown from here… */
  from: CAR_BEAT.doorClosed - 0.002,
  /** …until the rev prompt is near. */
  to: CAR_BEAT.rev - 0.005,
  /** After the last line is typed, it stands this long before the engine (ms). */
  hold: 1300,
};

export const MONOLOGUE = [
  "This can't keep happening.",
  "Good businesses shouldn't struggle to show their worth.",
  'There has to be a better way.',
  "It's time the world saw what I've built.",
].join('\n');

export const thoughts = { started: false, done: false };

const gate: Gate = { episode: 'car', at: THOUGHTS.gate, open: false };
gates.push(gate);
let holdTimer = 0;

/** Whether the thoughts are on screen at this point of the scroll. */
export const thoughtsShown = (local = localProgress('car')) => local >= THOUGHTS.from && local < THOUGHTS.to;

/** Called every frame by the overlay while the car episode is on. Returns whether they should be playing. */
export function updateThoughts() {
  const local = localProgress('car');
  if (local < THOUGHTS.from - 0.01 && (thoughts.started || thoughts.done)) resetThoughts();
  gate.open = thoughts.done;
  const waiting = !gate.open && local >= THOUGHTS.gate - 0.003;
  const now = story.getState().prompt;
  if (waiting && now === null) story.setState({ prompt: 'thought' });
  if (!waiting && now === 'thought') story.setState({ prompt: null });
  return thoughtsShown(local);
}

/** The last line is typed: after a moment, the story goes on. */
export function thoughtsTyped() {
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    thoughts.done = true;
    gate.open = true;
    // the page may already be scrolled past the wait: carry on from where it is, without another scroll
    readScroll();
  }, THOUGHTS.hold);
}

export function resetThoughts() {
  window.clearTimeout(holdTimer);
  thoughts.started = false;
  thoughts.done = false;
  gate.open = false;
  if (story.getState().prompt === 'thought') story.setState({ prompt: null });
}
