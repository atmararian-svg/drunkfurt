/**
 * The hand-over from the story to the real site. As the camera moves into
 * the screen, the screen's picture turns into the page's solid colour (the
 * scene does that, on the screen itself); once that rectangle fills the view,
 * the same colour is laid over the page (`holdColour`) and the browser is
 * sent to the page the visitor clicked (`navigateTo`), the colour kept up
 * while it goes. No frame of
 * the site is embedded, and nothing of it is read: the address comes from the
 * link that was clicked on the screen's picture.
 *
 * Opened as the page itself, that is a plain navigation in the same tab: the
 * colour stays until the site paints. Inside a frame (an embed, a sandboxed
 * preview), which may not send the whole window anywhere, the site opens in
 * a new tab on the strength of the visitor's click, and this page fades back
 * from the colour into the room behind it. Only if the browser refuses that too
 * is a link to the page shown on the colour, with a way back into the room,
 * so nobody is left on a blank page.
 */
let white: HTMLDivElement | null = null;
let timers: number[] = [];
let leaving = false;

const onPageHide = () => {
  leaving = true;
};

function layer() {
  if (white) return white;
  white = document.createElement('div');
  white.className = 'whiteout';
  white.setAttribute('aria-hidden', 'true');
  document.body.appendChild(white);
  return white;
}

/**
 * Lays the colour over the whole page at once. Called when the screen's
 * rectangle of that same colour already fills the view, so nothing visibly
 * changes: it only keeps the colour up whatever the 3D frames do next.
 */
export function holdColour(colour: string) {
  const el = layer();
  el.style.background = colour;
  el.classList.toggle('is-dark', colour.toLowerCase() !== '#ffffff');
  el.style.opacity = '1';
  el.style.pointerEvents = 'auto';
}

function showStuck(url: string, onBack: () => void) {
  if (leaving || !white) return;
  const panel = document.createElement('div');
  panel.className = 'handoff-stuck';
  panel.setAttribute('role', 'dialog');
  const note = document.createElement('p');
  note.textContent = 'The page could not open in this window.';
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
  panel.append(note, open, back);
  white.append(panel);
  open.focus({ preventScroll: true });
}

/** Sends the browser to `url` (once the view is the page's colour). */
export function navigateTo(url: string, onBack: () => void) {
  leaving = false;
  window.addEventListener('pagehide', onPageHide);
  const stuck = () => showStuck(url, onBack);
  // inspection only: the dev build can be told to stop short of leaving
  if (import.meta.env.DEV && (window as unknown as { __holdNavigation?: boolean }).__holdNavigation) {
    timers.push(window.setTimeout(stuck, 5000));
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
    timers.push(window.setTimeout(stuck, 6000));
    return;
  }
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
    timers.push(window.setTimeout(onBack, 900));
    return;
  }
  try {
    // allowed only where the embedding page lets this frame navigate it
    window.top!.location.href = url;
  } catch {
    // refused as well: the link is the way left
  }
  timers.push(window.setTimeout(stuck, 1400));
}

/** Takes the white away again (fading, or at once). */
export function closeHandoff(now = false) {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
  window.removeEventListener('pagehide', onPageHide);
  const old = white;
  white = null;
  if (!old) return;
  if (now) {
    old.remove();
    return;
  }
  old.style.pointerEvents = 'none';
  old.style.transition = 'opacity 0.6s linear';
  requestAnimationFrame(() => (old.style.opacity = '0'));
  window.setTimeout(() => old.remove(), 700);
}
