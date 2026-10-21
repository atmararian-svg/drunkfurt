import { Camera, Mesh, Raycaster, Vector2 } from 'three';
import { clamp } from '../../core/math';
import { story } from '../../core/store';
import { pinScroll } from '../../core/timeline';
import { closeHandoff, openHandoff } from '../../ui/siteHandoff';

/** Where the screen leads: the real portfolio site. */
export const SITE_URL = 'https://www.arianatmar.com/';

/** Seconds of the move into the screen, and of the way back out if the site cannot be opened. */
export const FLY_SECONDS = 1.8;
const BACK_SECONDS = 1.1;

/**
 * The portfolio screen's state, kept outside React: the scene and the camera
 * read it every frame, the click handler writes it.
 */
export const monitor = {
  /** Seated and waiting for the click (the story's last gate). */
  armed: false,
  /** The pointer is over the screen itself (its picture, not the frame). */
  over: false,
  /** Eased 0 … 1 towards `over`, for the gentle lean in. */
  hover: 0,
  /** The click has been taken: everything after it plays by itself. */
  entering: false,
  /** The move into the screen, 0 seated … 1 the screen fills the view, a tween on the wall clock. */
  fly: { from: 0, to: 0, start: 0, seconds: 1 },
  /** Set by the scene: the screen's picture, and the camera to pick with. */
  mesh: null as Mesh | null,
  camera: null as Camera | null,
};

/** Where the move into the screen is now (0 … 1). */
export function flyAt(now = performance.now()) {
  const f = monitor.fly;
  const u = clamp((now - f.start) / 1000 / f.seconds, 0, 1);
  return f.from + (f.to - f.from) * u;
}

const ray = new Raycaster();
const ndc = new Vector2();

/** Whether a point on the page (CSS pixels) is on the screen's picture. */
export function onScreen(clientX: number, clientY: number) {
  const { mesh, camera } = monitor;
  if (!mesh || !camera || !mesh.visible) return false;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(mesh, false).length > 0;
}

let timers: number[] = [];
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
};

/**
 * The click on the screen. Once only: the page is held where it is, the
 * camera moves into the screen until its picture fills the view, the same
 * picture is laid over the page as a plain image (so nothing changes on the
 * cut), and the site is opened. Repeated clicks do nothing.
 */
export function enterSite() {
  if (!monitor.armed || monitor.entering) return;
  monitor.entering = true;
  pinScroll(true);
  story.setState({ prompt: null });
  document.documentElement.classList.add('site-handoff');
  Object.assign(monitor.fly, { from: flyAt(), to: 1, start: performance.now(), seconds: FLY_SECONDS });
  // the picture over the page as the camera arrives, then the site
  later(FLY_SECONDS * 1000 - 60, () => openHandoff(SITE_URL, backToRoom));
}

/** The site did not open (or the visitor chose to stay): out of the screen, back in the chair. */
export function backToRoom() {
  clearTimers();
  closeHandoff();
  document.documentElement.classList.remove('site-handoff');
  Object.assign(monitor.fly, { from: flyAt(), to: 0, start: performance.now(), seconds: BACK_SECONDS });
  later(BACK_SECONDS * 1000, () => {
    monitor.entering = false;
    pinScroll(false);
    if (monitor.armed) story.setState({ prompt: 'monitor' });
  });
}

/** Leaving the episode, or the page coming back from the browser's history: everything as before the click. */
export function resetMonitor() {
  clearTimers();
  closeHandoff(true);
  document.documentElement.classList.remove('site-handoff');
  Object.assign(monitor.fly, { from: 0, to: 0, start: 0, seconds: 1 });
  monitor.entering = false;
  monitor.over = false;
  monitor.hover = 0;
  pinScroll(false);
}
