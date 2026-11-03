import { chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { locate, timeline } from '../core/timeline';

/**
 * Coming back after the graphics card gave out. A browser can take the page's WebGL away (the
 * card is reset, it runs out of memory, the driver times out a frame); when it does not hand it
 * back, the page reloads itself and comes back where the visitor was: the chapter they were in,
 * from its beginning, with the sound as they had it, and without asking again (the preloader
 * skips the sound choice). A second loss soon after does not reload again (the stub says so).
 */
const KEY = 'drunkfurt:resume';
/** A resume is used only this soon after it was written (ms). */
const FRESH = 60_000;
/** Two losses this close together: not again (ms). */
const AGAIN = 45_000;

interface Resume {
  chapter: number;
  sound: boolean;
  at: number;
}

const read = (): Resume | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Resume) : null;
  } catch {
    return null;
  }
};

/** Whether the page may reload itself now (it did not just do so). Saves where to come back to. */
export function saveResume() {
  const last = read();
  if (last && Date.now() - last.at < AGAIN) return false;
  try {
    const chapter = chapterOf(locate(timeline.progress).id).number;
    sessionStorage.setItem(KEY, JSON.stringify({ chapter, sound: story.getState().sound, at: Date.now() } satisfies Resume));
    return true;
  } catch {
    return false;
  }
}

/** The resume left by a reload a moment ago, if any (kept, so a loss right after it is not reloaded again). */
export function takeResume(): Resume | null {
  const r = read();
  if (!r || Date.now() - r.at > FRESH) return null;
  return r;
}
