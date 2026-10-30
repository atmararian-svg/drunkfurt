import heroUrl from '../assets/hero.webp';
import { decodeAll, splitChars } from './decode';

/**
 * The two text boxes of the page (Figma "Drunkfurt-text-boxes", frame
 * "text-boxes+person", 1920 × 1080), drawn at the design's own size:
 *
 *  - his thoughts, bottom right: the narrator's face (249 × 310, in the
 *    corner) and beside it a white box, 12 px JetBrains Mono capitals, with
 *    its print out of register (blue 2 px up and left, red 2 px down and
 *    right, black in the two corners between). One box for every thought of
 *    the story: while one follows another the box stays and its words change
 *    by decoding; with none for a moment, face and box go;
 *  - the system's tips, bottom left: when there is something to do (pick up
 *    the letter, click the screen): ACTION and the tip in a white box, a black
 *    bar under them filling from nothing in TIP_S seconds, then it goes.
 *
 * Both come in through pixels (an SVG filter, coarse blocks resolving to
 * sharp, as ACTION and the chapter turns do) and go out the same way. The
 * words decode in as a box arrives: they start when it is 80 % of the way
 * sharp and settle a little after it is (DECODE_AFTER).
 *
 * `updateTextBoxes` is called every frame by the overlay with the thought and
 * the tip that hold at this point of the story (or null), and whether the
 * page is busy with something else (a prompt to act, the letter, a chapter
 * turn): then both keep out of the way.
 */
export interface BoxLine {
  /** Which caption this is (a new key is a new line). */
  key: string;
  text: string;
  kicker?: string;
}

const PIX = { in: 0.55, out: 0.4, block: 22 };
/** The words decode from 80 % of the way in until this long after the box is sharp (s). */
const DECODE_AFTER = 0.55;
/** A tip's bar fills in this long (s), then the tip goes. */
export const TIP_S = 5;
/** With no thought for this long (s), face and box go (a quick gap between two thoughts keeps them). */
const THOUGHT_GRACE = 0.9;

const ease = (u: number) => u * u * (3 - 2 * u);

/** A pixelating SVG filter for one element: `set(block)`, 1 for none. */
function pixelFilter(defs: SVGDefsElement, id: string) {
  const NS = 'http://www.w3.org/2000/svg';
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.setAttribute('width', '1');
  f.setAttribute('height', '1');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const flood = document.createElementNS(NS, 'feFlood');
  flood.setAttribute('width', '1');
  flood.setAttribute('height', '1');
  const cell = document.createElementNS(NS, 'feComposite');
  const tile = document.createElementNS(NS, 'feTile');
  tile.setAttribute('result', 'grid');
  const pick = document.createElementNS(NS, 'feComposite');
  pick.setAttribute('in', 'SourceGraphic');
  pick.setAttribute('in2', 'grid');
  pick.setAttribute('operator', 'in');
  const grow = document.createElementNS(NS, 'feMorphology');
  grow.setAttribute('operator', 'dilate');
  f.append(flood, cell, tile, pick, grow);
  defs.append(f);
  let last = -1;
  return (el: HTMLElement, block: number) => {
    const b = Math.max(1, Math.round(block));
    if (b === last) return;
    last = b;
    if (b <= 1) {
      el.style.filter = '';
      return;
    }
    const half = Math.floor(b / 2);
    flood.setAttribute('x', String(half));
    flood.setAttribute('y', String(half));
    cell.setAttribute('width', String(b));
    cell.setAttribute('height', String(b));
    grow.setAttribute('radius', String(b / 2));
    el.style.filter = `url(#${id})`;
  };
}

type Phase = 'hidden' | 'in' | 'shown' | 'out';

/** One box's coming and going: pixels and opacity over time, the words decoding in on the way. */
function presence(el: HTMLElement, pix: (el: HTMLElement, b: number) => void, delay = 0) {
  let phase: Phase = 'hidden';
  let t0 = 0;
  let decoding: HTMLElement[] = [];
  let decoded = false;
  const apply = (block: number, alpha: number) => {
    pix(el, block);
    el.style.opacity = alpha.toFixed(3);
    el.style.visibility = alpha > 0.001 ? 'visible' : 'hidden';
  };
  apply(PIX.block, 0);
  return {
    get phase() {
      return phase;
    },
    /** Comes in (the words in `texts` decode in on the way). */
    show(now: number, texts: HTMLElement[]) {
      if (phase === 'in' || phase === 'shown') return;
      phase = 'in';
      t0 = now + delay * 1000;
      decoding = texts;
      decoded = false;
      texts.forEach((t) => (t.style.visibility = 'hidden'));
    },
    hide(now: number) {
      if (phase === 'hidden' || phase === 'out') return;
      phase = 'out';
      t0 = now;
    },
    frame(now: number) {
      const s = (now - t0) / 1000;
      if (phase === 'in') {
        const u = Math.max(0, Math.min(1, s / PIX.in));
        apply(1 + (PIX.block - 1) * (1 - ease(u)), Math.min(1, u / 0.35));
        if (!decoded && u >= 0.8) {
          decoded = true;
          const ms = (PIX.in * 0.2 + DECODE_AFTER) * 1000;
          decoding.forEach((t) => {
            t.style.visibility = '';
            void decodeAll(t, ms);
          });
        }
        if (u >= 1) phase = 'shown';
      } else if (phase === 'out') {
        const u = Math.max(0, Math.min(1, s / PIX.out));
        apply(1 + (PIX.block - 1) * ease(u), 1 - ease(u));
        if (u >= 1) phase = 'hidden';
      }
    },
  };
}

export function mountTextBoxes(host: HTMLElement) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const defs = document.createElementNS(NS, 'defs');
  svg.append(defs);

  // his thoughts: the face in the corner and the box beside it
  const face = document.createElement('img');
  face.className = 'hero-face';
  face.src = heroUrl;
  face.alt = '';
  face.decoding = 'async';
  const box = document.createElement('div');
  box.className = 'hero-box';
  box.setAttribute('role', 'status');
  const kicker = document.createElement('span');
  kicker.className = 'hero-kicker';
  const text = document.createElement('p');
  text.className = 'hero-text';
  box.append(kicker, text);

  // the system's tip
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  const row = document.createElement('div');
  row.className = 'tip-row';
  const label = document.createElement('span');
  label.className = 'tip-label';
  label.dataset.text = 'ACTION';
  const tipText = document.createElement('p');
  tipText.className = 'tip-text';
  row.append(label, tipText);
  const bar = document.createElement('div');
  bar.className = 'tip-bar';
  const fill = document.createElement('i');
  bar.append(fill);
  tip.append(row, bar);

  host.append(svg, face, box, tip);
  const faceP = presence(face, pixelFilter(defs, 'df-px-face'));
  const boxP = presence(box, pixelFilter(defs, 'df-px-thought'), 0.12);
  const tipP = presence(tip, pixelFilter(defs, 'df-px-tip'));

  let thoughtKey = '';
  let lastThought = 0;
  let tipKey = '';
  let tipDone = '';
  let tipStart = 0;

  const setLine = (el: HTMLElement, value: string) => {
    el.dataset.text = value;
    el.textContent = '';
    if (value) splitChars(el);
    el.style.display = value ? '' : 'none';
  };

  const update = (thought: BoxLine | null, tipLine: BoxLine | null, busy: boolean, now = performance.now()) => {
    // --- his thoughts
    const want = busy ? null : thought;
    if (want) {
      lastThought = now;
      if (want.key !== thoughtKey) {
        const fresh = boxP.phase === 'hidden' || boxP.phase === 'out';
        thoughtKey = want.key;
        setLine(kicker, want.kicker ?? '');
        setLine(text, want.text);
        if (fresh) {
          faceP.show(now, []);
          boxP.show(now, [kicker, text].filter((t) => t.dataset.text));
        } else {
          // one thought after another: the box stays, its words change by decoding
          if (kicker.dataset.text) void decodeAll(kicker, 600);
          void decodeAll(text, 700);
        }
      }
    } else if (thoughtKey && (busy || now - lastThought > THOUGHT_GRACE * 1000)) {
      thoughtKey = '';
      faceP.hide(now);
      boxP.hide(now);
    }
    // --- the tip: once per time it holds; its bar runs, then it goes
    const tipWant = busy ? null : tipLine;
    // (a tip that ran its course stays gone until it no longer holds: next time it holds, it comes again)
    if (tipDone && tipWant?.key !== tipDone) tipDone = '';
    if (tipWant && tipWant.key !== tipKey && tipWant.key !== tipDone) {
      tipKey = tipWant.key;
      setLine(tipText, tipWant.text);
      splitChars(label);
      tipP.show(now, [label, tipText]);
      tipStart = now + PIX.in * 1000;
      fill.style.transform = 'scaleX(0)';
    }
    if (tipKey) {
      const u = Math.max(0, Math.min(1, (now - tipStart) / (TIP_S * 1000)));
      fill.style.transform = `scaleX(${u.toFixed(4)})`;
      if (!tipWant || tipWant.key !== tipKey || u >= 1) {
        if (u >= 1 && tipWant?.key === tipKey) tipDone = tipKey;
        tipKey = '';
        tipP.hide(now);
      }
    }
    faceP.frame(now);
    boxP.frame(now);
    tipP.frame(now);
  };

  return {
    update,
    dispose() {
      svg.remove();
      face.remove();
      box.remove();
      tip.remove();
    },
  };
}
