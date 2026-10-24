import { CHAPTERS, chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { chapterStarts, chapterTurn, locate, scriptOwnsScroll, timeline } from '../core/timeline';
import { letter } from '../scenes/city/letter';
import { monitor } from '../scenes/home/monitor';
import { goToChapter } from './chapterTransition';
import { decodeIn } from './decode';

/**
 * The chapter tuner: the page's chapter navigation, after the supplied radio
 * tuner reference. A flat, dark piece of hardware at the right edge,
 * vertically centred: a curved tuning scale (fine ticks, a dotted track, an
 * inner ring of short ticks) with the three chapters as its stations, a
 * rectangular marker on the scale, small direction marks on the marker's
 * line, and a large rounded display with the chapter's title.
 *
 * States, one at a time, explicit:
 *  - compact: almost all of it beyond the right edge; the scale's edge, the
 *    chapter numbers and the marker show;
 *  - open (pointer over it, a tap on a touch screen, or keyboard focus): it
 *    slides in, the display with the title shows, and the page behind it dims
 *    and breaks into pixels (the scene's pixel layer, scenePixels.ts, and the
 *    same look laid over the printed matter);
 *  - dragging: the marker follows the pointer along the scale, the nearest
 *    station is previewed (its number and the title in red); it stays open
 *    however far the pointer goes;
 *  - letting go: the marker snaps to that station and, if it is another
 *    chapter, the chapter transition takes you there (goToChapter: pixel
 *    reveal, title card); the current chapter is never restarted.
 *
 * It never decides the chapter: every frame (`updateTuner`, from the overlay's
 * loop, so no loop of its own) it reads the chapter and progress from the
 * scroll (`locate(timeline.progress)`). The marker eases to the chapter's
 * station when the chapter actually changes; the progress through the
 * chapter runs as a red light along the dotted track, only part of the way
 * to the next station, so it never seems to be there before the scene is.
 * While a transition, a scripted beat, the open letter or the flight into the
 * screen runs, it does not take you anywhere.
 */

/** The drawing, in its own px (scaled as a whole on small screens). */
const W = 480;
const H = 360;
const R = 300;
const CX = 70 + R;
const CY = H / 2;
/** Each chapter's station on the scale (degrees from nine o'clock, down positive). */
const STATION = [-18, 0, 18];
/** How far the scale is drawn, and how far the marker may go. */
const SPAN = 36;
const LIMIT = 24;
/** How much of it shows when compact (its px, from the left edge). */
const SHOW = 96;
/** The marker's middle (radius). */
const MARK_R = R + 6;
const TITLES = ['THE ARRIVAL', 'NO WELCOME', 'THE CAVE'];
const pad = (n: number) => String(n).padStart(2, '0');
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rad = Math.PI / 180;
const pt = (r: number, deg: number) => [CX - r * Math.cos(deg * rad), CY + r * Math.sin(deg * rad)] as const;
const SVG = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent?: Element) => {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
};
const line = (r0: number, r1: number, deg: number, attrs: Record<string, string | number>, parent: Element) => {
  const [x1, y1] = pt(r0, deg);
  const [x2, y2] = pt(r1, deg);
  return el('line', { x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2), ...attrs }, parent);
};

const chapterNow = () => chapterOf(locate(timeline.progress).id).number;
/** May the tuner take you to another chapter now? */
const safeToTurn = () =>
  story.getState().phase === 'ready' && !chapterTurn.busy && !scriptOwnsScroll() && !letter.open && !monitor.entering;

/** Where the progress light reaches (degrees): through a chapter, part of the way towards the next station. */
function progressAngle(n: number) {
  const starts = chapterStarts();
  const a = starts[n - 1] ?? 0;
  const b = starts[n] ?? 1;
  const f = clamp((timeline.progress - a) / Math.max(1e-6, b - a), 0, 1);
  const next = n < 3 ? STATION[n] : STATION[2] + 12;
  return STATION[n - 1] + f * (next - STATION[n - 1]) * (n < 3 ? 0.82 : 1);
}

interface Tuner {
  root: HTMLElement;
  update(): void;
  backdrop(): number;
  dispose(): void;
}
let tuner: Tuner | null = null;

/** Called every frame by the overlay: the tuner follows the story. */
export function updateTuner() {
  tuner?.update();
}
/** How open the tuner is (0 … 1, eased): the page behind it dims and pixelates by this much. */
export function tunerBackdrop() {
  return tuner?.backdrop() ?? 0;
}

export function mountChapterTuner(): () => void {
  tuner?.dispose();
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('nav');
  root.className = 'tuner';
  root.setAttribute('aria-label', 'DRUNKFURT chapters');
  const body = document.createElement('div');
  body.className = 'tuner-body';
  root.append(body);

  // --- the scale ---------------------------------------------------------------------
  const svg = el('svg', { class: 'tuner-scale', viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' });
  const defs = el('defs', {}, svg);
  const fade = el('linearGradient', { id: 'tuner-fade', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  for (const [o, a] of [
    [0, 0],
    [0.16, 1],
    [0.84, 1],
    [1, 0],
  ])
    el('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a }, fade);
  const mask = el('mask', { id: 'tuner-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, defs);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#tuner-fade)' }, mask);
  // the page behind it, pixelated (the printed matter: the scene has its own pixel layer)
  const pix = el('filter', { id: 'df-pixelate', x: 0, y: 0, width: 1, height: 1 }, defs);
  el('feFlood', { x: 3, y: 3, width: 1, height: 1 }, pix);
  el('feComposite', { width: 7, height: 7 }, pix);
  el('feTile', { result: 'grid' }, pix);
  el('feComposite', { in: 'SourceGraphic', in2: 'grid', operator: 'in' }, pix);
  el('feMorphology', { operator: 'dilate', radius: 3.5 }, pix);

  const scale = el('g', { mask: 'url(#tuner-mask)' }, svg);
  // long ticks every 2 degrees, a little longer every 6
  for (let d = -SPAN; d <= SPAN; d += 2) {
    const major = d % 6 === 0;
    line(R - 8, R + (major ? 30 : 22), d, { class: major ? 'tk tk--major' : 'tk' }, scale);
  }
  // the dotted track (the progress lights along it), and the inner ring of short ticks
  const dots: SVGCircleElement[] = [];
  const dotDeg: number[] = [];
  for (let d = -SPAN; d <= SPAN; d += 1) {
    const [x, y] = pt(R - 20, d);
    dots.push(el('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: 1.1, class: 'dt' }, scale));
    dotDeg.push(d);
  }
  for (let d = -SPAN; d <= SPAN; d += 1.5) line(R - 44, R - 30, d, { class: 'tk tk--inner' }, scale);
  // the three stations: a long tick and the number
  const stationTicks = STATION.map((d) => line(R - 12, R + 38, d, { class: 'st' }, scale));
  const labels = STATION.map((d, i) => {
    // (just above its tick, as the reference's numbers sit off the line, so the marker's line never runs through it)
    const [x, y] = pt(R + 50, d - 3.2);
    const t = el('text', { x: x.toFixed(1), y: (y + 1).toFixed(1), class: 'lb', 'text-anchor': 'middle' }, svg);
    t.textContent = pad(i + 1);
    return t;
  });
  // the marker's line: a mark at the left edge, the marker on the scale, then ◂ and the station number
  const ind = el('g', { class: 'ind' }, svg);
  el('path', { d: 'M4 -4 L10 0 L4 4 Z', class: 'tri' }, ind);
  const leftDash = el('line', { x1: 14, y1: 0, x2: 30, y2: 0, class: 'dash' }, ind);
  const rightDash = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'dash' }, ind);
  const tri2 = el('path', { d: '', class: 'tri' }, ind);
  const num = el('text', { x: 0, y: 4, class: 'num' }, ind);
  const tailDash = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'dash' }, ind);
  const marker = el('g', { class: 'mk' }, svg);
  el('rect', { x: -26, y: -32, width: 52, height: 64, rx: 7, class: 'mk-box' }, marker);
  el('line', { x1: -14, y1: -14, x2: 14, y2: -15, class: 'mk-ln' }, marker);
  el('line', { x1: -16, y1: 0, x2: 16, y2: 0, class: 'mk-ln mk-ln--on' }, marker);
  el('line', { x1: -14, y1: 14, x2: 14, y2: 15, class: 'mk-ln' }, marker);
  body.append(svg);

  // --- the display -------------------------------------------------------------------
  const display = document.createElement('div');
  display.className = 'tuner-display';
  const title = document.createElement('span');
  title.className = 'tuner-title';
  title.setAttribute('aria-live', 'polite');
  display.append(title);
  body.append(display);

  // --- the stations as buttons (pointer, keyboard, screen readers) ---------------------
  const buttons = CHAPTERS.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tuner-go';
    b.setAttribute('aria-label', `Chapter ${c.number}: ${TITLES[i]}`);
    const [x, y] = pt(R + 30, STATION[i]);
    Object.assign(b.style, { left: `${x - 34}px`, top: `${y - 18}px` });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dragged) return;
      commit(i + 1);
    });
    b.addEventListener('keydown', (e) => {
      const k = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!k) return;
      e.preventDefault();
      buttons[clamp(i + k, 0, 2)].focus();
    });
    body.append(b);
    return b;
  });
  document.body.append(root);

  // --- state ------------------------------------------------------------------------------
  let active = chapterNow();
  let markDeg = STATION[active - 1];
  let open = false; // wanted open (hover, tap, focus or drag)
  let hover = false;
  let touchOpen = false;
  let focused = false;
  let openK = 0; // eased
  let drag: { id: number } | null = null;
  let dragged = false;
  let preview = 0;
  let pendingUntil = 0; // a station let go on, held until the chapter changes (or it is clear it will not)
  let shown = 0; // the chapter whose title is shown
  let lit = -1;
  let s = 1;
  let last = performance.now();

  const layout = () => {
    s = clamp(Math.min(window.innerWidth / 1100, window.innerHeight / 760), 0.62, 1);
    root.style.setProperty('--s', String(s));
    root.style.width = `${W * s}px`;
    root.style.height = `${H * s}px`;
  };
  const showTitle = (n: number, previewing: boolean) => {
    const key = n * 2 + (previewing ? 1 : 0);
    if (key === shown) return;
    shown = key;
    title.dataset.text = TITLES[n - 1];
    display.classList.toggle('is-preview', previewing);
    void decodeIn(title, reduced ? 1 : 520, 0, { rise: 0 });
  };
  const setOpen = () => {
    const want = hover || touchOpen || focused || !!drag;
    if (want === open) return;
    open = want;
    root.classList.toggle('is-open', open);
  };

  /** The station chosen: go there (once settled), unless it is where you are or now is not the time. */
  const commit = (n: number) => {
    preview = 0;
    if (n === active || !safeToTurn()) {
      pendingUntil = 0;
      showTitle(active, false);
      return;
    }
    // the marker stays on it until the transition cuts to that chapter
    preview = n;
    pendingUntil = performance.now() + 6000;
    goToChapter(n);
  };

  // --- pointer --------------------------------------------------------------------------
  const degAt = (clientY: number) => {
    const r = body.getBoundingClientRect();
    const y = (clientY - r.top) / s - CY;
    return clamp(Math.asin(clamp(y / MARK_R, -1, 1)) / rad, -LIMIT, LIMIT);
  };
  const nearest = (deg: number) => {
    let best = 1;
    STATION.forEach((d, i) => {
      if (Math.abs(deg - d) < Math.abs(deg - STATION[best - 1])) best = i + 1;
    });
    return best;
  };
  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    hover = true;
    setOpen();
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    hover = false;
    setOpen();
  };
  const down = (e: PointerEvent) => {
    if (story.getState().phase !== 'ready') return;
    // on a touch screen the first tap opens it; dragging is for when it is open
    if (e.pointerType === 'touch' && !open) {
      touchOpen = true;
      setOpen();
      e.preventDefault();
      return;
    }
    if ((e.target as HTMLElement).closest('.tuner-display') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!safeToTurn()) return;
    e.preventDefault();
    drag = { id: e.pointerId };
    dragged = false;
    body.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    setOpen();
    move(e);
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = degAt(e.clientY);
    if (Math.abs(d - markDeg) > 1) dragged = true;
    markDeg = d;
    preview = nearest(d);
    showTitle(preview, preview !== active);
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    root.classList.remove('is-dragging');
    if (body.hasPointerCapture(e.pointerId)) body.releasePointerCapture(e.pointerId);
    const n = preview || nearest(markDeg);
    // (the marker eases onto the station by itself; the chapter changes once the transition cuts)
    if (dragged) commit(n);
    else if (!pendingUntil) preview = 0;
    window.setTimeout(() => (dragged = false), 0);
    setOpen();
  };
  // a tap elsewhere closes it on a touch screen
  const outside = (e: PointerEvent) => {
    if (touchOpen && !root.contains(e.target as Node)) {
      touchOpen = false;
      setOpen();
    }
  };
  const focusIn = () => {
    focused = true;
    setOpen();
  };
  const focusOut = (e: FocusEvent) => {
    if (root.contains(e.relatedTarget as Node)) return;
    focused = false;
    setOpen();
  };
  // nothing here clicks through to the page (the page's click goes to the next beat)
  const swallow = (e: MouseEvent) => e.stopPropagation();

  body.addEventListener('pointerenter', enter);
  body.addEventListener('pointerleave', leave);
  body.addEventListener('pointerdown', down);
  body.addEventListener('pointermove', move);
  body.addEventListener('pointerup', up);
  body.addEventListener('pointercancel', up);
  body.addEventListener('click', swallow);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', layout);
  layout();
  showTitle(active, false);

  // --- each frame (from the overlay) -------------------------------------------------------
  const update = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const n = chapterNow();
    if (n !== active) {
      active = n;
      preview = 0;
      pendingUntil = 0;
    }
    if (!drag && pendingUntil && now > pendingUntil && !chapterTurn.busy) {
      preview = 0;
      pendingUntil = 0;
    }
    if (!drag && !preview) showTitle(active, false);
    // the marker: the user's while dragging; otherwise it eases onto the chapter's station (or the one let go on)
    if (!drag) {
      const to = STATION[(preview || active) - 1];
      markDeg += (to - markDeg) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
      if (Math.abs(to - markDeg) < 0.02) markDeg = to;
    }
    // open and closed, eased on the clock
    const target = open ? 1 : 0;
    if (openK !== target) {
      openK = target > openK ? Math.min(1, openK + (reduced ? 1 : dt / 0.42)) : Math.max(0, openK - (reduced ? 1 : dt / 0.36));
    }
    const e = openK * openK * (3 - 2 * openK);
    const hidden = (W - SHOW) * s;
    body.style.transform = `translateX(${(hidden * (1 - e) - 16 * e).toFixed(1)}px) scale(${s})`;
    root.style.setProperty('--open', e.toFixed(3));

    // the marker and its line
    const [mx, my] = pt(MARK_R, markDeg);
    marker.setAttribute('transform', `translate(${mx.toFixed(2)} ${my.toFixed(2)}) rotate(${(-markDeg * 0.6).toFixed(2)})`);
    ind.setAttribute('transform', `translate(0 ${my.toFixed(2)})`);
    leftDash.setAttribute('x2', (mx - 32).toFixed(1));
    const right = pt(R - 50, markDeg)[0];
    rightDash.setAttribute('x1', (mx + 30).toFixed(1));
    rightDash.setAttribute('x2', (right - 10).toFixed(1));
    tri2.setAttribute('d', `M${(right - 2).toFixed(1)} -4 L${(right - 8).toFixed(1)} 0 L${(right - 2).toFixed(1)} 4 Z`);
    num.setAttribute('x', (right + 4).toFixed(1));
    const station = drag || preview ? preview || active : active;
    num.textContent = pad(station);
    tailDash.setAttribute('x1', (right + 28).toFixed(1));
    tailDash.setAttribute('x2', (right + 40).toFixed(1));
    // the stations: the current one red; the previewed one marked
    for (let i = 0; i < 3; i++) {
      const cur = i + 1 === active;
      const pre = (drag || preview) && i + 1 === (preview || active) && !cur;
      stationTicks[i].classList.toggle('is-on', cur);
      labels[i].classList.toggle('is-on', cur);
      labels[i].classList.toggle('is-preview', !!pre);
      buttons[i].setAttribute('aria-current', cur ? 'true' : 'false');
    }
    // the progress light along the dotted track
    const p = progressAngle(active);
    const count = dotDeg.findIndex((d) => d > p);
    const upto = count < 0 ? dotDeg.length : count;
    if (upto !== lit) {
      lit = upto;
      dots.forEach((c, i) => c.classList.toggle('is-lit', i < upto && dotDeg[i] >= STATION[0] - 4));
    }
  };

  tuner = {
    root,
    update,
    backdrop: () => openK * openK * (3 - 2 * openK),
    dispose() {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', layout);
      root.remove();
      tuner = null;
    },
  };
  return () => tuner?.dispose();
}
