/**
 * Typed text: the supplied Framer "TypewriterText" component (thoughts typing
 * and the stranger's phrase), ported from React + framer-motion to plain DOM
 * so it can run inside the overlay's own elements without a second React tree.
 *
 * Kept from the original, with its defaults: the phase machine (start delay →
 * typing → pause → deleting → pause → next block), character typing at
 * 45 ms with the smart pauses (comma +140, period +320, ellipsis +520, new
 * line +260), deletion by characters at 30 ms, "lines" and "paragraph"
 * content, the block caret auto-sized to the font (0.62 × 0.82 em) with its
 * opacity fade, the gradient trail on the last three characters that fades to
 * the solid colour when a line is complete ("fade" completion), the stable
 * height (an invisible copy of the longest block reserves the space) and
 * reduced motion (the text shown at once, no caret blink).
 *
 * Changed as asked: the caret blinks at BLINK_MS (1,250 ms per state change,
 * 2.5 × the original 500 ms); the typing speed is unchanged. Colours follow
 * the page: off-white text, the red of "Drunk" for the caret and the trail.
 *
 * It does not loop on its own here: `play` types the blocks in order (deleting
 * each before the next, as the original's "delete" loop style does) and stops
 * on the last one, resolving when it is fully typed; `erase` deletes what is
 * shown, the original's disappearance. Timers are the component's own
 * (setTimeout per character, as in the original); `stop` clears them all.
 */
import { RED } from './palette';

export const BLINK_MS = 1250;

export interface TypewriterOptions {
  /** 'lines': each line is typed, then deleted before the next; 'paragraph': the whole text at once (line breaks kept). */
  content?: 'lines' | 'paragraph';
  startDelay?: number;
  typeSpeed?: number;
  deleteSpeed?: number;
  /** How long a typed block stays before it is deleted (ms); a function of the block, to give long lines time. */
  pauseAfterType?: number | ((text: string) => number);
  pauseAfterDelete?: number;
  /** Reserve the space of the longest block from the start (the original's "stable height"). */
  stableHeight?: boolean;
}

const SMART = { comma: 140, period: 320, ellipsis: 520, line: 260 };
const TRAIL = 3;
/** The trail's gradient, from a light red to the page's red (palette RED), one step per character. */
const TRAIL_COLOURS = ['#e8807a', '#db4a46', RED];

export interface Typewriter {
  /** Types `text` (split into blocks by the content mode); resolves when the last block is fully typed. */
  play(text: string): Promise<void>;
  /** Deletes the shown text character by character; resolves when it is gone. */
  erase(): Promise<void>;
  /** Shows the text at once (reduced motion, or jumping in). */
  show(text: string): void;
  /** Stops every timer and clears the text. */
  stop(): void;
  readonly typing: boolean;
}

/** Delay before the next character, with the original's smart pauses after punctuation. */
function nextDelay(text: string, typed: number, base: number) {
  const prev = text[Math.max(0, typed - 1)] || '';
  const prev3 = text.slice(Math.max(0, typed - 3), typed);
  if (typed === 0) return base;
  if (prev3 === '...') return base + SMART.ellipsis;
  if (prev === '\n') return base + SMART.line;
  if (prev === ',' || prev === ';') return base + SMART.comma;
  if (prev === '.' || prev === '!' || prev === '?') return base + SMART.period;
  return base;
}

export function createTypewriter(host: HTMLElement, opts: TypewriterOptions = {}): Typewriter {
  const o = {
    content: opts.content ?? 'paragraph',
    startDelay: opts.startDelay ?? 400,
    typeSpeed: opts.typeSpeed ?? 45,
    deleteSpeed: opts.deleteSpeed ?? 30,
    pauseAfterType: opts.pauseAfterType ?? 900,
    pauseAfterDelete: opts.pauseAfterDelete ?? 300,
    stableHeight: opts.stableHeight ?? true,
  };
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  host.classList.add('tw');
  const ghost = document.createElement('div');
  ghost.className = 'tw-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  const live = document.createElement('div');
  live.className = 'tw-live';
  live.setAttribute('aria-hidden', 'true');
  // what assistive technology reads: the whole text, once
  const reader = document.createElement('span');
  reader.className = 'dc-sr';
  host.replaceChildren(reader, ghost, live);
  const caret = document.createElement('span');
  caret.className = 'tw-caret';
  caret.setAttribute('aria-hidden', 'true');

  let timers: number[] = [];
  let blink = 0;
  let value = '';
  let typing = false;
  let complete = false;
  const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, Math.max(0, ms)));

  /**
   * Draws `value`: one row per line; on the active line the last characters are the trail, each in
   * its own step of the gradient, inline in the same text (no copy laid over it, so nothing can
   * slip out of place when a line wraps); the caret after them.
   */
  const render = () => {
    const lines = value.split('\n');
    const rows = lines.map((line, i) => {
      const row = document.createElement('div');
      row.className = 'tw-row';
      const active = i === lines.length - 1;
      const keep = active ? line.slice(0, Math.max(0, line.length - TRAIL)) : line;
      const text = document.createElement('span');
      text.className = 'tw-text';
      text.textContent = keep || (line ? '' : '\u00a0');
      row.append(text);
      if (active && line.length > keep.length) {
        const tip = line.slice(keep.length);
        Array.from(tip).forEach((ch, k) => {
          const c = document.createElement('span');
          c.className = `tw-tip${complete ? ' is-done' : ''}`;
          // from the gradient's light end to its deep end, towards the caret
          c.style.setProperty('--tw-c', TRAIL_COLOURS[Math.min(TRAIL_COLOURS.length - 1, k + (TRAIL - tip.length))]);
          c.textContent = ch;
          row.append(c);
        });
      }
      if (active) row.append(caret);
      return row;
    });
    live.replaceChildren(...rows);
  };
  const startBlink = () => {
    window.clearInterval(blink);
    caret.classList.remove('is-off');
    if (reduced()) return;
    blink = window.setInterval(() => caret.classList.toggle('is-off'), BLINK_MS);
  };
  const setGhost = (blocks: string[]) => {
    if (!o.stableHeight) return ghost.replaceChildren();
    const longest = blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
    ghost.replaceChildren(
      ...longest.split('\n').map((l) => {
        const r = document.createElement('div');
        r.className = 'tw-row';
        r.textContent = l || ' ';
        return r;
      }),
    );
  };
  const blocksOf = (text: string) => (o.content === 'lines' ? text.split('\n').map((s) => s.trimEnd()).filter(Boolean) : [text]);

  const stop = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    window.clearInterval(blink);
    typing = false;
  };

  const typeBlock = (text: string) =>
    new Promise<void>((resolve) => {
      complete = false;
      host.classList.add('is-typing');
      const step = () => {
        if (value.length >= text.length) {
          complete = true;
          host.classList.remove('is-typing');
          // the line is complete: its trail fades into the solid colour (the original's "fade" completion)
          requestAnimationFrame(() => live.querySelectorAll('.tw-tip').forEach((c) => c.classList.add('is-done')));
          resolve();
          return;
        }
        later(() => {
          value = text.slice(0, value.length + 1);
          render();
          step();
        }, nextDelay(text, value.length, o.typeSpeed));
      };
      step();
    });
  const deleteBlock = () =>
    new Promise<void>((resolve) => {
      complete = false;
      const step = () => {
        if (!value.length) {
          render();
          resolve();
          return;
        }
        later(() => {
          value = value.slice(0, -1);
          render();
          step();
        }, o.deleteSpeed);
      };
      step();
    });
  const wait = (ms: number) => new Promise<void>((r) => later(r, ms));

  return {
    get typing() {
      return typing;
    },
    async play(text) {
      stop();
      const blocks = blocksOf(text);
      reader.textContent = blocks.join(' ');
      setGhost(blocks);
      value = '';
      complete = false;
      render();
      startBlink();
      if (reduced()) {
        value = blocks[blocks.length - 1] ?? '';
        complete = true;
        render();
        return;
      }
      typing = true;
      // (a stop() clears the timers: the awaits below then never resolve, and this run simply ends there)
      await wait(o.startDelay);
      for (const [i, b] of blocks.entries()) {
        await typeBlock(b);
        if (i === blocks.length - 1) break;
        await wait(typeof o.pauseAfterType === 'function' ? o.pauseAfterType(b) : o.pauseAfterType);
        await deleteBlock();
        await wait(o.pauseAfterDelete);
      }
      typing = false;
    },
    async erase() {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      if (reduced()) {
        value = '';
        render();
        return;
      }
      await deleteBlock();
    },
    show(text) {
      stop();
      const blocks = blocksOf(text);
      reader.textContent = blocks.join(' ');
      setGhost(blocks);
      value = blocks[blocks.length - 1] ?? '';
      complete = true;
      render();
      startBlink();
    },
    stop() {
      stop();
      value = '';
      complete = false;
      render();
    },
  };
}
