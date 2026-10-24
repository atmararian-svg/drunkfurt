/**
 * Decoding text: the printed matter of DRUNKFURT (captions, title cards, the
 * preloader) resolves out of stand-in glyphs, as if being deciphered.
 *
 *  - `decodeIn(el, …)`: a one-off reveal. Every character arrives on its own
 *    slightly irregular schedule (an eased stagger with seeded variation),
 *    fading and rising into place through a few stand-in glyphs.
 *  - `hoverDecode(el, …)`: a small decoding zone that follows the pointer.
 *    The character under the pointer flickers most, its neighbours less, by
 *    measured distance (variable widths, wrapped lines); when the pointer
 *    leaves, everything resolves back to the text.
 *
 * Text is split once into words (kept unbreakable, so wrapping is unchanged)
 * of grapheme clusters (Intl.Segmenter, so accents and composed glyphs stay
 * whole). Each character keeps its real letter in place, merely hidden while a
 * stand-in glyph is drawn over it (`.dc-ch[data-g]::after`), so the layout
 * never moves. The visual copy is aria-hidden; a visually hidden copy of the
 * original text is what assistive technology reads.
 */

/** Stand-in glyphs: capitals, digits and a few print symbols; deterministic per character and tick. */
const POOL = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&*+/<=>';

const graphemes = (text: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg('en', { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  return Array.from(text);
};

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const glyph = (i: number, tick: number) => POOL[Math.floor(hash(i + 1, tick) * POOL.length)];

interface Split {
  chars: HTMLElement[];
  text: string;
}
const splits = new WeakMap<HTMLElement, Split>();

/** Splits an element's text into characters (once); returns the character spans. */
export function splitChars(el: HTMLElement): HTMLElement[] {
  // the text: from data-text (an element React renders empty, so React never touches its children) or its own text
  const known = splits.get(el);
  const text = el.dataset.text ?? (known ? known.text : el.textContent ?? '');
  // already split, for this same text and still in place: reuse it
  if (known && known.text === text && known.chars.every((c) => el.contains(c))) return known.chars;
  const visual = document.createElement('span');
  visual.className = 'dc-visual';
  visual.setAttribute('aria-hidden', 'true');
  const chars: HTMLElement[] = [];
  text.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) {
      visual.append(document.createTextNode(part));
      return;
    }
    const word = document.createElement('span');
    word.className = 'dc-word';
    for (const g of graphemes(part)) {
      const ch = document.createElement('span');
      ch.className = 'dc-ch';
      const o = document.createElement('span');
      o.className = 'dc-o';
      o.textContent = g;
      ch.append(o);
      word.append(ch);
      chars.push(ch);
    }
    visual.append(word);
  });
  const reader = document.createElement('span');
  reader.className = 'dc-sr';
  reader.textContent = text;
  el.replaceChildren(reader, visual);
  splits.set(el, { chars, text });
  return chars;
}

const show = (ch: HTMLElement, g: string | null) => {
  if (g === null) {
    if (ch.dataset.g !== undefined) delete ch.dataset.g;
  } else ch.dataset.g = g;
};

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Reveals an element's characters: each fades and rises into place over a
 * short, eased interval, passing through a few stand-in glyphs first. The
 * starts are staggered across `duration` ms (after `delay` ms) on an eased
 * curve with a little seeded irregularity, so it reads as one deliberate
 * gesture, not a typewriter. Resolves when the last character has settled.
 */
export function decodeIn(el: HTMLElement, duration = 900, delay = 0, opts: { rise?: number; seed?: number } = {}): Promise<void> {
  const chars = splitChars(el);
  const n = chars.length;
  const rise = opts.rise ?? 0.18;
  const seed = opts.seed ?? n;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!n || reduced) {
    chars.forEach((c) => {
      c.style.opacity = '';
      c.style.transform = '';
      show(c, null);
    });
    return Promise.resolve();
  }
  // each character: when it starts (ms after the delay) and how long it takes to settle
  const plan = chars.map((_, i) => {
    const u = n === 1 ? 0 : i / (n - 1);
    const jitter = (hash(seed, i) - 0.5) * 0.16;
    const at = Math.max(0, Math.min(1, Math.pow(u, 0.85) + jitter)) * duration * 0.72;
    return { at, len: duration * (0.28 + hash(i, seed) * 0.12) };
  });
  chars.forEach((c) => {
    c.style.opacity = '0';
    c.style.transform = `translateY(${rise}em)`;
  });
  return new Promise((resolve) => {
    const t0 = performance.now() + delay;
    const frame = (now: number) => {
      const t = now - t0;
      let done = true;
      chars.forEach((c, i) => {
        const p = plan[i];
        const k = Math.max(0, Math.min(1, (t - p.at) / p.len));
        if (k < 1) done = false;
        const e = easeOut(k);
        c.style.opacity = String(Math.min(1, e * 1.4));
        c.style.transform = k >= 1 ? '' : `translateY(${(rise * (1 - e)).toFixed(3)}em)`;
        // stand-ins for the first two thirds of its settling, changing every ~55 ms
        show(c, k > 0 && k < 0.66 ? glyph(i, Math.floor(t / 55)) : null);
      });
      if (done) {
        chars.forEach((c) => (c.style.opacity = ''));
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Decodes the whole word at once (not left to right): every character turns
 * to stand-ins together, and each settles back to its letter at its own
 * scattered moment within `duration` ms. The text's length never changes.
 * Resolves when all have settled. Calling it again on the same element takes
 * over from the run before.
 */
const allRuns = new WeakMap<HTMLElement, number>();
export function decodeAll(el: HTMLElement, duration = 420): Promise<void> {
  const chars = splitChars(el);
  const run = (allRuns.get(el) ?? 0) + 1;
  allRuns.set(el, run);
  if (!chars.length || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    chars.forEach((c) => show(c, null));
    return Promise.resolve();
  }
  const seed = Math.floor(performance.now());
  const settle = chars.map((_, i) => duration * (0.35 + 0.65 * hash(i + 3, seed)));
  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (now: number) => {
      if (allRuns.get(el) !== run) return resolve();
      const t = now - t0;
      const tick = Math.floor(t / 50);
      let done = true;
      chars.forEach((c, i) => {
        const on = t < settle[i];
        if (on) done = false;
        show(c, on ? glyph(i, tick + seed) : null);
      });
      if (done) return resolve();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Keeps an element's characters decoding indefinitely (a label that is still
 * loading): a few stand-ins at a time, never all at once. Returns a stop
 * function that resolves the text.
 */
export function decodeLoop(el: HTMLElement, intensity = 0.35): () => void {
  const chars = splitChars(el);
  let raf = 0;
  const frame = (now: number) => {
    const tick = Math.floor(now / 70);
    chars.forEach((c, i) => show(c, hash(i, Math.floor(now / 260) + i * 3) < intensity ? glyph(i, tick) : null));
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    chars.forEach((c) => show(c, null));
  };
}

/**
 * The pointer's decoding zone over an element's text. `radius` is in ems of
 * the element's font (about one character either side at 1.1). Characters
 * are measured when the pointer comes in (and again after a resize), the
 * pointer's position is kept outside React, and one animation frame loop runs
 * only while the zone is active or characters are still resolving. Touch
 * pointers are ignored, so taps behave as before. Returns a detach function.
 */
export function hoverDecode(el: HTMLElement, opts: { radius?: number } = {}): () => void {
  const chars = splitChars(el);
  const radiusEm = opts.radius ?? 1.1;
  let rects: { x: number; y: number }[] = [];
  let radius = 16;
  let px = 0;
  let py = 0;
  let inside = false;
  let raf = 0;
  const live = new Float32Array(chars.length); // eased influence per character
  const measure = () => {
    rects = chars.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    radius = radiusEm * parseFloat(getComputedStyle(el).fontSize || '16');
  };
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.4, last ? (now - last) / 1000 : 0.016);
    last = now;
    let any = false;
    const tick = Math.floor(now / 90);
    chars.forEach((c, i) => {
      let w = 0;
      if (inside && rects[i]) {
        const dx = (rects[i].x - px) / radius;
        const dy = ((rects[i].y - py) / radius) * 1.6; // lines are further apart than letters
        const d = Math.sqrt(dx * dx + dy * dy);
        w = d < 1 ? Math.pow(1 - d, 1.4) : 0;
      }
      // the zone's edge eases in and out, so it glides rather than jumps between letters
      live[i] += (w - live[i]) * (1 - Math.exp(-dt * (w > live[i] ? 18 : 7)));
      if (live[i] < 0.02) {
        live[i] = 0;
        show(c, null);
        return;
      }
      any = true;
      // stronger influence: more of the time a stand-in, but even under the pointer the true letter
      // shows through about half the time, so the word stays readable
      show(c, hash(i, tick) < live[i] * 0.5 ? glyph(i, tick) : null);
    });
    raf = any || inside ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  };
  const wake = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    inside = true;
    measure();
    px = e.clientX;
    py = e.clientY;
    wake();
  };
  const move = (e: PointerEvent) => {
    if (!inside) return;
    px = e.clientX;
    py = e.clientY;
    wake();
  };
  const leave = () => {
    inside = false;
    wake();
  };
  const resize = () => {
    if (inside) measure();
  };
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  window.addEventListener('resize', resize);
  return () => {
    el.removeEventListener('pointerenter', enter);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(raf);
    chars.forEach((c) => show(c, null));
  };
}
