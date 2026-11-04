import { SITE } from '../scenes/home/monitor';
import { TOUCH } from './touch';
import { saveResume } from './resume';
import { decodeAll, splitChars } from './decode';
import { pixelFilter, presence } from './textBoxes';
import logoSvg from '../assets/drunkfurt-logo.svg?raw';

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
  if (kind === 'desktop') return showPhoneStub();
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
  if (kind === 'lost') {
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
    // not handed back in a moment: reload and come back to this chapter (ui/resume.ts);
    // a second loss soon after a reload shows the stub instead
    timer = window.setTimeout(() => (saveResume() ? location.reload() : showStub('lost')), 1200);
  });
  canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(timer));
}

/** The page's own address, to open on a computer (without the ?anyway). */
const pageUrl = () => location.origin + location.pathname;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // (no clipboard access: the old way, through a selected field)
    const f = document.createElement('textarea');
    f.value = text;
    f.setAttribute('readonly', '');
    f.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(f);
    f.select();
    f.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    f.remove();
    return ok;
  }
}

/**
 * The phone's page (Figma "Drunkfurt-mobile", frame Mobile 375 × 812): the place and the hour at the
 * top, the DRUNKFURT mark, and at the bottom a white panel: SORRY and why, [A] COPY LINK, [B] VISIT
 * PORTFOLIO. Behind it chapter 3's room (App's backdrop), dimmed; each part comes in the page's way,
 * through pixels with its words decoding, one after another.
 */
function showPhoneStub() {
  const root = document.createElement('main');
  root.id = 'df-stub';
  root.className = 'mstub';
  root.innerHTML = `
    <p class="mstub-time" data-text="FRANKFURT AM MAIN / 23:47"></p>
    <h1 class="mstub-logo" aria-label="DRUNKFURT">${logoSvg}</h1>
    <section class="mstub-panel">
      <div class="mstub-row">
        <span class="mstub-sorry" data-text="SORRY"></span>
        <p class="mstub-msg" data-text="THIS EXPERIENCE IS DESIGNED FOR DESKTOP ONLY. OPEN THIS LINK ON YOUR COMPUTER."></p>
      </div>
      <div class="mstub-btns">
        <button type="button" class="mstub-btn mstub-btn--a">
          <span class="mstub-key" data-text="[A]"></span><span class="mstub-label" data-text="COPY LINK"></span><span class="mstub-hint" data-text="AND PASTE ON DESKTOP"></span>
        </button>
        <a class="mstub-btn mstub-btn--b" href="${SITE}" target="_blank" rel="noopener">
          <span class="mstub-key" data-text="[B]"></span><span class="mstub-label" data-text="VISIT PORTFOLIO"></span><span class="mstub-hint" data-text="EXPLORE MY WORK"></span>
        </a>
      </div>
    </section>`;
  root.querySelector('svg')?.setAttribute('aria-hidden', 'true');
  const texts = [...root.querySelectorAll<HTMLElement>('[data-text]')];
  for (const t of texts) {
    t.textContent = t.dataset.text ?? '';
    splitChars(t);
  }
  document.body.append(root);

  // the pixels the parts come in through (the story's boxes' own)
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const defs = document.createElementNS(NS, 'defs');
  svg.append(defs);
  root.append(svg);
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const parts = [
    { el: q('.mstub-time'), at: 150 },
    { el: q('.mstub-logo'), at: 450 },
    { el: q('.mstub-panel'), at: 900 },
  ].map((p, i) => ({ ...p, pres: presence(p.el, pixelFilter(defs, `df-px-mstub-${i}`)), words: [...p.el.querySelectorAll<HTMLElement>('[data-text]')].concat(p.el.dataset.text ? [p.el] : []) }));
  const t0 = performance.now();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const frame = (now: number) => {
    let busy = false;
    for (const p of parts) {
      if (reduced) {
        p.el.style.opacity = '1';
        p.el.style.visibility = 'visible';
        p.el.style.filter = '';
        continue;
      }
      if (now - t0 >= p.at && p.pres.phase === 'hidden') p.pres.show(now, p.words);
      p.pres.frame(now);
      if (p.pres.phase !== 'shown') busy = true;
    }
    if (busy) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // [A]: the address to the clipboard (or, where there is none, the phone's share sheet), said on the button
  const a = q('.mstub-btn--a');
  const hint = a.querySelector<HTMLElement>('.mstub-hint')!;
  const say = (el: HTMLElement, text: string) => {
    el.dataset.text = text;
    el.textContent = text;
    splitChars(el);
    void decodeAll(el, 420);
  };
  let reset = 0;
  a.addEventListener('click', async () => {
    const url = pageUrl();
    let ok = await copyText(url);
    if (!ok && navigator.share) {
      try {
        await navigator.share({ title: 'DRUNKFURT', url });
        ok = true;
      } catch {
        ok = false;
      }
    }
    say(hint, ok ? 'COPIED. PASTE ON DESKTOP' : 'COPY FAILED');
    a.classList.toggle('is-done', ok);
    window.clearTimeout(reset);
    reset = window.setTimeout(() => {
      a.classList.remove('is-done');
      say(hint, 'AND PASTE ON DESKTOP');
    }, 2600);
  });
  // [B]: its words decode as it is tapped, on the way out to the site
  const b = q('.mstub-btn--b');
  b.addEventListener('pointerdown', () => b.querySelectorAll<HTMLElement>('[data-text]').forEach((t) => void decodeAll(t, 320)));
}
