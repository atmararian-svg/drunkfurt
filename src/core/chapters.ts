import type { EpisodeId } from './timeline';

/**
 * The story's chapters, as the visitor sees them: what the preloader loads,
 * what the title cards announce, what going back restarts. A chapter is one
 * or more episodes (the getaway plays on in chapter 2's street, seamlessly,
 * after the encounter). Titles and metadata are the title-card design's
 * (Figma "Drunkfurt": Chapter-1, Chapter-2, Chapter-3).
 */
export interface Chapter {
  number: 1 | 2 | 3;
  episodes: EpisodeId[];
  title: string;
  place: string;
  time: string;
}

export const CHAPTERS: Chapter[] = [
  { number: 1, episodes: ['station'], title: 'The Arrival', place: 'Main train station', time: '23:47' },
  { number: 2, episodes: ['city', 'car'], title: 'No Welcome', place: 'Outside Frankfurt (Main) Station', time: '23:59' },
  { number: 3, episodes: ['home'], title: 'The Cave', place: 'The back room', time: '00:32' },
];

export function chapterOf(id: EpisodeId | 'outro'): Chapter {
  if (id === 'outro') return CHAPTERS[CHAPTERS.length - 1];
  return CHAPTERS.find((c) => c.episodes.includes(id)) ?? CHAPTERS[0];
}

/**
 * How far each chapter is: false while loading, true when ready, 'failed' when
 * it could not be loaded (the story still goes on as far as it can). Written by
 * the chapters' worlds (ChapterReady, the asset preloads), read by the
 * preloader. Changes are pushed to subscribers; nothing polls it per frame.
 */
export type Readiness = false | true | 'failed';
const state: Record<1 | 2 | 3, Readiness> = { 1: false, 2: false, 3: false };
const listeners = new Set<() => void>();

export const chapterReadiness = {
  get: (n: 1 | 2 | 3) => state[n],
  set(n: 1 | 2 | 3, r: Readiness) {
    if (state[n] === r || state[n] === true) return;
    state[n] = r;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
