/**
 * The hand-over from the story to the real site. As the camera moves into
 * the screen, the whole view goes white (`whiteOut`, driven by the move; fully
 * white by 80% of it), and then the browser is sent to the page the visitor
 * clicked (`navigateTo`), with the white kept up while it goes. No frame of
 * the site is embedded, and nothing of it is read: the address comes from the
 * link that was clicked on the screen's picture.
 *
 * Opened as the page itself, that is a plain navigation in the same tab: the
 * white stays until the site paints. Inside a frame (an embed, a sandboxed
 * preview), which may not send the whole window anywhere, the site opens in
 * a new tab on the strength of the visitor's click, and this page fades back
 * from white into the room behind it. Only if the browser refuses that too
 * is a link to the page shown on the white, with a way back into the room,
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
 * Schedules the white: it begins `delay` ms from now and is complete `duration`
 * ms later, eased in (slow at first, so it reads as the screen's light
 * flooding the view, not a flash).
 */
export function whiteOutAt(delay: number, duration: number) {
  const el = layer();
  el.style.pointerEvents = 'auto';
  if (typeof el.animate === 'function') {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { delay, duration, easing: 'cubic-bezier(0.55, 0, 0.45, 1)', fill: 'forwards' });
  } else {
    window.setTimeout(() => (el.style.opacity = '1'), delay + duration);
  }
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

/** Sends the browser to `url` (once the view is white). */
export function navigateTo(url: string, onBack: () => void) {
  leaving = false;
  // the white is complete by now (on the same clock); make sure it is, whatever the frames did
  if (white) {
    white.getAnimations?.().forEach((a) => a.finish());
    white.style.opacity = '1';
  }
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
  const from = getComputedStyle(old).opacity;
  old.getAnimations?.().forEach((a) => a.cancel());
  old.style.opacity = from;
  old.style.transition = 'opacity 0.6s linear';
  requestAnimationFrame(() => (old.style.opacity = '0'));
  window.setTimeout(() => old.remove(), 700);
}
