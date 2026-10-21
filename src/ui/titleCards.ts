import { decodeIn } from './decode';

/**
 * The chapter title cards (Figma "Drunkfurt", Example-chapter-1…3): a frosted
 * glass panel in the bottom-left corner, tilted 6°, carrying the chapter's
 * title and its two lines of metadata. At a chapter's start the card slides
 * in from the left edge, holds a moment, and slides back out. The cards are
 * rendered once by the overlay (Overlay.tsx, `.tcard[data-chapter]`); this
 * only plays them, one at a time: showing one stops any other.
 */
const ENTER = { duration: 1100, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
const HOLD = 3400;
const EXIT = { duration: 800, easing: 'cubic-bezier(0.7, 0, 0.84, 0)' };

let current: { el: HTMLElement; anim: Animation | null; timer: number } | null = null;

function stop() {
  if (!current) return;
  window.clearTimeout(current.timer);
  current.anim?.cancel();
  current.el.classList.remove('is-on');
  current = null;
}

/** Slides chapter `n`'s card in, holds it, slides it out. */
export function showTitleCard(n: number) {
  stop();
  const el = document.querySelector<HTMLElement>(`.tcard[data-chapter="${n}"]`);
  const slide = el?.querySelector<HTMLElement>('.tcard-slide');
  if (!el || !slide) return;
  el.classList.add('is-on');
  const entry: typeof current = { el, anim: null, timer: 0 };
  current = entry;
  const play = (frames: Keyframe[], timing: KeyframeAnimationOptions) =>
    typeof slide.animate === 'function' ? slide.animate(frames, { ...timing, fill: 'forwards' }) : null;
  entry.anim = play([{ transform: 'translateX(-104%)' }, { transform: 'translateX(0%)' }], ENTER);
  // the lettering settles out of a short decode as the card arrives
  el.querySelectorAll<HTMLElement>('[data-decode-in]').forEach((t, i) => decodeIn(t, 520 + i * 90, 140 + i * 120));
  // the hold counts from when the card has arrived, however long its entrance took
  const exit = () => {
    if (current !== entry) return;
    entry.anim?.cancel();
    entry.anim = play([{ transform: 'translateX(0%)' }, { transform: 'translateX(-104%)' }], EXIT);
    const gone = () => {
      if (current === entry) stop();
    };
    if (entry.anim) entry.anim.finished.then(gone, () => undefined);
    else gone();
  };
  const arrived = () => {
    if (current === entry) entry.timer = window.setTimeout(exit, HOLD);
  };
  if (entry.anim) entry.anim.finished.then(arrived, () => undefined);
  else arrived();
}

/** Takes any card away at once (a chapter is being left). */
export function hideTitleCard() {
  stop();
}
