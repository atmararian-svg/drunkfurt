import { clamp, damp } from './math';

/**
 * The scroll timeline. The page is a tall scroll container; scroll position
 * maps to one global progress value, which is split into episodes. Each episode
 * owns a span of the scroll (measured in viewport heights) and receives its own
 * local progress 0..1. Nothing here touches React: the canvas reads it every
 * frame and the UI subscribes to coarse changes through the story store.
 */
export type EpisodeId = 'station' | 'city' | 'confrontation' | 'car' | 'home';

export interface EpisodeSpan {
  id: EpisodeId;
  /** Scroll length in viewport heights. */
  length: number;
  /**
   * Picks up the previous episode's last shot without a page turn: no ink
   * closes over the previous episode's end or opens over this one's start.
   */
  seamless?: boolean;
  /**
   * Where the episode starts again (local progress) when the visitor goes back
   * into it from the next one: the page turn back does not land on its last
   * shot but cuts, under the ink, to this point. Without it, going back lands
   * on the episode's end.
   */
  reentry?: number;
}

/** Built episodes, in order. Add the next ones here as they are made. */
export const EPISODE_SPANS: EpisodeSpan[] = [
  { id: 'station', length: 9 },
  { id: 'city', length: 11 },
  // back from the room, the getaway starts again from the seat (CAR_BEAT.seated), not after the launch
  { id: 'car', length: 8, seamless: true, reentry: 0.6 },
  { id: 'home', length: 7 },
];
/** Scroll after the last episode, for the "to be continued" card. */
export const OUTRO_LENGTH = 1.2;

export const TOTAL_LENGTH = EPISODE_SPANS.reduce((a, e) => a + e.length, 0) + OUTRO_LENGTH;

export const timeline = {
  /** Raw progress from the scroll position (0..1 across the whole page). */
  target: 0,
  /** Damped progress the scene renders with. */
  progress: 0,
  /** Damped progress velocity (per second), used for footstep bob etc. */
  velocity: 0,
};

/** Where an episode starts and ends in global progress. */
export function episodeRange(id: EpisodeId) {
  let start = 0;
  for (const e of EPISODE_SPANS) {
    const len = e.length / TOTAL_LENGTH;
    if (e.id === id) return { start, end: start + len };
    start += len;
  }
  return { start: 1, end: 1 };
}

export function locate(p: number): { id: EpisodeId | 'outro'; local: number } {
  let start = 0;
  for (const e of EPISODE_SPANS) {
    const len = e.length / TOTAL_LENGTH;
    if (p < start + len) return { id: e.id, local: clamp((p - start) / len, 0, 1) };
    start += len;
  }
  return { id: 'outro', local: clamp((p - start) / (1 - start || 1), 0, 1) };
}

/** Local progress of a given episode, clamped (0 before it, 1 after it). */
export function localProgress(id: EpisodeId, p = timeline.progress) {
  const r = episodeRange(id);
  return clamp((p - r.start) / (r.end - r.start), 0, 1);
}

/**
 * A scripted move of the progress: a beat that plays by itself (the fight after
 * the visitor's decision). While it runs, progress follows the script exactly,
 * without smoothing, and the page scroll is kept in step, so everything
 * downstream still reads the one progress value. Wall-clock timed, so a slow
 * frame rate cannot stretch it. Any input from the visitor stops it where it is.
 */
export const autoplay = { active: false, from: 0, to: 0, seconds: 1, start: 0, locked: false, then: null as number | null };
/** When the last cut happened (performance.now()): a jump under closed ink, which the overlay then opens. */
export const cut = { at: -1e9 };
/**
 * After a locked move ends, the page holds its final position for a moment
 * (performance.now() until which it does), so a scroll already in flight
 * (a trackpad's inertia from a flick begun before it) cannot drag the story
 * back off it.
 */
let holdUntil = 0;

/** A cinematic that is not a progress move (episode 4's way into the screen) holds the page where it is. */
let pinned = false;
export function pinScroll(on: boolean) {
  pinned = on;
}

/** A locked move owns the scroll (while it plays, and for a moment after): the visitor's scrolling is swallowed. */
export const scriptOwnsScroll = () => pinned || (autoplay.active && autoplay.locked) || (!autoplay.active && performance.now() < holdUntil);

/** `locked`: the visitor's scrolling does not stop it (a page turn always completes). */
/** `then`: when it arrives (under closed ink), cut straight to this progress. */
export function playProgress(from: number, to: number, seconds: number, locked = false, then: number | null = null) {
  Object.assign(autoplay, { active: true, from, to, seconds, start: performance.now(), locked, then });
}

/** Stops a scripted move, unless it is a page turn. */
export function stopAutoplay(force = false) {
  if (autoplay.locked && !force) return;
  if (force) holdUntil = 0;
  autoplay.active = false;
  autoplay.locked = false;
  autoplay.then = null;
}

/**
 * Page turns between episodes, in global progress: the ink closes over the end
 * of one episode, the next title shows, the ink opens on the next. They play by
 * themselves: once the progress enters one, it is carried through to the far
 * side in the direction the visitor was going (to the next episode going
 * forward, back to the last shot going back), and scrolling cannot stop it
 * halfway.
 */
interface PageTurn {
  from: number;
  to: number;
  seconds: number;
  /** Going back: where the ink is fully closed (between the two episodes), and where to cut to from there. */
  back?: { at: number; to: number };
}
let turns: PageTurn[] | null = null;
function pageTurns(): PageTurn[] {
  if (turns) return turns;
  turns = [];
  let start = 0;
  EPISODE_SPANS.forEach((e, i) => {
    const len = e.length / TOTAL_LENGTH;
    const next = start + len;
    const last = i === EPISODE_SPANS.length - 1;
    // where the ink starts to close (as in the overlay), and where it has opened on the next shot
    if (!last && EPISODE_SPANS[i + 1].seamless) {
      // the next episode continues this one's shot: no page to turn
      start = next;
      return;
    }
    const close = start + len * (e.id === 'city' ? 0.978 : 0.955);
    const open = last ? next + (1 - next) * 0.2 : next + (EPISODE_SPANS[i + 1].length / TOTAL_LENGTH) * 0.12;
    const reentry = e.reentry;
    turns!.push({ from: close, to: open, seconds: last ? 2.2 : 3.4, back: reentry !== undefined && !last ? { at: next, to: start + len * reentry } : undefined });
    start = next;
  });
  return turns;
}

/** The page turn that starts at (or first after) a global progress, if any. */
export function pageTurnFrom(p: number) {
  return pageTurns().find((z) => z.from >= p - 1e-6) ?? null;
}

/** Starts a page turn if the progress has just moved into one. */
function turnPage() {
  const p = timeline.progress;
  for (const z of pageTurns()) {
    if (p <= z.from || p >= z.to) continue;
    // the way the visitor is going; standing still inside one (a jump), the nearer side
    const forward = timeline.target !== p ? timeline.target > p : p - z.from > z.to - p;
    if (forward && gateLimit() < z.to) return;
    // back into an episode that restarts from an earlier point: close the ink, then cut there
    const back = !forward && z.back && p > z.back.at ? z.back : null;
    const edge = forward ? z.to : back ? back.at : z.from;
    playProgress(p, edge, Math.max(0.35, (z.seconds * Math.abs(edge - p)) / (z.to - z.from)), true, back ? back.to : null);
    return;
  }
}

export function stepTimeline(dt: number) {
  const prev = timeline.progress;
  if (!autoplay.active) turnPage();
  if (autoplay.active) {
    const u = clamp((performance.now() - autoplay.start) / 1000 / autoplay.seconds, 0, 1);
    const p = autoplay.from + (autoplay.to - autoplay.from) * u;
    timeline.target = timeline.progress = p;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: p * max, behavior: 'auto' });
    if (u >= 1) {
      if (autoplay.then !== null) {
        // the cut: straight to the new point, under the ink (the overlay opens it again)
        const q = autoplay.then;
        timeline.target = timeline.progress = q;
        window.scrollTo({ top: q * max, behavior: 'auto' });
        cut.at = performance.now();
        autoplay.then = null;
      }
      if (autoplay.locked) holdUntil = performance.now() + 1000;
      autoplay.active = autoplay.locked = false;
    }
    timeline.velocity = damp(timeline.velocity, (p - prev) / Math.max(dt, 1e-4), 8, dt);
    return;
  }
  // heavy but responsive smoothing: scrolling feels like moving a camera dolly
  timeline.progress = damp(timeline.progress, timeline.target, 4.2, dt);
  if (Math.abs(timeline.progress - timeline.target) < 1e-5) timeline.progress = timeline.target;
  timeline.velocity = damp(timeline.velocity, (timeline.progress - prev) / Math.max(dt, 1e-4), 8, dt);
}

/** Scroll the page to a global progress value. */
export function scrollToProgress(p: number, smooth = true) {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: clamp(p, 0, 1) * max, behavior: smooth ? 'smooth' : 'auto' });
}

/**
 * Gates hold the story at a point until something happens there (an
 * interaction). While a gate is closed, scrolling further does not advance the
 * progress past it; opening it is permanent, so scrolling back and forth never
 * re-arms the moment.
 */
export interface Gate {
  episode: EpisodeId;
  /** Local progress of the episode where the story waits. */
  at: number;
  open: boolean;
}
export const gates: Gate[] = [];

export function globalProgress(id: EpisodeId, local: number) {
  const r = episodeRange(id);
  return r.start + (r.end - r.start) * local;
}

/** The furthest progress currently allowed by closed gates. */
export function gateLimit() {
  let limit = 1;
  for (const g of gates) if (!g.open) limit = Math.min(limit, globalProgress(g.episode, g.at));
  return limit;
}

export function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  // a locked move (and the moment after one) owns the position: put the page back on it
  if (scriptOwnsScroll()) {
    window.scrollTo({ top: timeline.target * max, behavior: 'auto' });
    return;
  }
  let raw = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  // a page turn ends exactly on its edge: the scroll position's rounding must not land back inside it
  for (const z of pageTurns()) for (const edge of [z.from, z.to]) if (Math.abs(raw - edge) < 0.0015) raw = edge;
  timeline.target = Math.min(raw, gateLimit());
}
