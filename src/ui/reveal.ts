/**
 * The page-to-page transition of DRUNKFURT, after the supplied "parallax
 * reveal" (Framer Motion variants, adapted to the Web Animations API): the
 * outgoing page drifts up by a fifth and shrinks a little, while the incoming
 * page is uncovered from the bottom edge (a clip-path inset closing to
 * nothing) and slides up into place from half a screen below, both on one
 * "liquid" curve. Going back the directions mirror (`down`).
 *
 * Here the incoming page is always the live 3D stage; the outgoing one is the
 * preloader or a copy of the last frame of the chapter being left.
 */
const LIQUID = { duration: 1250, easing: 'cubic-bezier(0.76, 0, 0.24, 1)' };

const stage = () => document.querySelector<HTMLElement>('.stage');

/** Hides the stage (fully clipped), so whatever lies under it shows: the outgoing page. */
export function coverStage(dir: 'up' | 'down') {
  const el = stage();
  if (el) el.style.clipPath = dir === 'up' ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)';
}

/** Plays the reveal; resolves when it has finished (or at once if animations are unavailable). */
export function reveal(outgoing: HTMLElement | null, dir: 'up' | 'down'): Promise<void> {
  const el = stage();
  const canvas = el?.querySelector('canvas');
  const up = dir === 'up';
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const timing: KeyframeAnimationOptions = { ...LIQUID, duration: reduced ? 1 : LIQUID.duration, fill: 'forwards' };
  if (!el || typeof el.animate !== 'function') {
    if (el) el.style.clipPath = '';
    return Promise.resolve();
  }
  const anims: Animation[] = [];
  anims.push(
    el.animate([{ clipPath: up ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }], timing),
  );
  if (canvas) anims.push(canvas.animate([{ transform: `translateY(${up ? 50 : -50}%)` }, { transform: 'translateY(0%)' }], timing));
  if (outgoing)
    anims.push(
      outgoing.animate(
        [{ transform: 'translateY(0%) scale(1)' }, { transform: `translateY(${up ? -20 : 20}%) scale(0.95)` }],
        timing,
      ),
    );
  return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
    // the stage keeps no trace of it
    el.style.clipPath = '';
    for (const a of anims) a.cancel();
  });
}
