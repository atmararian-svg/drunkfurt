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
}

/** Built episodes, in order. Add the next ones here as they are made. */
export const EPISODE_SPANS: EpisodeSpan[] = [
  { id: 'station', length: 9 },
  { id: 'city', length: 11 },
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

export function stepTimeline(dt: number) {
  const prev = timeline.progress;
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
  const raw = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  timeline.target = Math.min(raw, gateLimit());
}
