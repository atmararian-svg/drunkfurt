import { useSyncExternalStore } from 'react';
import type { EpisodeId } from './timeline';

/**
 * Coarse story state for the UI. Scroll progress itself lives in core/timeline
 * and is read per frame; only changes worth a re-render go through here.
 */
export interface StoryState {
  phase: 'loading' | 'ready';
  episode: EpisodeId | 'outro';
}

type Listener = () => void;

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState(partial: Partial<T>) {
      const next = { ...state, ...partial };
      if (Object.keys(partial).every((k) => state[k as keyof T] === next[k as keyof T])) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const story = createStore<StoryState>({ phase: 'loading', episode: 'station' });

export function useStory<S>(selector: (s: StoryState) => S): S {
  return useSyncExternalStore(story.subscribe, () => selector(story.getState()));
}
