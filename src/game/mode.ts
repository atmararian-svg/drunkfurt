/**
 * The game build (`npm run build:game`, Vite's mode "game"): the same story, walked instead of
 * scrolled. You are the hero in the first person: W A S D (or the arrows) to walk, the mouse to
 * look (the pointer is held by the page after a click), Shift to hurry; E for whatever there is to
 * do (defend, pick up and put away the letter, skip a line, open the car, rev, sit down, talk); M
 * for the sound. The scroll build is untouched: everything here is behind `GAME`.
 */
export const GAME = import.meta.env.MODE === 'game';

/** The key for the story's one action: D on the scroll page, E in the game (where D is a step to the right). */
export const ACTION_KEY = GAME ? 'E' : 'D';
export const ACTION_CODE = GAME ? 'KeyE' : 'KeyD';
/** The sound switch's key: S on the scroll page, M in the game (S walks back). */
export const SOUND_KEY = GAME ? 'M' : 'S';
export const SOUND_CODE = GAME ? 'KeyM' : 'KeyS';
