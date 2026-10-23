import { drawPixelated } from './pixelReveal';
import { DISABLE_PATH, ENABLE_PATH } from './soundWords';

/**
 * The sound choice, between the preloader and chapter 1 (Figma
 * "Preloader-sound-default / -enable / -disable"): ENABLE and DISABLE, the
 * design's slanted lettering (vector outlines, soundWords), side by side at
 * the top; SOUND along the bottom.
 *
 *  - Everything comes in through the transition's pixelation: the two words
 *    resolve from 28 px blocks, SOUND too (drawn once into a canvas over its
 *    letters for that, then the letters themselves take over).
 *  - The page is split in two at the line between ENABLE and DISABLE. With the
 *    pointer on the left, ENABLE is the choice: SOUND bends into a smile, and
 *    DISABLE breaks into fine pixels; on the right the other way round
 *    (DISABLE chosen, ENABLE pixelated, SOUND bent the opposite way). The
 *    letters glide between the curves eased in and out: slow start, quick
 *    middle, slow end. Off both, SOUND lies straight. A little hysteresis at
 *    the line keeps it from flickering there.
 *  - SOUND hangs at its height, as if on a line across the page: it slides
 *    left and right with the pointer (eased on the clock, like a weight on a
 *    rope), never up or down. The whole word moves (its container), so this
 *    never fights the letters' own glide into a curve. With the keyboard it
 *    slides under the word chosen.
 *  - A click (or a tap) on a half chooses it; the two halves are real buttons
 *    (keyboard: Tab or ← →, then Enter). The promise resolves with the choice,
 *    which the caller makes the page's actual sound setting.
 *
 * Positions are the design's, on its 1920 × 1080 frame, scaled to fit the
 * page and centred. Its own listeners and frame loop are removed when it
 * resolves or when `cancel` is called.
 */
const FRAME = { w: 1920, h: 1080 };
const ENABLE = { x: 24, y: 24, w: 846, h: 412 };
const DISABLE = { x: 921, y: 24, w: 975, h: 412 };
/** The line between the two words (design px). */
const SPLIT = (ENABLE.x + ENABLE.w + DISABLE.x) / 2;
/**
 * SOUND's letters in each state: where each stands (its box's top left) and
 * its tilt, in design px. Straight in the middle by default; the arcs are the
 * design's (its per-letter transforms in the -enable and -disable frames): a
 * smile, and the opposite curve, each moved across to the middle (its height
 * kept), since where the word stands across is the pointer's (below).
 */
type Place = { x: number; y: number; deg: number };
const STRAIGHT: Place[] = [0, 73, 163.7, 252.3, 337].map((x) => ({ x: 749 + x, y: 958, deg: 0 }));
const meanX = (ps: Place[]) => ps.reduce((a, p) => a + p.x, 0) / ps.length;
// [a, b, x, y] of each letter's transform within its group at (gx, gy): the tilt is atan2(b, a); centred across on the straight word
const fromDesign = (gx: number, gy: number, letters: [number, number, number, number][]): Place[] => {
  const ps = letters.map(([a, b, x, y]) => ({ x: gx + x, y: gy + y, deg: (Math.atan2(b, a) * 180) / Math.PI }));
  const dx = meanX(STRAIGHT) - meanX(ps);
  return ps.map((p) => ({ ...p, x: p.x + dx }));
};
const SOUND_SIZE = 93.275;
const LAYOUT: Record<'none' | 'on' | 'off', Place[]> = {
  none: STRAIGHT,
  on: fromDesign(234, 934, [
    [0.9535, 0.3014, 19.89, 4.63],
    [0.9878, 0.1555, 83.9, 25.98],
    [1.0, -0.0041, 167.12, 39.43],
    [0.9867, -0.1623, 248.0, 39.38],
    [0.9469, -0.3215, 322.68, 27.65],
  ]),
  off: fromDesign(1261, 934, [
    [0.9444, -0.3289, 0, 44.79],
    [0.983, -0.1834, 72.47, 19.14],
    [0.9997, -0.0247, 165.46, 2.22],
    [0.9912, 0.1323, 256.61, 0.42],
    [0.9569, 0.2904, 342.05, 12.05],
  ]),
};
/** SOUND's middle across (design px), where it rests; how far either way it may slide (it stays inside the frame). */
const SOUND_MID = 960;
const SLIDE = 720;
/** Where it slides to when a word is chosen from the keyboard: under that word. */
const UNDER = { on: ENABLE.x + ENABLE.w / 2, off: DISABLE.x + DISABLE.w / 2 };
/** Block size of the word not chosen (design px; fine, so it still reads as the word), and of everything as it comes in. */
const INACTIVE_BLOCK = 6;
const INTRO_BLOCK = 28;
const INTRO_MS = 700;

type State = 'none' | 'on' | 'off';

const WORDS = { enable: { box: ENABLE, path: ENABLE_PATH }, disable: { box: DISABLE, path: DISABLE_PATH } };

export interface SoundChoice {
  /** Resolves with the choice: true, sound on. */
  chosen: Promise<boolean>;
  /** Takes it all down (listeners, frame loop); the element stays for the caller to remove. */
  cancel(): void;
}

export function mountSoundChoice(host: HTMLElement): SoundChoice {
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  host.classList.add('snd');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Sound');
  const frame = document.createElement('div');
  frame.className = 'snd-frame';
  const art = (cls: string) => {
    const c = document.createElement('canvas');
    c.className = `snd-art ${cls}`;
    c.setAttribute('aria-hidden', 'true');
    frame.append(c);
    return c;
  };
  const enable = art('snd-enable');
  const disable = art('snd-disable');
  const word = document.createElement('div');
  word.className = 'snd-word';
  word.setAttribute('aria-hidden', 'true');
  const letters = Array.from('SOUND').map((ch) => {
    const s = document.createElement('span');
    s.className = 'snd-ch';
    s.textContent = ch;
    word.append(s);
    return s;
  });
  frame.append(word);
  const intro = document.createElement('canvas');
  intro.className = 'snd-intro';
  intro.setAttribute('aria-hidden', 'true');
  const onBtn = document.createElement('button');
  onBtn.type = 'button';
  onBtn.className = 'snd-half snd-half--on';
  onBtn.textContent = 'Enable sound';
  const offBtn = document.createElement('button');
  offBtn.type = 'button';
  offBtn.className = 'snd-half snd-half--off';
  offBtn.textContent = 'Disable sound';
  host.replaceChildren(frame, intro, onBtn, offBtn);

  let u = 1;
  let left = 0;
  let top = 0;
  let state: State = 'none';
  let done = false;
  let raf = 0;
  let introAt = -1; // when the intro began (ms), -1 before the fonts are in
  const block = { enable: INTRO_BLOCK, disable: INTRO_BLOCK };
  const tiny = document.createElement('canvas');
  const sharp = { enable: document.createElement('canvas'), disable: document.createElement('canvas') };
  const paths = { enable: new Path2D(WORDS.enable.path), disable: new Path2D(WORDS.disable.path) };
  /** A word's outline filled into its sharp canvas, at this size. */
  const drawWord = (key: keyof typeof WORDS) => {
    const c = sharp[key];
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(c.width / WORDS[key].box.w, 0, 0, c.height / WORDS[key].box.h, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fill(paths[key], 'evenodd');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  /** The design frame scaled to fit the page, centred; every position follows from it. */
  const layout = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    u = Math.min(W / FRAME.w, H / FRAME.h);
    left = (W - FRAME.w * u) / 2;
    top = (H - FRAME.h * u) / 2;
    Object.assign(frame.style, { left: `${left}px`, top: `${top}px`, width: `${FRAME.w * u}px`, height: `${FRAME.h * u}px` });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const [c, r, key] of [
      [enable, ENABLE, 'enable'],
      [disable, DISABLE, 'disable'],
    ] as const) {
      Object.assign(c.style, { left: `${r.x * u}px`, top: `${r.y * u}px`, width: `${r.w * u}px`, height: `${r.h * u}px` });
      c.width = sharp[key].width = Math.max(1, Math.round(r.w * u * dpr));
      c.height = sharp[key].height = Math.max(1, Math.round(r.h * u * dpr));
      drawWord(key);
    }
    word.style.fontSize = `${SOUND_SIZE * u}px`;
    placeLetters(false);
    // the halves meet at the line between the words
    const split = left + SPLIT * u;
    onBtn.style.width = `${split}px`;
    offBtn.style.left = `${split}px`;
    paint(performance.now());
  };

  const placeLetters = (animate: boolean) => {
    letters.forEach((s, i) => {
      const { x, y, deg } = LAYOUT[state][i];
      s.style.transition = animate ? '' : 'none';
      // the same functions in every state (translate, rotate), so the browser glides between them
      s.style.transform = `translate(${(x * u).toFixed(2)}px, ${(y * u).toFixed(2)}px) rotate(${deg.toFixed(2)}deg)`;
    });
  };

  /** SOUND's place across: where the pointer would have it, and where it is (px from its resting place). */
  let followTo = 0;
  let followAt = 0;

  /** One frame: the words' blocks ease towards their targets (on the clock, not per frame); returns whether anything still moves. */
  let last = 0;
  const paint = (now: number) => {
    if (introAt < 0) return true;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    let moving = false;
    const intoK = introAt < 0 || reduced ? 1 : Math.min(1, (now - introAt) / INTRO_MS);
    // (once it has come in) SOUND slides along after the pointer, left and right only
    if (intoK >= 1 && followAt !== followTo) {
      followAt += (followTo - followAt) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
      if (Math.abs(followTo - followAt) < 0.3) followAt = followTo;
      else moving = true;
      word.style.transform = `translateX(${followAt.toFixed(1)}px)`;
    }
    for (const key of ['enable', 'disable'] as const) {
      const c = key === 'enable' ? enable : disable;
      const r = key === 'enable' ? ENABLE : DISABLE;
      const chosenOther = (key === 'enable' && state === 'off') || (key === 'disable' && state === 'on');
      const target = chosenOther ? INACTIVE_BLOCK : 1;
      // coming in: from INTRO_BLOCK down on the intro's own curve; afterwards: eased towards the state's target
      if (intoK < 1) block[key] = INTRO_BLOCK + (1 - INTRO_BLOCK) * (intoK * intoK * (3 - 2 * intoK));
      else block[key] += (target - block[key]) * (1 - Math.exp(-dt * 11));
      if (Math.abs(block[key] - target) < 0.3) block[key] = target;
      else moving = true;
      const ctx = c.getContext('2d')!;
      if (block[key] <= 1.01) {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(sharp[key], 0, 0);
      } else drawPixelated(ctx, tiny, sharp[key], block[key] * u, r.w * u, r.h * u);
      c.style.opacity = String(Math.min(1, intoK / 0.45));
    }
    if (intoK < 1) {
      moving = true;
      drawIntroWord(intoK);
    } else if (!intro.hidden) {
      intro.hidden = true;
      word.style.visibility = 'visible';
    }
    return moving;
  };

  // SOUND during the intro: its letters drawn into a canvas exactly where they stand, then pixelated
  const introSharp = document.createElement('canvas');
  let introReady = false;
  const drawIntroWord = (k: number) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!introReady || intro.width !== W || intro.height !== H) {
      intro.width = introSharp.width = W;
      intro.height = introSharp.height = H;
      const c = introSharp.getContext('2d')!;
      c.clearRect(0, 0, W, H);
      const cs = getComputedStyle(letters[0]);
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontStretch} ${cs.fontSize} ${cs.fontFamily}`;
      c.fillStyle = '#fff';
      c.textBaseline = 'alphabetic';
      letters.forEach((s) => {
        const r = s.getBoundingClientRect();
        c.fillText(s.textContent ?? '', r.left, r.top + r.height * 0.86);
      });
      introReady = true;
    }
    const ctx = intro.getContext('2d')!;
    drawPixelated(ctx, tiny, introSharp, INTRO_BLOCK + (1 - INTRO_BLOCK) * (k * k * (3 - 2 * k)), W, H);
    intro.style.opacity = String(Math.min(1, k / 0.45));
  };

  const loop = (now: number) => {
    raf = paint(now) ? requestAnimationFrame(loop) : 0;
    if (!raf) last = 0;
  };
  const wake = () => {
    if (!raf && !done) raf = requestAnimationFrame(loop);
  };

  const set = (next: State) => {
    if (next === state || done) return;
    state = next;
    host.dataset.state = next;
    placeLetters(true);
    wake();
  };

  const slideTo = (px: number) => {
    followTo = Math.max(-SLIDE * u, Math.min(SLIDE * u, px));
    wake();
  };

  // the pointer picks a half, with a little give at the line so it never flickers there
  const GIVE = 14;
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    slideTo(e.clientX - (left + SOUND_MID * u));
    wake();
    const split = left + SPLIT * u;
    if (e.clientX < split - GIVE) set('on');
    else if (e.clientX > split + GIVE) set('off');
    else if (state === 'none') set(e.clientX < split ? 'on' : 'off');
  };
  const leave = () => {
    slideTo(0);
    set('none');
  };

  let resolveChoice: (on: boolean) => void = () => {};
  const chosen = new Promise<boolean>((r) => (resolveChoice = r));
  const choose = (on: boolean) => {
    if (done || introAt < 0) return;
    set(on ? 'on' : 'off');
    done = true;
    host.classList.add('is-chosen');
    // a moment to see the choice land, then hand over
    window.setTimeout(() => resolveChoice(on), reduced ? 0 : 280);
  };
  const click = (on: boolean) => (e: MouseEvent) => {
    e.stopPropagation();
    choose(on);
  };
  const onClick = click(true);
  const offClick = click(false);
  const focusOn = () => {
    set('on');
    slideTo((UNDER.on - SOUND_MID) * u);
  };
  const focusOff = () => {
    set('off');
    slideTo((UNDER.off - SOUND_MID) * u);
  };
  const key = (e: KeyboardEvent) => {
    if (done) return;
    if (e.key === 'ArrowLeft') {
      set('on');
      onBtn.focus({ preventScroll: true });
    } else if (e.key === 'ArrowRight') {
      set('off');
      offBtn.focus({ preventScroll: true });
    }
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', leave);
  onBtn.addEventListener('click', onClick);
  offBtn.addEventListener('click', offClick);
  onBtn.addEventListener('focus', focusOn);
  offBtn.addEventListener('focus', focusOff);
  window.addEventListener('keydown', key);
  window.addEventListener('resize', layout);

  word.style.visibility = 'hidden';
  layout();
  Promise.resolve(document.fonts?.ready)
    .then(() => {
      if (done) return;
      layout();
      introReady = false;
      introAt = performance.now();
      wake();
    })
    .catch(() => {
      // the fonts never settled: the choice still works, as the two plain buttons
      host.classList.add('is-plain');
      introAt = 0;
      intro.hidden = true;
      word.style.visibility = 'visible';
    });

  const cancel = () => {
    done = true;
    cancelAnimationFrame(raf);
    raf = 0;
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerleave', leave);
    onBtn.removeEventListener('click', onClick);
    offBtn.removeEventListener('click', offClick);
    onBtn.removeEventListener('focus', focusOn);
    offBtn.removeEventListener('focus', focusOff);
    window.removeEventListener('keydown', key);
    window.removeEventListener('resize', layout);
  };
  void chosen.then(cancel);
  return { chosen, cancel };
}
