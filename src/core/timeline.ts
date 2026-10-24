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
}

/** Built episodes, in order. Add the next ones here as they are made. */
export const EPISODE_SPANS: EpisodeSpan[] = [
  { id: 'station', length: 9 },
  { id: 'city', length: 11 },
  { id: 'car', length: 8, seamless: true },
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
export const autoplay = { active: false, from: 0, to: 0, seconds: 1, start: 0, locked: false };
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
export function playProgress(from: number, to: number, seconds: number, locked = false) {
  Object.assign(autoplay, { active: true, from, to, seconds, start: performance.now(), locked });
}

/** After a cinematic that holds the page (a chapter transition), the page stays put a moment longer, as after a locked move. */
export function holdScroll(ms = 1000) {
  holdUntil = performance.now() + ms;
}

/** Puts the story at a progress at once: no smoothing, the page scrolled to it (a cut). */
export function jumpTo(p: number) {
  timeline.target = timeline.progress = p;
  timeline.velocity = 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: p * max, behavior: 'auto' });
}

/** Stops a scripted move, unless it is a page turn. */
export function stopAutoplay(force = false) {
  if (autoplay.locked && !force) return;
  if (force) holdUntil = 0;
  autoplay.active = false;
  autoplay.locked = false;
}

/**
 * Chapter transitions, in global progress. Each sits where one chapter ends
 * and the next begins (between two episodes that are not seamless): from the
 * last shot of one (`from`) to the opening shot of the next (`to`). The
 * progress never plays through one: as soon as it enters, the chapter
 * transition takes over (ui/chapterTransition.ts registers `onChapterTurn`).
 * Going forward it cuts to the next chapter's opening shot; going back it
 * restarts the previous chapter from its beginning (`back`), never from its
 * end.
 */
export interface PageTurn {
  from: number;
  to: number;
  /** Where the chapter this transition leads back into begins. */
  back: number;
}
let turns: PageTurn[] | null = null;
function pageTurns(): PageTurn[] {
  if (turns) return turns;
  turns = [];
  let start = 0;
  let chapterStart = 0;
  EPISODE_SPANS.forEach((e, i) => {
    const len = e.length / TOTAL_LENGTH;
    const next = start + len;
    const last = i === EPISODE_SPANS.length - 1;
    if (last || EPISODE_SPANS[i + 1].seamless) {
      // the next episode continues this one's shot (or nothing follows): the chapter goes on
      start = next;
      return;
    }
    // the last shot of this chapter, and the opening shot of the next one
    const close = start + len * (e.id === 'city' ? 0.978 : 0.955);
    const open = next + (EPISODE_SPANS[i + 1].length / TOTAL_LENGTH) * 0.12;
    turns!.push({ from: close, to: open, back: chapterStart });
    chapterStart = open;
    start = next;
  });
  return turns;
}

/** The chapter transition that starts at (or first after) a global progress, if any. */
export function pageTurnFrom(p: number) {
  return pageTurns().find((z) => z.from >= p - 1e-6) ?? null;
}

/** Where each chapter begins (global progress): its opening shot. */
export function chapterStarts() {
  return [0, ...pageTurns().map((z) => z.to)];
}

/**
 * Who carries out a chapter transition (registered by ui/chapterTransition.ts):
 * called once when the progress enters one, with the transition and the way
 * the visitor was going. While it is busy (`chapterTurn.busy`) nothing else
 * starts one.
 */
export const chapterTurn = {
  busy: false,
  run: null as ((z: PageTurn, forward: boolean) => void) | null,
};
/** The way the progress last moved (+1 forward, -1 back), for a transition entered from a standstill. */
let lastDirection = 1;

/** Starts a chapter transition if the progress has just moved into one. */
function turnPage() {
  if (chapterTurn.busy || !chapterTurn.run) return;
  const p = timeline.progress;
  for (const z of pageTurns()) {
    if (p <= z.from || p >= z.to) continue;
    // the way the visitor is going; a target a hair from the progress (scroll rounding) is no direction,
    // and then the way the progress was last moving decides (into a transition the launch carried it to)
    const forward = Math.abs(timeline.target - p) > 0.002 ? timeline.target > p : lastDirection > 0;
    if (forward && gateLimit() < z.to) return;
    chapterTurn.run(z, forward);
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
      if (autoplay.locked) holdUntil = performance.now() + 1000;
      autoplay.active = autoplay.locked = false;
    }
    if (p !== prev) lastDirection = p > prev ? 1 : -1;
    timeline.velocity = damp(timeline.velocity, (p - prev) / Math.max(dt, 1e-4), 8, dt);
    return;
  }
  // heavy but responsive smoothing: scrolling feels like moving a camera dolly
  timeline.progress = damp(timeline.progress, timeline.target, 4.2, dt);
  if (Math.abs(timeline.progress - timeline.target) < 1e-5) timeline.progress = timeline.target;
  if (timeline.progress !== prev) lastDirection = timeline.progress > prev ? 1 : -1;
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
  // a chapter starts exactly on its opening shot: the scroll position's rounding (a fraction of a
  // pixel below it) must not land back inside the transition and turn the chapter back. Only that
  // edge: snapping to where a transition begins would make one entered going forward look backward.
  for (const z of pageTurns()) if (raw < z.to && z.to - raw < 0.0015) raw = z.to;
  timeline.target = Math.min(raw, gateLimit());
}
