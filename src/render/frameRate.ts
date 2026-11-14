/**
 * The page's frame rate. A MacBook Pro's screen runs at 120 Hz, and so does the browser's animation
 * frame: left to it, the 3D page (the scene drawn twice, for the picture and for the ink, then the
 * print and the bloom, and every other frame the shadows) was drawn 120 times a second, twice what
 * the eye can follow here, and the laptop heated up for nothing. Every loop of the page asks
 * `due()` first: at most 60 frames a second wherever the screen is faster (a frame is drawn when at
 * least 3/4 of a 60th of a second has passed, so a 60 Hz screen loses none), fewer where the
 * picture is hidden or still (under the preloader, during the hand-over to the site, behind the open
 * letter, behind the phone's page).
 */
const FULL = 1000 / 60;

/** The least time between two frames now (ms). */
export function frameGap(backdrop = false) {
  const html = document.documentElement.classList;
  if (backdrop) return 1000 / 30;
  // (the hand-over into chapter 1 reads the picture every frame: full rate while its blocks are up)
  if (html.contains('is-preloading') && !document.querySelector('.pixel-reveal')) return 1000 / 20;
  if (html.contains('site-handoff')) return 1000 / 15;
  // (the letter open: the street is a dimmed, still picture behind the sheet)
  if (html.contains('is-reading')) return 1000 / 30;
  return FULL;
}

/** A gate for one loop: `due(now)` is true when this loop should do a frame now. */
export function frameGate(gap = () => FULL) {
  let last = -Infinity;
  return (now: number) => {
    if (now - last < gap() * 0.75) return false;
    last = now;
    return true;
  };
}
