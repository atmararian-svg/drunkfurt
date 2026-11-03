import { CHAPTERS, chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { PageTurn, chapterStarts, chapterTurn, gates, globalProgress, holdScroll, jumpTo, locate, pinScroll, stopAutoplay, timeline } from '../core/timeline';
import { EPISODES } from '../episodes';
import { grabFrame } from '../render/FrameGrab';
import { pixelReveal } from './pixelReveal';
import { hideTitleCard, showTitleCard } from './titleCards';

/**
 * Moving between chapters. When the progress enters a chapter transition
 * (core/timeline), this takes over, once, and runs it to the end on the wall
 * clock:
 *
 *  1. the scroll is held where it is; what is printed over the page (his face
 *     and thoughts, the system's tip) leaves through its own pixels first, and
 *     only then is the frame on screen copied;
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

/**
 * Puts a chapter's episodes back to their beginning. The waits of this chapter and every later
 * one count again (a chapter played from its beginning is played as it comes, whatever the
 * chapter selector skipped before).
 */
export function resetChapter(n: number) {
  const later = new Set(CHAPTERS.filter((c) => c.number >= n).flatMap((c) => c.episodes as string[]));
  for (const g of gates) if (later.has(g.episode)) g.passed = false;
  const ch = CHAPTERS.find((c) => c.number === n);
  for (const id of ch?.episodes ?? []) {
    try {
      EPISODES[id]?.reset?.();
    } catch (err) {
      console.warn(`[chapters] could not reset ${id}`, err);
    }
  }
}

/** Resolves once the text boxes (his face and thoughts, the tip) and the captions are off the page. */
async function printedGone() {
  const showing = () =>
    [...document.querySelectorAll<HTMLElement>('.hero-face, .hero-box, .tip')].some((el) => getComputedStyle(el).visibility !== 'hidden') ||
    [...document.querySelectorAll<HTMLElement>('.caption')].some((el) => parseFloat(getComputedStyle(el).opacity) > 0.02);
  if (!showing()) return;
  while (showing()) await frames(1);
  // a beat of the plain page before the scene itself turns
  await frames(6);
}

function run(z: PageTurn, forward: boolean) {
  return turnTo(forward ? z.to : z.back, forward);
}

/**
 * Goes to a chapter's opening shot from anywhere (the chapter rail): the same
 * transition, forwards or back. Going forwards past chapters not yet played,
 * their waits are passed (their gates opened), so the scroll can stand at the
 * new chapter; going back into a chapter resets it, as scrolling back does.
 * The chapter you are in starts again from its beginning.
 */
export function goToChapter(n: number) {
  if (chapterTurn.busy) return;
  const target = chapterStarts()[n - 1];
  if (target === undefined) return;
  const forward = target > timeline.progress + 1e-4;
  // the waits on the way there are passed for good: an episode that is not on screen cannot open
  // its own (a letter not read, say), and must not pull the page back to it
  if (forward) for (const g of gates) if (globalProgress(g.episode, g.at) < target) (g.open = true), (g.passed = true);
  void turnTo(target, forward);
}

async function turnTo(target: number, forward: boolean) {
  chapterTurn.busy = true;
  stopAutoplay(true);
  pinScroll(true);
  // stand still where we are while the frame is copied
  timeline.target = timeline.progress;
  hideTitleCard();
  const dir = forward ? 'up' : 'down';
  const chapter = chapterOf(locate(target).id);
  let outgoing: HTMLCanvasElement | null = null;
  try {
    // the printed matter goes first, through its own pixels (the overlay hides it while a chapter
    // turns), so nothing of it is cut off by the copy laid over the page
    await within(printedGone(), 1500);
    outgoing = (await within(grabFrame(), 600)) || null;
    if (outgoing) {
      outgoing.className = 'chapter-out';
      document.body.appendChild(outgoing);
    }
    resetChapter(chapter.number);
    // whatever the page was asking for (defend, the letter, the screen) belongs to where it was
    story.setState({ prompt: null });
    jumpTo(target);
    // the chapter's world on screen, drawn a few times (its shaders compiled), or give up waiting after 4 s
    const id = locate(target).id;
    await within(
      (async () => {
        while (story.getState().episode !== id) await frames(1);
        await frames(4);
        // (and again once it is on screen: the chapter left behind may have asked once more on its way out)
        if (story.getState().prompt && story.getState().prompt !== 'monitor') story.setState({ prompt: null });
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
