import { Camera, Mesh, Raycaster, Vector2 } from 'three';
import { clamp } from '../../core/math';
import { story } from '../../core/store';
import { pinScroll } from '../../core/timeline';
import { closeHandoff, navigateTo, whiteOutAt } from '../../ui/siteHandoff';

/** The portfolio site the screen shows. */
export const SITE = 'https://www.arianatmar.com';

/**
 * What can be clicked on the screen's picture (the site's home page,
 * src/assets/portfolio.webp, 2000 × 1125 px): the six project cards and the
 * two pages in its navigation, each with the address it has on the real site
 * (read from the site's own links). Rectangles are in picture pixels, from the
 * top left. A click anywhere else on the picture leads to the home page.
 */
const W = 2000;
const H = 1125;
export const SCREEN_LINKS: { name: string; path: string; x0: number; y0: number; x1: number; y1: number }[] = [
  { name: 'Razed Mods', path: '/case/razed-mods', x0: 21, y0: 129, x1: 330, y1: 508 },
  { name: 'SŌM Power', path: '/case/som-power', x0: 351, y0: 129, x1: 661, y1: 508 },
  { name: 'SŌM', path: '/case/som', x0: 681, y0: 129, x1: 991, y1: 508 },
  { name: 'TPL', path: '/case/the-performance-lab', x0: 1011, y0: 129, x1: 1321, y1: 508 },
  { name: 'Kanoi', path: '/case/kanoi', x0: 1341, y0: 129, x1: 1651, y1: 508 },
  { name: 'The Luxe Week', path: '/case/the-luxe-week', x0: 1672, y0: 129, x1: 1981, y1: 508 },
  { name: 'About', path: '/about', x0: 1662, y0: 8, x1: 1716, y1: 42 },
  { name: 'All works', path: '/all-works', x0: 1724, y0: 8, x1: 1792, y1: 42 },
];

/** Seconds of the move into the screen, and of the way back out if the site cannot be opened. */
export const FLY_SECONDS = 1.8;
const BACK_SECONDS = 1.1;
/**
 * The white-out, as fractions of the move: it starts at WHITE_FROM and is
 * complete (the whole view white) at WHITE_AT, 80% of the way in; the browser
 * is sent to the site at that moment, behind the white.
 */
export const WHITE_FROM = 0.5;
export const WHITE_AT = 0.8;

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
  /** The link under the pointer (index into SCREEN_LINKS), or -1. */
  link: -1,
  /** The click has been taken: everything after it plays by itself. */
  entering: false,
  /** Where the click leads. */
  url: '',
  /** The browser has been sent there (once). */
  sent: false,
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

/**
 * What a point on the page (CSS pixels) is over: null off the picture,
 * otherwise the link there (-1 for none: the home page).
 */
export function pick(clientX: number, clientY: number): { link: number } | null {
  const { mesh, camera } = monitor;
  if (!mesh || !camera || !mesh.visible) return null;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(mesh, false)[0];
  if (!hit?.uv) return null;
  const x = hit.uv.x * W;
  const y = (1 - hit.uv.y) * H;
  return { link: SCREEN_LINKS.findIndex((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1) };
}

/** Whether a point on the page is on the screen's picture. */
export const onScreen = (clientX: number, clientY: number) => pick(clientX, clientY) !== null;

/** The address a link on the picture leads to (-1: the home page). */
export const linkUrl = (link: number) => `${SITE}${link >= 0 ? SCREEN_LINKS[link].path : '/'}`;

let sendTimer = 0;

/**
 * The click on the screen. Once only: the page is held where it is, the
 * camera accelerates into the screen, and the view whites out, complete at
 * 80% of the move, at which moment the browser is sent to the page that was
 * clicked: a project, About or All works, or the home page. Camera, white and
 * navigation run on one clock, the move's own (wall clock from the click):
 * the white is an animation scheduled on it (it does not wait for the 3D
 * frames), and the navigation a timer at its 80% mark. Repeated clicks do
 * nothing.
 */
export function enterSite(link = -1) {
  if (!monitor.armed || monitor.entering) return;
  monitor.entering = true;
  monitor.sent = false;
  monitor.url = linkUrl(link);
  pinScroll(true);
  story.setState({ prompt: null });
  document.documentElement.classList.add('site-handoff');
  const now = performance.now();
  Object.assign(monitor.fly, { from: flyAt(now), to: 1, start: now, seconds: FLY_SECONDS });
  const ms = FLY_SECONDS * 1000;
  whiteOutAt(ms * WHITE_FROM, ms * (WHITE_AT - WHITE_FROM));
  window.clearTimeout(sendTimer);
  sendTimer = window.setTimeout(() => {
    if (!monitor.entering || monitor.sent) return;
    monitor.sent = true;
    navigateTo(monitor.url, backToRoom);
  }, ms * WHITE_AT + 20);
}

/** The site did not open here (or opened in another tab): out of the screen, back in the chair. */
export function backToRoom() {
  window.clearTimeout(sendTimer);
  closeHandoff();
  document.documentElement.classList.remove('site-handoff');
  Object.assign(monitor.fly, { from: flyAt(), to: 0, start: performance.now(), seconds: BACK_SECONDS });
  window.setTimeout(() => {
    monitor.entering = false;
    monitor.sent = false;
    pinScroll(false);
    if (monitor.armed) story.setState({ prompt: 'monitor' });
  }, BACK_SECONDS * 1000);
}

/** Leaving the episode, or the page coming back from the browser's history: everything as before the click. */
export function resetMonitor() {
  window.clearTimeout(sendTimer);
  closeHandoff(true);
  document.documentElement.classList.remove('site-handoff');
  Object.assign(monitor.fly, { from: 0, to: 0, start: 0, seconds: 1 });
  monitor.entering = false;
  monitor.sent = false;
  monitor.over = false;
  monitor.hover = 0;
  monitor.link = -1;
  pinScroll(false);
}
