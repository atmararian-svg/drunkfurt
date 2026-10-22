import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, Readiness, chapterReadiness } from '../core/chapters';
import { pinScroll } from '../core/timeline';
import { decodeIn, decodeLoop, splitChars } from './decode';
import { DRUNK_STROKES, WORDMARK_STROKE } from './drunkStroke';
import { pixelReveal } from './pixelReveal';
import { showTitleCard } from './titleCards';

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
 *    "Drunk" is written in red by hand while chapter 3 loads: the design's
 *    five brush strokes drawn on as one continuous line, the pen's speed
 *    eased (no stops), holding back the end until chapter 3 is really in.
 *
 * The order: the title decodes in with chapter 1; chapter 1 resolves when it
 * is ready and chapter 2 takes its place; then chapter 3, while the word is
 * written; word and chapter 3 finish together, READY, and the pixel reveal
 * (pixelReveal.ts) brings chapter 1 in over the preloader by itself. Everything runs in one effect, with direct DOM writes and
 * one animation-frame loop; React renders it once and then only to remove it.
 */
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
    const strokes = Array.from(el.querySelectorAll<SVGPathElement>('.pl-stroke path'));
    const stops: (() => void)[] = [];
    const timers: number[] = [];
    let raf = 0;
    let alive = true;

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

    // --- the comic texture leans in under the pointer (CSS variables, no re-render)
    const pointer = (e: PointerEvent) => {
      el.style.setProperty('--px', `${e.clientX}px`);
      el.style.setProperty('--py', `${e.clientY}px`);
      el.classList.add('has-pointer');
    };
    const away = () => el.classList.remove('has-pointer');
    el.addEventListener('pointermove', pointer);
    el.addEventListener('pointerleave', away);

    // --- the writing: the five strokes as one continuous line, drawn on along their length
    const lengths = strokes.map((p) => p.getTotalLength());
    const total = lengths.reduce((a, b) => a + b, 0);
    strokes.forEach((p, i) => {
      p.style.strokeDasharray = `${lengths[i]} ${lengths[i]}`;
      p.style.strokeDashoffset = `${lengths[i]}`;
    });
    let written = 0; // 0..1 along all five strokes
    let speed = 0; // the pen's speed now (of the whole word per second), eased, so it never jumps
    let writing = false; // chapter 3 is loading (or in): the hand is at work
    let finishBy = 0; // chapter 3 is in: the time (ms) the word should be complete by
    let last = performance.now();
    const drawWriting = () => {
      let along = written * total;
      strokes.forEach((p, i) => {
        const l = lengths[i];
        const k = Math.max(0, Math.min(l, along));
        p.style.strokeDashoffset = `${l - k}`;
        along -= l;
      });
    };
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (writing && written < 1) {
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
        drawWriting();
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
        // hand over to chapter 1: the station comes in, in blocks, over the preloader, then sharp
        await pixelReveal('up', {
          onCovered: () => {
            // hidden at once (React removes it a moment later), so the fade to the sharp page shows the stage
            el.style.visibility = 'hidden';
            document.documentElement.classList.remove('is-preloading');
            setGone(true);
          },
        });
        // (the preloader itself is gone by now, removed once the blocks covered it: carry on regardless)
        pinScroll(false);
        showTitleCard(1);
      } catch (err) {
        console.error('[preloader]', err);
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stops.forEach((s) => s());
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('resize', fit);
      el.removeEventListener('pointermove', pointer);
      el.removeEventListener('pointerleave', away);
      document.documentElement.classList.remove('is-preloading');
      // (development re-runs effects: start again from a clean page)
      list.replaceChildren();
    };
  }, []);

  if (gone) return null;
  return (
    <div className="preloader" ref={root} role="progressbar" aria-label="Loading DRUNKFURT" aria-busy="true">
      <div className="pl-grain" aria-hidden />
      <div className="pl-dots" aria-hidden />
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
        <svg className="pl-stroke" viewBox="0 0 1423 135" preserveAspectRatio="xMinYMin meet" aria-hidden>
          <defs>
            {/* the brush's dry, broken edge */}
            <filter id="pl-brush" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
            </filter>
          </defs>
          <g transform={`${WORDMARK_STROKE.matrix} ${WORDMARK_STROKE.scale}`} filter="url(#pl-brush)">
            {DRUNK_STROKES.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={WORDMARK_STROKE.color} strokeWidth={WORDMARK_STROKE.width} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
