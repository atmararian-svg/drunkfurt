import { story } from '../../core/store';
import { Gate, gates, globalProgress, localProgress, playProgress, timeline } from '../../core/timeline';
import { CAR_BEAT } from './getaway';

/**
 * The thoughts in the car. Once you are in and the door has shut, the story
 * waits (a gate just after CAR_BEAT.doorClosed, before the ignition) while
 * they are typed at the bottom of the page, line by line (the overlay plays
 * them with the supplied typewriter); when the last line is in and has stood
 * a moment, it is erased (the typewriter's own deleting), the gate opens and
 * the story carries itself on to the rev point, no scroll needed: the engine
 * catches on the way and ACTION / PRESS D TO REV comes up there, waiting for D
 * (it only shows; the engine revs when you press).
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
  "Good businesses shouldn't have to struggle because they can't show the world what they're worth.",
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

/** Bumped whenever the thoughts are reset, so a finish already under way is dropped. */
let round = 0;

/**
 * The last line is typed: after a moment it is erased (`erase`, the
 * typewriter's), and then the story goes on by itself to where it waits for
 * you to rev (the rev prompt comes up there). Once per pass.
 */
export function thoughtsTyped(erase: () => Promise<void>) {
  window.clearTimeout(holdTimer);
  const mine = ++round;
  holdTimer = window.setTimeout(async () => {
    await erase();
    if (mine !== round || thoughts.done) return;
    thoughts.done = true;
    gate.open = true;
    // from wherever the page is, on to the rev point (no further): the gate there holds it for D
    const to = globalProgress('car', CAR_BEAT.rev);
    if (timeline.progress < to) playProgress(timeline.progress, to, 1.1);
  }, THOUGHTS.hold);
}

/** SKIP DIALOGUE: the thoughts are over at once (the overlay clears them), and the story goes on to the rev point. */
export function skipThoughts() {
  if (thoughts.done) return;
  window.clearTimeout(holdTimer);
  round++;
  thoughts.done = true;
  gate.open = true;
  const to = globalProgress('car', CAR_BEAT.rev);
  if (timeline.progress < to) playProgress(timeline.progress, to, 1.1);
}

export function resetThoughts() {
  window.clearTimeout(holdTimer);
  round++;
  thoughts.started = false;
  thoughts.done = false;
  gate.open = false;
  if (story.getState().prompt === 'thought') story.setState({ prompt: null });
}
