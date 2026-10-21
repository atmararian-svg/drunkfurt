import portfolioUrl from '../assets/portfolio.webp?url';

/**
 * The hand-over from the story to the real site. When the camera has moved
 * into the screen, the screen's own picture (the same image, the site's home
 * page) is laid over the page, framed exactly as the camera frames it
 * (cover-fit, centred), so the cut is not seen. Then the browser is sent to
 * the site.
 *
 * Opened as the page itself, that is a plain navigation. Inside a frame
 * (an embed, a sandboxed preview) the frame may not be allowed to send the
 * whole window anywhere; if the site has not taken over after a moment, a
 * link to it and a way back into the room are shown, so nobody is left
 * looking at a picture of a website.
 */
let el: HTMLDivElement | null = null;
let timers: number[] = [];
let leaving = false;

const onPageHide = () => {
  leaving = true;
};

function build(url: string, onBack: () => void) {
  const root = document.createElement('div');
  root.className = 'handoff';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Opening arianatmar.com');
  const shot = document.createElement('img');
  shot.className = 'handoff-shot';
  shot.src = portfolioUrl;
  shot.alt = 'arianatmar.com, home page';
  shot.decoding = 'sync';
  const stuck = document.createElement('div');
  stuck.className = 'handoff-stuck';
  stuck.hidden = true;
  const note = document.createElement('p');
  note.textContent = 'The site could not open in this window.';
  const open = document.createElement('a');
  open.className = 'handoff-open';
  open.href = url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = 'Open arianatmar.com';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'handoff-back';
  back.textContent = 'Back to the room';
  back.addEventListener('click', (e) => {
    e.stopPropagation();
    onBack();
  });
  stuck.append(note, open, back);
  root.append(shot, stuck);
  return root;
}

/** Lays the picture over the page (a short fade), then opens the site. */
export function openHandoff(url: string, onBack: () => void) {
  closeHandoff(true);
  leaving = false;
  window.addEventListener('pagehide', onPageHide);
  el = build(url, onBack);
  document.body.appendChild(el);
  // a frame later, so the fade runs
  requestAnimationFrame(() => requestAnimationFrame(() => el?.classList.add('is-on')));
  const root = el;
  const showStuck = () => {
    if (leaving || el !== root) return;
    const stuck = root.querySelector<HTMLElement>('.handoff-stuck')!;
    stuck.hidden = false;
    root.querySelector<HTMLElement>('.handoff-open')!.focus({ preventScroll: true });
  };
  timers.push(
    window.setTimeout(() => {
      let framed = true;
      try {
        framed = window.top !== window.self;
      } catch {
        framed = true;
      }
      if (!framed) {
        window.location.assign(url);
        // a navigation that has not happened after a few seconds (offline, blocked) gets the way out
        timers.push(window.setTimeout(showStuck, 5000));
        return;
      }
      try {
        // allowed only where the embedding page lets this frame navigate it
        window.top!.location.href = url;
      } catch {
        // refused: the link below does it, as a new tab
      }
      timers.push(window.setTimeout(showStuck, 1400));
    }, 340),
  );
}

/** Takes the picture away again (fading, or at once). */
export function closeHandoff(now = false) {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  window.removeEventListener('pagehide', onPageHide);
  const old = el;
  el = null;
  if (!old) return;
  if (now) {
    old.remove();
    return;
  }
  old.classList.remove('is-on');
  window.setTimeout(() => old.remove(), 400);
}
