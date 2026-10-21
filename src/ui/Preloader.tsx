import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, Readiness, chapterReadiness } from '../core/chapters';
import { pinScroll } from '../core/timeline';
import { decodeIn, decodeLoop, splitChars } from './decode';
import { DRUNK_STROKES, WORDMARK_STROKE } from './drunkStroke';
import { coverStage, reveal } from './reveal';
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
 *    "Drunk" is written in red by hand: the five strokes of the design's
 *    brush path drawn on along their length, the pen speeding and slowing,
 *    as far as the loading has got.
 *
 * When chapter 1 is ready and the title has played (and chapters 2 and 3
 * are in, or have had their time), it hands over to chapter 1 with the
 * parallax reveal. Everything runs in one effect, with direct DOM writes and
 * one animation-frame loop; React renders it once and then only to remove it.
 */
const MIN_ACTIVE = 1100; // ms a chapter label decodes before it may resolve, so it can be read
const LATER_CHAPTER_WAIT = 25000; // ms chapters 2 and 3 may hold the page after chapter 1 is in

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

    // --- the writing: the five strokes, drawn on one after another
    const lengths = strokes.map((p) => p.getTotalLength());
    const total = lengths.reduce((a, b) => a + b, 0);
    strokes.forEach((p, i) => {
      p.style.strokeDasharray = `${lengths[i]} ${lengths[i]}`;
      p.style.strokeDashoffset = `${lengths[i]}`;
    });
    let written = 0; // 0..1 along all five strokes
    let writeTo = 0; // how far the loading lets it go
    let writing = false;
    let lift = 0; // ms of pen lift left (between strokes)
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
      const dt = Math.min(200, now - last);
      last = now;
      if (writing && written < writeTo) {
        if (lift > 0) lift -= dt;
        else {
          // a hand's speed: quicker down the long strokes, slower into turns, never constant
          const wobble = 0.75 + 0.5 * Math.sin(now / 173) * Math.sin(now / 61 + 1.3);
          // and easing off as it nears where the loading has got to, rather than stopping dead
          const near = Math.min(1, (writeTo - written) / 0.06);
          const step = (dt / 1000) * 0.4 * wobble * (0.35 + 0.65 * near);
          const before = strokeIndex(written);
          written = Math.min(writeTo, written + step);
          if (strokeIndex(written) !== before) lift = 90 + 60 * Math.random(); // the pen lifts between letters
        }
        drawWriting();
      }
      raf = requestAnimationFrame(frame);
    };
    const bounds = lengths.reduce<number[]>((acc, l) => [...acc, (acc[acc.length - 1] ?? 0) + l / total], []);
    const strokeIndex = (w: number) => bounds.findIndex((b) => w < b - 1e-6);
    raf = requestAnimationFrame(frame);

    // --- the opening: labels decode in, then FRANKFURT arrives letter by letter
    void decodeIn(status, 700, 150);
    void decodeIn(q<HTMLElement>('.pl-once-text'), 900, 450);
    const title = decodeIn(word, 1500, 650, { rise: 0.12 }).then(() => {
      writing = true;
    });

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
        void decodeIn(s, 500, 0);
        const stopLoop = decodeLoop(s, 0.45);
        stops.push(stopLoop);
        const shown = performance.now();
        const ready = c.number === 1 ? settle(1) : Promise.race([settle(c.number), wait(Math.max(0, LATER_CHAPTER_WAIT - (performance.now() - firstIn))).then(() => 'late' as const)]);
        const r = await ready;
        await wait(Math.max(0, MIN_ACTIVE - (performance.now() - shown)));
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
        // the hand writes on as the chapters come in
        writeTo = (i + 1) / CHAPTERS.length;
      }
    };

    void (async () => {
      try {
        await Promise.all([sequence(), title]);
        if (!alive) return;
        // the last strokes, then READY, then a moment to take in DRUNKFURT
        while (alive && written < 0.999) await wait(80);
        status.dataset.text = 'READY';
        status.replaceChildren();
        await decodeIn(status, 500, 0);
        await wait(900);
        if (!alive) return;
        // hand over to chapter 1: the preloader slides away, the station is uncovered from below
        coverStage('up');
        el.classList.add('is-leaving');
        await reveal(el, 'up');
        if (!alive) return;
        document.documentElement.classList.remove('is-preloading');
        pinScroll(false);
        setGone(true);
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
