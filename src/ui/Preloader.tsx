import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, Readiness, chapterReadiness } from '../core/chapters';
import { pinScroll } from '../core/timeline';
import { decodeIn, decodeLoop, splitChars } from './decode';
import { DRUNK_BOX, DRUNK_COLOR, DRUNK_GLYPHS, DRUNK_SIZE } from './drunkWord';
import { mountDotGrid } from './dotGrid';
import { audio } from '../audio/AudioDirector';
import { story } from '../core/store';
import { pixelCover, pixelReveal } from './pixelReveal';
import { SoundChoice, mountSoundChoice } from './soundChoice';
import { showTitleCard } from './titleCards';
import { takeResume } from './resume';
import { goToChapter } from './chapterTransition';
import { diagNote } from './diag';

/**
 * The preloader (Figma "Drunkfurt": Preloader-Start → Preloader-Final), a
 * title page printed in the comic's own grey on near-black:
 *
 *  - top left, LOADING CHAPTERS, decoding while anything loads, then READY;
 *  - top right, the chapters: the one loading sits at the right edge,
 *    decoding; when it is really ready (core/chapters readiness, written by
 *    the worlds themselves) it resolves and steps left, and the next one
 *    takes its place;
 *  - centre, "Once upon a time in" with its three dots counting up;
 *  - along the bottom, FRANKFURT, revealed letter by letter, over which
 *    "Drunk" comes on in red while chapter 3 loads: the design's Rock Salt
 *    lettering (Figma "Drunkfurt-2"), out of coarse pixels growing finer,
 *    blinking out and back like a failing street lamp, at an eased pace
 *    holding back the end until chapter 3 is really in; a last stutter, then
 *    steady.
 *
 * The order: the title decodes in with chapter 1; chapter 1 resolves when it
 * is ready and chapter 2 takes its place; then chapter 3, while the word is
 * written; word and chapter 3 finish together, READY; the preloader leaves in
 * the transition's blocks (pixelCover), the sound choice comes in
 * (soundChoice.ts), and once ENABLE or DISABLE is chosen the pixel reveal
 * (pixelReveal.ts) brings chapter 1 in over it. Everything runs in one effect, with direct DOM writes and
 * one animation-frame loop; React renders it once and then only to remove it.
 */
/** The preloader's page colour (styles.css .preloader), which the sound choice shares. */
const PAGE_BG = '#070707';
const MIN_ACTIVE = 650; // ms a chapter label decodes before it may resolve, so it can be read
const LATER_CHAPTER_WAIT = 25000; // ms chapters 2 and 3 may hold the page after chapter 1 is in
/**
 * The hand writing "Drunk" while chapter 3 loads (fractions of the word, per second):
 * at `pace` (the whole word in about 1.9 s) up to `hold`, then only a slow creep
 * towards `limit` while chapter 3 is still on its way; once it is in, the rest is
 * written a little quicker than the pace (at least `finish` ms), so word and
 * chapter end together; if chapter 3 is in before the hand gets there, the
 * label waits for the word.
 */
const WRITE = { pace: 0.52, hold: 0.8, limit: 0.9, creep: 0.03, finish: 450 };
/**
 * "Drunk" coming on like a failing lamp: `block` px at first, sharp at the end; the chance of a blink each
 * time (from `max` at the start to `min` as it is nearly there, `after` once it is), how long it stays on
 * and off (ms: least, plus up to), how dark it goes off (`dim`), and how long the stutter lasts once it
 * is all there (`tail`, ms).
 */
const FLICKER = { block: 26, max: 0.5, min: 0.12, after: 0.3, on: [70, 260], off: [35, 90], dim: 0.12, tail: 650 } as const;

/** A pixelating filter for the word's layer (the region generous: the glyphs overhang the box they sit in). */
function drunkPixels(defs: SVGDefsElement) {
  const NS = 'http://www.w3.org/2000/svg';
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', 'pl-drunk-px');
  f.setAttribute('x', '-0.2');
  f.setAttribute('y', '-2');
  f.setAttribute('width', '1.4');
  f.setAttribute('height', '5');
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
  let lastBlock = -1;
  return (el: HTMLElement, block: number) => {
    const b = Math.max(1, Math.round(block));
    if (b === lastBlock) return;
    lastBlock = b;
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
    el.style.filter = 'url(#pl-drunk-px)';
  };
}

export function Preloader() {
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    document.documentElement.classList.add('is-preloading');
    pinScroll(true);
    const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
    const status = q<HTMLElement>('.pl-status');
    const list = q<HTMLElement>('.pl-chapters');
    const word = q<HTMLElement>('.pl-word');
    const drunk = q<HTMLElement>('.pl-drunk');
    const stops: (() => void)[] = [];
    const timers: number[] = [];
    let raf = 0;
    let alive = true;
    let choice: SoundChoice | null = null;

    // --- the wordmark fits the page's width, as in the design (FRANKFURT across 1423 of 1471)
    const fit = () => {
      word.style.fontSize = '100px';
      const w = word.scrollWidth;
      const avail = el.clientWidth - 2 * parseFloat(getComputedStyle(el).getPropertyValue('--pl-pad') || '24');
      word.style.fontSize = `${(100 * avail) / Math.max(1, w)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    document.fonts?.ready.then(() => alive && fit());

    // --- the print screen: a grid of dots that orbit the pointer (the supplied DotGridBackground, dotGrid.ts)
    const unmountDots = mountDotGrid(q<HTMLCanvasElement>('.pl-dots'));

    // --- "Drunk" comes on as a failing street lamp does: out of coarse pixels that grow finer as it comes,
    // blinking out and back while it is not quite there, a last stutter once it is, then steady. Its pace
    // is the loading's (`written`, 0..1): it is sharp exactly when chapter 3 is in.
    const pixelate = drunkPixels(q<SVGDefsElement>('.pl-defs'));
    let written = 0; // 0..1: how far it has come on
    let speed = 0; // its pace now (of the whole word per second), eased, so it never jumps
    let writing = false; // chapter 3 is loading (or in): it is coming on
    let finishBy = 0; // chapter 3 is in: the time (ms) the word should be sharp by
    let doneAt = 0; // when it came fully on (for the last stutter)
    let lit = true; // the lamp's state between blinks
    let nextBlink = 0;
    let last = performance.now();
    drunk.style.opacity = '0';
    const drawWriting = (now: number) => {
      const k = written;
      const settled = doneAt > 0 && now - doneAt > FLICKER.tail;
      if (settled) {
        drunk.style.opacity = '1';
        pixelate(drunk, 1);
        return false;
      }
      // the blinks: often while it is coming on, a few more just after, none once it has settled
      if (now >= nextBlink) {
        const chance = doneAt ? FLICKER.after : FLICKER.min + (FLICKER.max - FLICKER.min) * (1 - k);
        lit = !(Math.random() < chance);
        nextBlink = now + (lit ? FLICKER.on[0] + Math.random() * FLICKER.on[1] : FLICKER.off[0] + Math.random() * FLICKER.off[1]);
      }
      const body = Math.min(1, k * 2.5);
      drunk.style.opacity = (lit ? body : body * FLICKER.dim).toFixed(3);
      // the blocks: coarse at first, sharp when it is all there
      const e = k * k * (3 - 2 * k);
      pixelate(drunk, doneAt ? 1 : 1 + (FLICKER.block - 1) * Math.pow(1 - e, 1.4));
      return true;
    };
    let drawing = true;
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (writing && (written < 1 || drawing)) {
        let want: number;
        if (finishBy) {
          // chapter 3 is in: what is left, done by the moment set for it (never slower than the hand's pace)
          want = Math.max(WRITE.pace, (1 - written) / Math.max(0.12, (finishBy - now) / 1000));
        } else {
          // still loading: the hand's pace, slowing as it nears the part kept for the end, then a slow creep
          // (something always moves) that never reaches it; the end is written only once chapter 3 is in
          const room = (WRITE.hold - written) / 0.12;
          want = written < WRITE.hold ? WRITE.pace * Math.max(0.08, Math.min(1, room)) : WRITE.creep * Math.max(0, (WRITE.limit - written) / (WRITE.limit - WRITE.hold));
        }
        speed += (want - speed) * (1 - Math.exp(-dt * 7));
        written = Math.min(1, written + speed * dt);
        if (written >= 1 && !doneAt) doneAt = now;
        drawing = drawWriting(now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    /** Chapter 3 is in (or will not be): the hand finishes the word, in about WRITE.finish ms. */
    const finishWriting = () => {
      writing = true;
      // the rest at a little over the hand's pace, never in less than WRITE.finish ms (no sudden scribble)
      if (!finishBy) finishBy = performance.now() + Math.max(WRITE.finish, ((1 - written) / WRITE.pace) * 700);
    };
    const written1 = () =>
      new Promise<void>((resolve) => {
        const check = () => (written >= 1 || !alive ? resolve() : void timers.push(window.setTimeout(check, 40)));
        check();
      });

    // --- the opening: labels decode in, then FRANKFURT arrives letter by letter
    void decodeIn(status, 700, 150);
    void decodeIn(q<HTMLElement>('.pl-once-text'), 900, 450);
    const title = decodeIn(word, 1300, 450, { rise: 0.12 });

    // --- the chapters, one at a time, each resolving when it is really ready
    const labels = CHAPTERS.map((c) => {
      const s = document.createElement('span');
      s.className = 'pl-chapter';
      s.dataset.text = `CHAPTER ${c.number}`;
      return s;
    });
    const settle = (n: 1 | 2 | 3) =>
      new Promise<Readiness>((resolve) => {
        const check = () => {
          const r = chapterReadiness.get(n);
          if (r !== false) {
            off();
            resolve(r);
          }
        };
        const off = chapterReadiness.subscribe(check);
        check();
      });
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));
    /** Adds a label at the right edge, gliding the others left (FLIP). */
    const push = (s: HTMLElement) => {
      const before = Array.from(list.children).map((c) => (c as HTMLElement).getBoundingClientRect().left);
      list.appendChild(s);
      Array.from(list.children).forEach((c, i) => {
        if (i >= before.length) return;
        const dx = before[i] - (c as HTMLElement).getBoundingClientRect().left;
        (c as HTMLElement).animate?.([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
          duration: 700,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
      });
    };

    let firstIn = 0;
    const sequence = async () => {
      for (const [i, c] of CHAPTERS.entries()) {
        if (!alive) return;
        const s = labels[i];
        s.classList.add('is-active');
        push(s);
        splitChars(s);
        void decodeIn(s, 450, 0);
        const stopLoop = decodeLoop(s, 0.45);
        stops.push(stopLoop);
        const shown = performance.now();
        const lastOne = i === CHAPTERS.length - 1;
        // the last chapter loads while "Drunk" is written (after the title has arrived)
        if (lastOne) void title.then(() => alive && (writing = true));
        const ready = c.number === 1 ? settle(1) : Promise.race([settle(c.number), wait(Math.max(0, LATER_CHAPTER_WAIT - (performance.now() - firstIn))).then(() => 'late' as const)]);
        const r = await ready;
        await wait(Math.max(0, MIN_ACTIVE - (performance.now() - shown)));
        if (lastOne) {
          // the word and the chapter finish together: the hand completes it, then the label resolves
          await title;
          finishWriting();
          await written1();
        }
        stopLoop();
        if (!alive) return;
        s.classList.remove('is-active');
        s.classList.add(r === true ? 'is-ready' : r === 'failed' ? 'is-failed' : 'is-late');
        if (c.number === 1) {
          firstIn = performance.now();
          if (r === 'failed') {
            status.dataset.text = 'CHAPTER 1 COULD NOT BE LOADED. PLEASE RELOAD THE PAGE.';
            status.replaceChildren();
            splitChars(status);
            status.classList.add('is-error');
            throw new Error('chapter 1 failed');
          }
        }
      }
    };

    void (async () => {
      try {
        await Promise.all([sequence(), title]);
        if (!alive) return;
        status.dataset.text = 'READY';
        status.replaceChildren();
        await decodeIn(status, 380, 0);
        await wait(220);
        if (!alive) return;
        // coming back after the graphics card gave out (ui/resume.ts): the sound as it was, no choice asked
        const resume = takeResume();
        let on: boolean;
        if (resume) on = resume.sound;
        else {
          // the preloader leaves in the transition's blocks; only once it has gone does the sound choice come in
          const uncover = await pixelCover(PAGE_BG, 'up');
          if (!alive) return uncover();
          el.classList.add('is-choosing');
          el.setAttribute('aria-busy', 'false');
          choice = mountSoundChoice(q<HTMLElement>('.pl-sound'));
          uncover();
          on = await choice.chosen;
        }
        if (!alive) return;
        // the choice is the page's sound setting (the click is also the gesture audio needs to start)
        diagNote(`sound chosen: ${on ? 'on' : 'off'}`);
        story.setState({ sound: on });
        audio.unlock();
        audio.setEnabled(on);
        // hand over to chapter 1: the station comes in, in blocks, over the sound choice, then sharp
        diagNote('hand-over to chapter 1 begins');
        await pixelReveal('up', {
          onCovered: () => {
            // hidden at once (React removes it a moment later), so the fade to the sharp page shows the stage
            el.style.visibility = 'hidden';
            document.documentElement.classList.remove('is-preloading');
            diagNote('preloader gone: the station is on');
            setGone(true);
          },
        });
        // (the preloader itself is gone by now, removed once the blocks covered it: carry on regardless)
        pinScroll(false);
        // back to the chapter the visitor was in, from its beginning
        if (resume && resume.chapter > 1) goToChapter(resume.chapter);
        else showTitleCard(1);
      } catch (err) {
        console.error('[preloader]', err);
      }
    })();

    return () => {
      alive = false;
      choice?.cancel();
      cancelAnimationFrame(raf);
      stops.forEach((s) => s());
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('resize', fit);
      unmountDots();
      document.documentElement.classList.remove('is-preloading');
      // (development re-runs effects: start again from a clean page)
      list.replaceChildren();
    };
  }, []);

  if (gone) return null;
  return (
    <div className="preloader" ref={root} role="progressbar" aria-label="Loading DRUNKFURT" aria-busy="true">
      <div className="pl-grain" aria-hidden />
      <canvas className="pl-dots" aria-hidden />
      <p className="pl-status" data-text="LOADING CHAPTERS" />
      <div className="pl-chapters" aria-hidden />
      <p className="pl-once">
        <span className="pl-once-text" data-text="ONCE UPON A TIME IN" />
        <span className="pl-ellipsis" aria-hidden>
          <i>.</i>
          <i>.</i>
          <i>.</i>
        </span>
      </p>
      <div className="pl-mark">
        <span className="pl-word" data-text="FRANKFURT" />
        {/* "Drunk" (Figma Preloader-Final), placed as there over FRANKFURT (whose frame, 1872 × 178, is the
            viewBox): the glyphs, coming on out of pixels with a failing lamp's blinks (FLICKER) */}
        {/* (the word's pixel filter lives outside the layer it filters: a filter inside its own element is ignored) */}
        <svg className="pl-defs-svg" width="0" height="0" aria-hidden>
          <defs className="pl-defs" />
        </svg>
        <div className="pl-drunk">
          <svg className="pl-stroke" viewBox="0 0 1872 178" preserveAspectRatio="xMinYMin meet" aria-hidden>
            <g transform={`translate(${DRUNK_BOX.x - 24} ${DRUNK_BOX.y - 886})`}>
              <g className="pl-ink" fill={DRUNK_COLOR}>
                {DRUNK_GLYPHS.map((g, i) => (
                  <path key={i} d={g.d} transform={`translate(${g.x} ${g.y}) scale(${DRUNK_SIZE} ${-DRUNK_SIZE})`} />
                ))}
              </g>
            </g>
          </svg>
        </div>
      </div>
      {/* the sound choice (soundChoice.ts), after the loading */}
      <div className="pl-sound" />
    </div>
  );
}
