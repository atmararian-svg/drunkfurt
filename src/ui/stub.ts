import { SITE } from '../scenes/home/monitor';
import { TOUCH } from './touch';

/**
 * The page in place of the story where it cannot run as it should: a browser
 * without WebGL (or one whose WebGL gave out), and a phone or tablet (the
 * story is made for a desktop; on a touch screen it runs, but not smoothly:
 * TRY ANYWAY goes in all the same, remembered for the visit). Drawn in the
 * page's own manner (the 404 page's too): ink, the halftone, JetBrains Mono
 * capitals typed in a console, Archivo for the headline, a white tab.
 */
export type StubKind = 'webgl' | 'desktop' | 'lost';

const ANYWAY_KEY = 'drunkfurt:touch-anyway';

/** WebGL 2 or 1, actually created (a browser can list it and still refuse the context). */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Why the story should not start here, or null to start it. */
export function stubReason(): StubKind | null {
  if (!webglAvailable()) return 'webgl';
  if (TOUCH && !touchAnyway()) return 'desktop';
  return null;
}

function touchAnyway() {
  try {
    if (new URLSearchParams(location.search).has('anyway')) return true;
    return sessionStorage.getItem(ANYWAY_KEY) === '1';
  } catch {
    return false;
  }
}

const COPY: Record<StubKind, { meta: string; title: string[]; lines: string[] }> = {
  desktop: {
    meta: 'DRUNKFURT / DESKTOP ONLY',
    title: ['BIGGER', 'SCREEN'],
    lines: ['DRUNKFURT is a 3D night out in Frankfurt.', 'It is made for a desktop browser.', 'Open this link on your computer.'],
  },
  webgl: {
    meta: 'DRUNKFURT / NO WEBGL',
    title: ['LIGHTS', 'OUT'],
    lines: ['This browser cannot draw the night: WebGL is off.', 'Turn on hardware acceleration,', 'or open it in Chrome, Firefox or Safari.'],
  },
  lost: {
    meta: 'DRUNKFURT / BLACKOUT',
    title: ['LIGHTS', 'OUT'],
    lines: ['The graphics card gave up on the night.', 'Reload to pick it up again.'],
  },
};

export function showStub(kind: StubKind) {
  document.documentElement.classList.remove('is-preloading');
  document.getElementById('df-stub')?.remove();
  const c = COPY[kind];
  const root = document.createElement('main');
  root.id = 'df-stub';
  root.className = 'stub';
  const box = document.createElement('div');
  box.className = 'stub-box';
  const meta = document.createElement('div');
  meta.className = 'stub-meta';
  meta.innerHTML = `<span>${c.meta}</span><span>FRANKFURT AM MAIN / 23:47</span>`;
  const h = document.createElement('h1');
  h.className = 'stub-title';
  h.innerHTML = c.title.join('<br />');
  box.append(meta, h);
  for (const l of c.lines) {
    const p = document.createElement('p');
    p.className = 'stub-line';
    p.textContent = l;
    box.append(p);
  }
  box.lastElementChild?.insertAdjacentHTML('beforeend', ' <span class="stub-caret" aria-hidden="true"></span>');
  const acts = document.createElement('div');
  acts.className = 'stub-acts';
  const tab = (label: string, primary: boolean, on: () => void, href?: string) => {
    const a = document.createElement(href ? 'a' : 'button');
    a.className = primary ? 'stub-tab' : 'stub-tab stub-tab--ghost';
    a.textContent = label;
    if (href && a instanceof HTMLAnchorElement) a.href = href;
    a.addEventListener('click', on);
    acts.append(a);
    return a;
  };
  if (kind === 'desktop') {
    const copy = tab('COPY LINK', true, async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'DRUNKFURT', url: location.origin + location.pathname });
        else await navigator.clipboard.writeText(location.origin + location.pathname);
        copy.textContent = 'LINK COPIED';
      } catch {
        // (the share sheet dismissed, or no clipboard: nothing to say)
      }
    });
    tab('TRY ANYWAY', false, () => {
      try {
        sessionStorage.setItem(ANYWAY_KEY, '1');
      } catch {
        // (no storage: the reload below asks for it in the address instead)
      }
      const u = new URL(location.href);
      u.searchParams.set('anyway', '');
      location.replace(u.toString());
    });
  } else if (kind === 'lost') {
    tab('RELOAD', true, () => location.reload());
  }
  tab('ARIANATMAR.COM', kind === 'webgl', () => undefined, SITE);
  box.append(acts);
  root.append(box);
  document.body.append(root);
}

/**
 * The story's WebGL given out mid-way (a phone short of memory, a driver
 * reset): if the browser has not given it back within a moment, the blackout
 * page in its place.
 */
export function watchContextLoss(canvas: HTMLCanvasElement) {
  let timer = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    timer = window.setTimeout(() => showStub('lost'), 2500);
  });
  canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(timer));
}
