import { CHAPTERS, chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { PageTurn, chapterTurn, holdScroll, jumpTo, locate, pinScroll, timeline } from '../core/timeline';
import { EPISODES } from '../episodes';
import { grabFrame } from '../render/FrameGrab';
import { pixelReveal } from './pixelReveal';
import { hideTitleCard, showTitleCard } from './titleCards';

/**
 * Moving between chapters. When the progress enters a chapter transition
 * (core/timeline), this takes over, once, and runs it to the end on the wall
 * clock:
 *
 *  1. the scroll is held where it is and the frame on screen is copied;
 *  2. the copy is laid over the page, the stage hidden under it;
 *  3. the chapter being entered is reset to its beginning (every episode's
 *     `reset`: the encounter, the getaway, the screen) and the progress cuts to
 *     its opening shot: the next chapter's going forward, the previous
 *     chapter's own beginning going back (never its end);
 *  4. once that chapter's world is on screen and has drawn a few frames, the
 *     pixel reveal (pixelReveal.ts) brings it in over the copy: coarse blocks
 *     scattered over it (drifting up the page going forward, down it going
 *     back), then finer, then the sharp page;
 *  5. the scroll is released and the chapter's title card plays.
 *
 * It cannot be interrupted or started twice (`chapterTurn.busy`); every step
 * has a time limit, so a world that is slow to appear cannot leave the page
 * covered.
 */
const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const tick = () => (--n <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => window.setTimeout(r, ms))]);

/** Puts a chapter's episodes back to their beginning. */
export function resetChapter(n: number) {
  const ch = CHAPTERS.find((c) => c.number === n);
  for (const id of ch?.episodes ?? []) {
    try {
      EPISODES[id]?.reset?.();
    } catch (err) {
      console.warn(`[chapters] could not reset ${id}`, err);
    }
  }
}

async function run(z: PageTurn, forward: boolean) {
  chapterTurn.busy = true;
  pinScroll(true);
  // stand still where we are while the frame is copied
  timeline.target = timeline.progress;
  hideTitleCard();
  const target = forward ? z.to : z.back;
  const dir = forward ? 'up' : 'down';
  const chapter = chapterOf(locate(target).id);
  let outgoing: HTMLCanvasElement | null = null;
  try {
    outgoing = (await within(grabFrame(), 600)) || null;
    if (outgoing) {
      outgoing.className = 'chapter-out';
      document.body.appendChild(outgoing);
    }
    resetChapter(chapter.number);
    jumpTo(target);
    // the chapter's world on screen, drawn a few times (its shaders compiled), or give up waiting after 4 s
    const id = locate(target).id;
    await within(
      (async () => {
        while (story.getState().episode !== id) await frames(1);
        await frames(4);
      })(),
      4000,
    );
    await pixelReveal(dir, { outgoing });
  } catch (err) {
    console.warn('[chapters] transition', err);
  } finally {
    outgoing?.remove();
    pinScroll(false);
    holdScroll(700);
    chapterTurn.busy = false;
  }
  showTitleCard(chapter.number);
}

/** Registers the chapter transition with the timeline (once, from the app). */
export function installChapterTransitions() {
  chapterTurn.run = (z, forward) => void run(z, forward);
  return () => {
    chapterTurn.run = null;
  };
}
