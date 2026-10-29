import { Camera, Mesh, Raycaster, Vector2, Vector3 } from 'three';
import { clamp } from '../../core/math';
import { story } from '../../core/store';
import { pinScroll } from '../../core/timeline';
import { closeHandoff, holdColour, navigateTo } from '../../ui/siteHandoff';

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

/**
 * Whether the projects, About and All works on the screen's picture are
 * links of their own. Off for now: the whole picture leads to the home page
 * (no hover mark on a card, every click goes to the site's front). Set it
 * back to true to open each project at its own page again; nothing else
 * needs to change.
 */
export const PROJECT_LINKS = false;

/** Seconds of the move into the screen, and of the way back out if the site cannot be opened. */
export const FLY_SECONDS = 1.8;
const BACK_SECONDS = 1.1;
/**
 * The screen's picture turns into a solid colour on the way in, as fractions
 * of the move: from WHITE_FROM, complete at WHITE_AT (80%). The move then goes
 * on until that rectangle fills the view, and only then is the browser sent.
 * The colour is the page's: white for the home page (and About, All works,
 * which are white pages), #0D0D0D, exactly, for a project.
 */
export const WHITE_FROM = 0.5;
export const WHITE_AT = 0.8;
export const HOME_COLOUR = '#ffffff';
export const PROJECT_COLOUR = '#0D0D0D';

/** How solid the picture is at a point of the move (0 … 1), eased, 1 from WHITE_AT on. */
export function solidAt(f: number) {
  const u = clamp((f - WHITE_FROM) / (WHITE_AT - WHITE_FROM), 0, 1);
  return u * u * (3 - 2 * u);
}

/** The colour a link's page opens on. */
export const linkColour = (link: number) => (link >= 0 && SCREEN_LINKS[link].path.startsWith('/case/') ? PROJECT_COLOUR : HOME_COLOUR);

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
  /** The colour the screen turns into on the way in (that page's). */
  solid: HOME_COLOUR,
  /** The browser has been sent there (once). */
  sent: false,
  /** The move into the screen, 0 seated … 1 the screen fills the view, a tween on the wall clock. */
  fly: { from: 0, to: 0, start: 0, seconds: 1 },
  /** Set by the scene: the screen's picture, and the camera to pick with. */
  mesh: null as Mesh | null,
  camera: null as Camera | null,
  /** The wall screen with the text about the author: the pointer on it draws you in to read it. */
  about: { mesh: null as Mesh | null, centre: new Vector3(), over: false, hover: 0, anchor: null as { x: number; y: number } | null },
};

/** Whether a point on the page (CSS px) is over the screen with the text about the author. */
export function overAbout(clientX: number, clientY: number) {
  const { camera } = monitor;
  const { mesh } = monitor.about;
  if (!mesh || !camera) return false;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(mesh, false).length > 0;
}

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
  if (!PROJECT_LINKS) return { link: -1 };
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
 * camera accelerates into the screen, the screen's picture turns into the
 * solid colour of the page it leads to (complete at 80% of the move), the
 * move goes on until that rectangle fills the view, and then the browser is
 * sent to the page that was clicked: a project, About or All works, or the
 * home page. Camera, colour and navigation run on one clock, the move's own
 * (wall clock from the click); the navigation is a timer at its end, and the
 * same colour is laid over the page then, so it holds while the browser
 * goes. Repeated clicks do nothing.
 */
export function enterSite(link = -1) {
  if (!monitor.armed || monitor.entering) return;
  monitor.entering = true;
  monitor.sent = false;
  monitor.url = linkUrl(link);
  monitor.solid = linkColour(link);
  pinScroll(true);
  story.setState({ prompt: null });
  document.documentElement.classList.add('site-handoff');
  const now = performance.now();
  Object.assign(monitor.fly, { from: flyAt(now), to: 1, start: now, seconds: FLY_SECONDS });
  const ms = FLY_SECONDS * 1000;
  window.clearTimeout(sendTimer);
  sendTimer = window.setTimeout(() => {
    if (!monitor.entering || monitor.sent) return;
    monitor.sent = true;
    // the view is the colour by now (the screen fills it); the same colour over the page holds it while the browser goes
    holdColour(monitor.solid);
    navigateTo(monitor.url, backToRoom);
  }, ms + 40);
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
  monitor.about.over = false;
  monitor.about.hover = 0;
  monitor.about.anchor = null;
  pinScroll(false);
}
