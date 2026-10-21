import portfolioUrl from '../assets/portfolio.webp?url';

/**
 * The hand-over from the story to the real site. When the camera has moved
 * into the screen, the screen's own picture (the same image, the site's home
 * page) is laid over the page, framed exactly as the camera frames it
 * (cover-fit, centred), so the cut is not seen. Then the browser is sent to
 * the site.
 *
 * Opened as the page itself, that is a plain navigation, in the same tab.
 * Inside a frame (an embed, a sandboxed preview), which may not send the
 * whole window anywhere, the site opens in a new tab on the strength of the
 * visitor's click, and the page moves back into the room behind it. Only if
 * the browser refuses that too are a link to the site and a way back into
 * the room shown, so nobody is left looking at a picture of a website.
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
      // inspection only: the dev build can be told to stop short of leaving
      if (import.meta.env.DEV && (window as unknown as { __holdNavigation?: boolean }).__holdNavigation) {
        timers.push(window.setTimeout(showStuck, 5000));
        return;
      }
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
      // in a frame (an embed such as a sandboxed preview, which may not send the whole window
      // anywhere): the site opens in a new tab, still on the visitor's click (a browser lets a page
      // open one shortly after a click), and this page goes quietly back into the room behind it
      let opened: Window | null = null;
      try {
        opened = window.open(url, '_blank');
      } catch {
        opened = null;
      }
      if (opened) {
        try {
          opened.opener = null;
        } catch {
          // a cross-origin window: nothing to cut
        }
        timers.push(window.setTimeout(onBack, 1200));
        return;
      }
      try {
        // allowed only where the embedding page lets this frame navigate it
        window.top!.location.href = url;
      } catch {
        // refused as well: the link below is the way left
      }
      timers.push(window.setTimeout(showStuck, 1400));
    }, 300),
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
