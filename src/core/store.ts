import { useSyncExternalStore } from 'react';

/**
 * Narrative state. Scenes are independent chapters; each has its own phases.
 * Only coarse state lives here (it drives UI). Per-frame values never go through React.
 */
export type SceneId = 'station'; // later: 'city' | 'confrontation' | 'car' | 'home'

export type StationPhase =
  | 'loading' // shaders compiling, nothing interactive yet
  | 'arrival' // standing in the train doorway, prompt visible
  | 'stepping-out' // scripted camera move, input ignored
  | 'platform'; // free first-person exploration

export interface StoryState {
  scene: SceneId;
  phase: StationPhase;
  pointerLocked: boolean;
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

export const story = createStore<StoryState>({
  scene: 'station',
  phase: 'loading',
  pointerLocked: false,
});

export function useStory<S>(selector: (s: StoryState) => S): S {
  return useSyncExternalStore(story.subscribe, () => selector(story.getState()));
}
