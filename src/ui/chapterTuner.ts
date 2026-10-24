import { CHAPTERS, chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { chapterEnds, chapterStarts, chapterTurn, locate, scriptOwnsScroll, timeline } from '../core/timeline';
import { letter } from '../scenes/city/letter';
import { monitor } from '../scenes/home/monitor';
import { goToChapter } from './chapterTransition';
import { decodeIn, splitChars } from './decode';
import { RED } from './palette';

/**
 * The chapter selector (Figma "Drunkfurt-selector": Selector-default, the
 * compact state, and Selector-1/2/3, open; the selector frame is 513 × 429).
 *
 *  - The scale, on one centre: long white ticks (the outer circle, r 214.5,
 *    26 px, 81 ticks, 4.44° apart) and short grey ones (r 190.5, every 2°),
 *    faded top and bottom by the design's gradient (which stays put). Three
 *    chapter markers on it, 120° apart (both tick counts divide 120°): longer
 *    ticks, red for the chapter you are in. The neighbours' names (CH.2, CH.3)
 *    ride with their markers, tilted, at half strength, as in the design.
 *  - Fixed and horizontal: the selection frame on the axis (59 × 58, r 5), the
 *    ◂ and the red dash in it, and to its left the current chapter's title
 *    (◂ CHAPTER ONE, decoding to CH.1 after two seconds, on every entry into a
 *    chapter), and to the right, opened, the chapter tabs: a frosted panel
 *    (157 × 50, white 20 %, blurred) clipping a strip of three tabs (ARRIVAL,
 *    NO WELCOME, THE CAVE) that slides with the pointer's position across the
 *    panel, so the clipped ones come into view.
 *
 * One source of truth: the chapter is the scroll's (`locate(timeline
 * .progress)`); the scale, the title, the tabs and the markers all read it,
 * every frame, from the overlay's loop. Any choice (drag, wheel, a click on a
 * name, a tab, the keyboard) goes through `goToChapter`, the chapter
 * transition, which moves the scroll; the rest follows from that.
 *
 * The turn is the scroll's: `position(p)` is 1 at chapter 1's opening shot, 2
 * at chapter 2's, 3 at chapter 3's, linear through a chapter up to where its
 * transition begins; the scale turns 120° per unit, the markings moving down
 * past the frame going forward. A transition is a cut in the progress, so the
 * angle shown closes on it over a fraction of a second.
 *
 * Open (pointer over it, a first tap on a touch screen, keyboard focus): it
 * slides in to the open frame and the page behind dims and pixelates. Drag up
 * and down, or the wheel / trackpad over it, turns the scale meanwhile (the
 * scroll's angle is left alone); it snaps to the nearest chapter and, if that
 * is another, goes there. Nothing turns it while a transition, a scripted
 * beat, the open letter or the flight into the screen runs.
 */

/** The design frame and its geometry (Figma px). */
const F = { w: 513, h: 429 };
const C = { x: 298.5, y: 214.5 };
const OUTER = { r: 214.5, len: 26, count: 81 };
const INNER = { r: 190.5, len: 4, step: 2 };
const STEP = 120;
const BOX = { x: 55, y: 186, w: 59, h: 58, r: 5 };
/** The current chapter's title: right-aligned 11 px left of the frame, JetBrains Mono 12, ◂ 11 px before it. */
const TITLE = { right: 44 };
const PANEL = { x: 154, y: 190, w: 157, h: 50, inset: 4 };
/** How much shows: compact (Selector-default), and open (Selector-1). */
const SHOW = { compact: 124, open: 323 };
/** The neighbours' names: on a circle round the centre at 0.3 of their marker's angle (36° at 120°), tilted with it. */
const LABEL = { r: 272.5, squeeze: 36 / STEP, tilt: 23 / 36 };
const NAMES = ['ONE', 'TWO', 'THREE'];
const TABS = ['ARRIVAL', 'NO WELCOME', 'THE CAVE'];
/** How long the full title stands before it decodes to CH.n (ms). */
const FULL_MS = 2000;
/** Drag: degrees of turn per px of drag (a third of a turn in about 150 px at full size). */
const DRAG_DEG_PER_PX = 0.8;
/** Wheel / trackpad: px of scroll for one chapter, and the quiet time that ends a gesture (ms). */
const WHEEL = { perChapter: 240, settle: 300 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rad = Math.PI / 180;
const SVG = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent?: Element) => {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
};
/** A point on a circle round the centre: `deg` above the horizontal axis on the left (screen y down). */
const at = (r: number, deg: number) => [C.x - r * Math.cos(deg * rad), C.y - r * Math.sin(deg * rad)] as const;
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

const chapterNow = () => chapterOf(locate(timeline.progress).id).number;
const safeToTurn = () =>
  story.getState().phase === 'ready' && !chapterTurn.busy && !scriptOwnsScroll() && !letter.open && !monitor.entering;

/**
 * The scroll's chapter position: 1 … 3, a chapter's number at its opening
 * shot, rising linearly through it to the next number where its transition
 * begins (the last chapter stays at 3).
 */
export function position(p = timeline.progress) {
  const starts = chapterStarts();
  const ends = chapterEnds();
  let n = 1;
  for (let i = 0; i < starts.length; i++) if (p >= starts[i] - 1e-6) n = i + 1;
  if (n >= CHAPTERS.length) return CHAPTERS.length;
  return n + clamp((p - starts[n - 1]) / Math.max(1e-6, ends[n - 1] - starts[n - 1]), 0, 1);
}

interface Tuner {
  update(): void;
  backdrop(): number;
  dispose(): void;
}
let tuner: Tuner | null = null;

/** Called every frame by the overlay (no loop of its own). */
export function updateTuner() {
  tuner?.update();
}
/** How open the selector is (0 … 1, eased): the page behind it dims and pixelates by this much. */
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

  // --- the drawing ---------------------------------------------------------------------
  const svg = el('svg', { class: 'tuner-scale', viewBox: `0 0 ${F.w} ${F.h}`, width: F.w, height: F.h, 'aria-hidden': 'true' });
  const defs = el('defs', {}, svg);
  const fade = el('linearGradient', { id: 'tuner-fade', gradientUnits: 'userSpaceOnUse', x1: 0, y1: C.y - OUTER.r, x2: 0, y2: C.y + OUTER.r }, defs);
  for (const [o, a] of [
    [0, 0],
    [0.303, 0.5],
    [0.399, 0.7],
    [0.503, 1],
    [0.6, 0.7],
    [0.702, 0.5],
    [1, 0],
  ])
    el('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a }, fade);
  const mask = el('mask', { id: 'tuner-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: F.w, height: F.h }, defs);
  el('rect', { x: 0, y: 0, width: F.w, height: F.h, fill: 'url(#tuner-fade)' }, mask);
  // the page behind it, pixelated (its printed matter: the scene has its own pixel layer)
  const pix = el('filter', { id: 'df-pixelate', x: 0, y: 0, width: 1, height: 1 }, defs);
  el('feFlood', { x: 3, y: 3, width: 1, height: 1 }, pix);
  el('feComposite', { width: 7, height: 7 }, pix);
  el('feTile', { result: 'grid' }, pix);
  el('feComposite', { in: 'SourceGraphic', in2: 'grid', operator: 'in' }, pix);
  el('feMorphology', { operator: 'dilate', radius: 3.5 }, pix);

  // the scale: one group, turned as a whole round the centre
  const faded = el('g', { mask: 'url(#tuner-mask)' }, svg);
  const scale = el('g', {}, faded);
  const tick = (r0: number, r1: number, deg: number, cls: string) => {
    const [x1, y1] = at(r0, deg);
    const [x2, y2] = at(r1, deg);
    return el('line', { x1: x1.toFixed(3), y1: y1.toFixed(3), x2: x2.toFixed(3), y2: y2.toFixed(3), class: cls }, scale);
  };
  for (let i = 0; i < OUTER.count; i++) {
    const deg = (360 / OUTER.count) * i;
    // (the markers' own ticks are drawn below, over these)
    if (Math.abs(((deg + 60) % STEP) - 60) < 1e-6) continue;
    tick(OUTER.r - OUTER.len / 2, OUTER.r + OUTER.len / 2, deg, 'tk');
  }
  for (let deg = 0; deg < 360; deg += INNER.step) tick(INNER.r - INNER.len / 2, INNER.r + INNER.len / 2, deg, 'dt');
  // chapter n's marker at (n - 1) · 120°: the next one above the axis at the start; forward, they move down
  const markers = CHAPTERS.map((_, i) => tick(INNER.r - INNER.len / 2, OUTER.r + OUTER.len / 2, i * STEP, 'mkr'));

  // fixed: the frame, its ◂ and the red dash in it
  el('rect', { x: BOX.x + 0.5, y: BOX.y + 0.5, width: BOX.w - 1, height: BOX.h - 1, rx: BOX.r, class: 'box' }, svg);
  el('path', { d: 'M117.5 214.5 L121.5 212 L121.5 217 Z', class: 'tri' }, svg);
  el('rect', { x: 103, y: 214, width: 7, height: 1, fill: RED }, svg);
  // the neighbours' names on the scale (clickable: a direct choice)
  const names = CHAPTERS.map((_, i) => {
    const t = el('text', { class: 'lb', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
    t.textContent = `CH.${i + 1}`;
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      commit(i + 1);
    });
    return t;
  });
  body.append(svg);

  // the current chapter's title, left of the frame (HTML, for the decoding)
  const head = document.createElement('div');
  head.className = 'tuner-head';
  head.style.right = `${F.w - TITLE.right}px`;
  const title = document.createElement('span');
  title.className = 'tuner-title';
  title.setAttribute('aria-live', 'polite');
  head.append(title);
  body.append(head);

  // the chapter tabs: a frosted panel clipping a strip of three tabs
  const panel = document.createElement('div');
  panel.className = 'tuner-tabs';
  const strip = document.createElement('div');
  strip.className = 'tuner-strip';
  const tabs = TABS.map((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tuner-tab';
    b.textContent = name;
    b.setAttribute('aria-label', `Chapter ${i + 1}: ${name}`);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      commit(i + 1);
    });
    b.addEventListener('keydown', (e) => {
      const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!k) return;
      e.preventDefault();
      tabs[clamp(i + k, 0, 2)].focus();
    });
    strip.append(b);
    return b;
  });
  panel.append(strip);
  body.append(panel);
  document.body.append(root);

  // --- state -------------------------------------------------------------------------------
  let active = chapterNow();
  /** The chapter whose entry the title last announced (0: none yet). */
  let entered = 0;
  let titleTimer = 0;
  let shownPos = position();
  let hover = false;
  let touchOpen = false;
  let focused = false;
  let open = false;
  let openK = 0;
  /** Direct input (a drag, or a wheel / trackpad gesture): the position it asks for, in chapter units. */
  let drag: { id: number; y0: number; pos0: number; moved: boolean } | null = null;
  let wheel: { base: number; acc: number; timer: number } | null = null;
  /** After a choice: the chapter it settled on, held until the scene changes (or it is clear it will not). */
  let held: { pos: number; until: number } | null = null;
  let stripTo = PANEL.inset;
  let stripAt = PANEL.inset;
  let s = 1;
  let last = performance.now();

  const layout = () => {
    s = clamp(Math.min(window.innerWidth / 1920, window.innerHeight / 1080), 0.62, 1.25);
    root.style.setProperty('--s', String(s));
  };
  /** A chapter entered: its full title at once, then (unless another is entered first) decoded to CH.n. */
  const announce = (n: number) => {
    window.clearTimeout(titleTimer);
    title.dataset.text = `CHAPTER ${NAMES[n - 1]}`;
    splitChars(title);
    titleTimer = window.setTimeout(() => {
      if (entered !== n) return;
      title.dataset.text = `CH.${n}`;
      void decodeIn(title, reduced ? 1 : 520, 0, { rise: 0 });
    }, FULL_MS);
  };
  const setOpen = () => {
    open = hover || touchOpen || focused || !!drag || !!wheel;
    root.classList.toggle('is-open', open);
  };
  const commit = (n: number) => {
    if (n === chapterNow() || !safeToTurn()) {
      held = null;
      return;
    }
    held = { pos: n, until: performance.now() + 6000 };
    goToChapter(n);
  };

  // --- pointer: open, drag, the strip ---------------------------------------------------------
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
    if (e.pointerType === 'touch' && !open) {
      // on a touch screen the first tap opens it
      touchOpen = true;
      setOpen();
      e.preventDefault();
      return;
    }
    // the tabs and the names are buttons of their own
    if ((e.target as Element).closest('.tuner-tabs, .lb') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!safeToTurn()) return;
    e.preventDefault();
    held = null;
    drag = { id: e.pointerId, y0: e.clientY, pos0: shownPos, moved: false };
    body.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    setOpen();
  };
  const move = (e: PointerEvent) => {
    // the strip follows the pointer's place across the open panel (anywhere over the selector)
    const r = panel.getBoundingClientRect();
    if (r.width > 0) {
      const f = clamp((e.clientX - r.left) / r.width, 0, 1);
      const room = Math.min(0, PANEL.w - PANEL.inset - strip.offsetWidth);
      stripTo = PANEL.inset + (room - PANEL.inset) * f;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (Math.abs(dy) > 3) drag.moved = true;
    // down moves the markings down: towards the next chapter, as scrolling forward does
    shownPos = clamp(drag.pos0 + (dy / s) * (DRAG_DEG_PER_PX / STEP), 1, CHAPTERS.length);
  };
  const settle = (to: number) => {
    const n = clamp(Math.round(to), 1, CHAPTERS.length);
    held = { pos: n, until: performance.now() + 6000 };
    if (n !== chapterNow()) commit(n);
    else held = null;
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    root.classList.remove('is-dragging');
    if (body.hasPointerCapture(e.pointerId)) body.releasePointerCapture(e.pointerId);
    if (moved) settle(shownPos);
    setOpen();
  };
  /**
   * Wheel and trackpad over the selector (never the page's scroll there): one
   * gesture moves at most one chapter. A wheel's notch is a whole step; a
   * trackpad's stream turns the scale in proportion, up to one chapter, and
   * when it goes quiet the scale settles on the nearest one.
   */
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (story.getState().phase !== 'ready' || drag || !safeToTurn()) return;
    const notch = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (!wheel) {
      held = null;
      wheel = { base: Math.round(shownPos), acc: 0, timer: 0 };
      setOpen();
    }
    const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    wheel.acc = notch ? Math.sign(px) * WHEEL.perChapter : clamp(wheel.acc + px, -WHEEL.perChapter, WHEEL.perChapter);
    window.clearTimeout(wheel.timer);
    wheel.timer = window.setTimeout(() => {
      if (!wheel) return;
      const to = wheel.base + wheel.acc / WHEEL.perChapter;
      wheel = null;
      settle(Math.abs(to - Math.round(to)) === 0.5 ? Math.round(to) : to);
      setOpen();
    }, notch ? WHEEL.settle * 1.6 : WHEEL.settle);
  };
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
  body.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', layout);
  layout();

  // --- each frame -------------------------------------------------------------------------
  const update = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const n = chapterNow();
    if (n !== active) {
      active = n;
      held = null;
    }
    // a chapter entered (after the preloader, forwards, back or by a jump): its full title, then CH.n; once per entry
    if (entered !== active && story.getState().phase === 'ready' && !document.documentElement.classList.contains('is-preloading')) {
      entered = active;
      announce(active);
    }
    if (held && now > held.until && !chapterTurn.busy) held = null;
    // the angle: the scroll's, or a choice settling, or the gesture's
    if (wheel) {
      const want = wheel.base + wheel.acc / WHEEL.perChapter;
      shownPos += (clamp(want, 1, 3) - shownPos) * (reduced ? 1 : 1 - Math.exp(-dt * 14));
    } else if (!drag) {
      const want = held ? held.pos : position();
      shownPos += (want - shownPos) * (reduced ? 1 : 1 - Math.exp(-dt * 9));
      if (Math.abs(want - shownPos) < 1e-4) shownPos = want;
    }
    // forward, the markings move down on the left: the next marker (above) comes to the axis
    scale.setAttribute('transform', `rotate(${(-(shownPos - 1) * STEP).toFixed(3)} ${C.x} ${C.y})`);
    const preview = drag || wheel ? Math.round(shownPos) : held ? held.pos : 0;
    for (let i = 0; i < 3; i++) {
      markers[i].classList.toggle('is-on', i + 1 === active);
      // the other chapters' names ride with their markers: half strength at their place beside the axis, gone on it and behind
      const rel = wrap180((i + 1 - shownPos) * STEP);
      const a = Math.abs(rel);
      const deg = rel * LABEL.squeeze;
      const [x, y] = at(LABEL.r, deg);
      names[i].setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(deg * LABEL.tilt).toFixed(2)})`);
      const o = i + 1 === active ? 0 : a <= STEP ? 0.5 * clamp((a - 30) / 50, 0, 1) : 0.5 * clamp(1 - (a - STEP) / 60, 0, 1);
      names[i].style.opacity = o.toFixed(3);
      names[i].classList.toggle('is-preview', !!preview && preview === i + 1 && preview !== active);
      tabs[i].classList.toggle('is-on', i + 1 === active);
      tabs[i].classList.toggle('is-preview', !!preview && preview === i + 1 && preview !== active);
      tabs[i].setAttribute('aria-current', i + 1 === active ? 'true' : 'false');
    }

    // open and closed, eased on the clock
    const target = open ? 1 : 0;
    if (openK !== target)
      openK = target > openK ? Math.min(1, openK + (reduced ? 1 : dt / 0.42)) : Math.max(0, openK - (reduced ? 1 : dt / 0.36));
    const e = openK * openK * (3 - 2 * openK);
    const show = SHOW.compact + (SHOW.open - SHOW.compact) * e;
    body.style.transform = `translateX(${(-show * s).toFixed(1)}px) scale(${s})`;
    root.style.setProperty('--open', e.toFixed(3));
    // the tab strip: a slight follow of the pointer's place across the panel
    stripAt += (stripTo - stripAt) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
    strip.style.transform = `translateX(${stripAt.toFixed(1)}px)`;
  };

  tuner = {
    update,
    backdrop: () => openK * openK * (3 - 2 * openK),
    dispose() {
      window.clearTimeout(titleTimer);
      if (wheel) window.clearTimeout(wheel.timer);
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', layout);
      root.remove();
      tuner = null;
    },
  };
  return () => tuner?.dispose();
}
