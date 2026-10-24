import { CHAPTERS, chapterOf } from '../core/chapters';
import { story } from '../core/store';
import { chapterEnds, chapterStarts, chapterTurn, locate, scriptOwnsScroll, timeline } from '../core/timeline';
import { letter } from '../scenes/city/letter';
import { monitor } from '../scenes/home/monitor';
import { goToChapter } from './chapterTransition';
import { decodeIn } from './decode';
import { RED } from './palette';

/**
 * The chapter selector (Figma "Drunkfurt-progress", the selector frame,
 * 491 × 429): a circular scale at the right edge of the page, most of it
 * beyond the edge.
 *
 *  - The scale: long white ticks (the outer circle, r 214.5, 26 px long, 81 of
 *    them, 4.44° apart) and short grey ones (an inner ring of dots, r 190.5,
 *    every 2°), on one centre, faded towards the top and bottom (the design's
 *    gradient, which stays put while the scale turns). Three chapter markers
 *    on it, 120° apart (both tick counts divide 120° exactly, so every marker
 *    sits on a tick): a longer tick, red for the chapter you are in. The
 *    chapter numbers ride along with their markers (see `labelAt`).
 *  - Fixed, horizontal, never turning: the selection frame (59 × 58, r 5) on
 *    the horizontal axis through the scale's centre, the two ◂ marks and the
 *    red dashes on that axis, and, opened, the white title pill beside it
 *    (JetBrains Mono 24, padding 20, sized to the title).
 *
 * The turn is the scroll's, not a clock's: `position` maps the progress to a
 * chapter position (1 at chapter 1's opening shot, 2 at chapter 2's, 3 at
 * chapter 3's; in between, linearly through the chapter up to where its
 * transition begins), and the scale turns 120° per unit, so a chapter's
 * marker is on the axis exactly when that chapter opens. Going forward the
 * markings move down past the frame (the next chapter comes from above);
 * back, up. A chapter transition is a cut in the progress, so the angle shown
 * closes on the scroll's over a fraction of a second instead of jumping. The
 * number and the title are the chapter's own (`locate`): they change when the
 * scene does, decoding.
 *
 * Pointer over it: it slides in to show the title (the page behind dims and
 * breaks into pixels). Dragging up and down turns the scale (the scroll's
 * angle is left alone meanwhile); the chapter whose marker passes the frame
 * is previewed; let go and it snaps to that marker and, if it is another
 * chapter, goes there through the chapter transition (goToChapter). The
 * current chapter is never restarted; nothing turns it while a transition,
 * a scripted beat, the open letter or the flight into the screen runs.
 */

/** The design frame and its geometry (Figma px). */
const F = { w: 491, h: 429 };
const C = { x: 276.5, y: 214.5 };
const OUTER = { r: 214.5, len: 26, count: 81 };
const INNER = { r: 190.5, len: 4, step: 2 };
const STEP = 120;
const BOX = { x: 33, y: 186, w: 59, h: 58, r: 5 };
const PILL = { x: 132, h: 58, pad: 20, font: 24, adv: 0.6 };
/** How much shows: compact (the design's first frame), and open (up to the pill and a margin). */
const SHOW = { compact: 102, margin: 32 };
/** The numbers: on a circle round the same centre, at a third of their marker's angle (so the neighbours show), tilted with it. */
const LABEL = { r: 260, squeeze: 37 / STEP, below: 3.7, tilt: 0.62 };
const TITLES = ['THE ARRIVAL', 'NO WELCOME', 'THE CAVE'];
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
  // the design's fade, top to bottom over the circle (it stays put while the scale turns)
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
  // the chapters' markers: chapter n's at (n - 1) · 120° (the next one above the axis at the start; forward, they move down)
  const markers = CHAPTERS.map((_, i) => tick(INNER.r - INNER.len / 2, OUTER.r + OUTER.len / 2, i * STEP, 'mkr'));

  // fixed: the frame, the ◂ marks and the red dashes on the axis
  el('rect', { x: BOX.x + 0.5, y: BOX.y + 0.5, width: BOX.w - 1, height: BOX.h - 1, rx: BOX.r, class: 'box' }, svg);
  el('path', { d: 'M4 214.5 L8 212 L8 217 Z', class: 'tri' }, svg);
  el('path', { d: 'M95.5 214.5 L99.5 212 L99.5 217 Z', class: 'tri' }, svg);
  el('rect', { x: 12, y: 214, width: 13, height: 1, fill: RED }, svg);
  el('rect', { x: 81, y: 214, width: 7, height: 1, fill: RED }, svg);
  // the numbers (horizontal text, placed by `labelAt`)
  const labels = CHAPTERS.map((_, i) => {
    const t = el('text', { class: 'lb', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
    t.textContent = String(i + 1);
    return t;
  });
  body.append(svg);

  // the title pill, beside the frame on the axis
  const pill = document.createElement('div');
  pill.className = 'tuner-pill';
  const title = document.createElement('span');
  title.className = 'tuner-title';
  title.setAttribute('aria-live', 'polite');
  pill.append(title);
  body.append(pill);

  // for the keyboard and screen readers: the chapters as buttons (shown when focused)
  const keys = document.createElement('div');
  keys.className = 'tuner-keys';
  const buttons = CHAPTERS.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${String(c.number).padStart(2, '0')} — ${TITLES[i]}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      commit(i + 1);
    });
    keys.append(b);
    return b;
  });
  root.append(keys);
  document.body.append(root);

  // --- state -------------------------------------------------------------------------------
  let active = chapterNow();
  /** The position shown (chapter units), and the one the scroll asks for. */
  let shownPos = position();
  let hover = false;
  let touchOpen = false;
  let focused = false;
  let open = false;
  let openK = 0;
  let drag: { id: number; y0: number; pos0: number; moved: boolean } | null = null;
  /** After a drag: the position it snapped to, held until the chapter changes (or it is clear it will not). */
  let held: { pos: number; until: number } | null = null;
  let titleOf = 0;
  let s = 1;
  let last = performance.now();

  const layout = () => {
    s = clamp(Math.min(window.innerWidth / 1920, window.innerHeight / 1080), 0.62, 1.25);
    root.style.setProperty('--s', String(s));
  };
  const showTitle = (n: number, previewing: boolean) => {
    const key = n * 2 + (previewing ? 1 : 0);
    if (key === titleOf) return;
    titleOf = key;
    const text = TITLES[n - 1];
    title.dataset.text = text;
    // the pill fits the finished title; the decoding swaps characters of the same (monospace) width, so it never resizes on the way
    pill.style.width = `${(text.length * PILL.font * PILL.adv + PILL.pad * 2).toFixed(1)}px`;
    pill.classList.toggle('is-preview', previewing);
    void decodeIn(title, reduced ? 1 : 520, 0, { rise: 0 });
  };
  const setOpen = () => {
    open = hover || touchOpen || focused || !!drag;
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

  // --- pointer --------------------------------------------------------------------------
  /** Degrees of turn per px dragged along the rim, near the axis. */
  const perPx = () => 1 / (OUTER.r * s * rad);
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
    if ((e.target as HTMLElement).closest('.tuner-pill') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!safeToTurn()) return;
    e.preventDefault();
    held = null;
    drag = { id: e.pointerId, y0: e.clientY, pos0: shownPos, moved: false };
    body.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
    setOpen();
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (Math.abs(dy) > 3) drag.moved = true;
    // down moves the markings down: towards the next chapter, as scrolling forward does
    shownPos = clamp(drag.pos0 + (dy * perPx()) / STEP, 1, CHAPTERS.length);
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    root.classList.remove('is-dragging');
    if (body.hasPointerCapture(e.pointerId)) body.releasePointerCapture(e.pointerId);
    if (moved) {
      const n = Math.round(shownPos);
      // it settles onto that marker, and stays there until the transition brings that chapter in
      held = { pos: n, until: performance.now() + 6000 };
      if (n !== chapterNow()) commit(n);
      else held = null;
    }
    setOpen();
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
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', layout);
  layout();
  showTitle(active, false);

  /** Where a chapter's number stands: on its circle at a third of its marker's angle (`rel`, degrees above the axis), tilted with it, fading out beyond the neighbours. */
  const labelAt = (t: SVGTextElement, rel: number, isActive: boolean, isPreview: boolean) => {
    const a = Math.abs(rel);
    const deg = rel * LABEL.squeeze - LABEL.below * Math.max(0, 1 - a / STEP);
    const [x, y] = at(LABEL.r, deg);
    t.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(-deg * LABEL.tilt).toFixed(2)})`);
    const o = a <= STEP ? 1 - 0.5 * (a / STEP) : 0.5 * Math.max(0, 1 - (a - STEP) / 60);
    t.style.opacity = o.toFixed(3);
    t.classList.toggle('is-on', isActive);
    t.classList.toggle('is-preview', isPreview);
  };

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
    if (held && now > held.until && !chapterTurn.busy) held = null;
    // the angle: the scroll's (or the snapped one after a drag), closing over cuts; the user's while dragging
    if (!drag) {
      const want = held ? held.pos : position();
      shownPos += (want - shownPos) * (reduced ? 1 : 1 - Math.exp(-dt * 9));
      if (Math.abs(want - shownPos) < 1e-4) shownPos = want;
    }
    const turn = (shownPos - 1) * STEP;
    // forward, the scale turns so the markings move down on the left: the next marker (above) comes to the axis
    scale.setAttribute('transform', `rotate(${(-turn).toFixed(3)} ${C.x} ${C.y})`);
    // the previewed chapter: the marker nearest the frame while dragging (or held there)
    const preview = drag ? Math.round(shownPos) : held ? held.pos : 0;
    for (let i = 0; i < 3; i++) {
      // (three markers round a circle: the one 240° on is the one 120° back)
      let rel = (i + 1 - shownPos) * STEP;
      rel = ((((rel + 180) % 360) + 360) % 360) - 180;
      markers[i].classList.toggle('is-on', i + 1 === active);
      labelAt(labels[i], rel, i + 1 === active, !!preview && i + 1 === preview && preview !== active);
      buttons[i].setAttribute('aria-current', i + 1 === active ? 'true' : 'false');
    }
    showTitle(preview && preview !== active ? preview : active, !!preview && preview !== active);

    // open and closed, eased on the clock
    const target = open ? 1 : 0;
    if (openK !== target)
      openK = target > openK ? Math.min(1, openK + (reduced ? 1 : dt / 0.42)) : Math.max(0, openK - (reduced ? 1 : dt / 0.36));
    const e = openK * openK * (3 - 2 * openK);
    const pillW = parseFloat(pill.style.width) || 0;
    const show = SHOW.compact + (PILL.x + pillW + SHOW.margin - SHOW.compact) * e;
    body.style.transform = `translateX(${(-show * s).toFixed(1)}px) scale(${s})`;
    root.style.setProperty('--open', e.toFixed(3));
  };

  tuner = {
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
