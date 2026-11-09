import { Vector2 } from 'three';
import letterUrl from '../assets/letter.webp';
import letterLightUrl from '../assets/letter-light.webp';
import words from '../scenes/city/letterWords.json';
import { audio } from '../audio/AudioDirector';
import { letter } from '../scenes/city/letter';
import { pinScroll } from '../core/timeline';
import { diagNote } from './diag';
import { story } from '../core/store';
import { TOUCH } from './touch';
import { ASPECT, LetterSheet } from './letterSheet';

/**
 * Reading the letter, after Framer's "CrumpledPaper Reveal": the image starts
 * as a crumpled ball and unfolds, in the middle of the page, into a flat print
 * that keeps its creases, with soft shadow, a slight corner curl and light
 * that answers the pointer. The component's own code is not public (it is
 * copied into Framer projects, not published as source), so this is a
 * reconstruction of its behaviour, in WebGL through three.js, which the page
 * already uses:
 *
 *  - one subdivided sheet with the letter (src/assets/letter.png, the supplied
 *    image, at its own aspect ratio, never cropped) as its texture;
 *  - a vertex shader moves each point between the flat sheet (plus fine
 *    creases, a ridged noise, and a curl at the corners) and its place on a
 *    lumpy ball; the middle unfolds first, the edges last, as paper does;
 *  - the facets are shaded from their own screen-space normals, so the ball
 *    reads as crumpled paper and the flat sheet keeps its creases; the light
 *    leans towards the pointer; the back of the sheet is plain paper.
 *
 * Around it: the page darkens (a layer over everything but the letter, fading
 * in), the cursor becomes CLICK TO CLOSE (a label that follows the pointer),
 * and a click closes it: the sheet crumples back up where it is, then, a
 * ball again, drops out through the bottom of the page and is gone (it is not
 * put back on the pavement: read, it is done with), while the dark fades out. On touch
 * screens, and for the keyboard, there is a visible close button; Escape
 * closes too. While it is open the scroll is held and nothing reaches the 3D
 * scene. If WebGL is unavailable, the image itself unfolds in CSS instead.
 */
/** The reveal's timing (ms), in one place to tune: opening (lift, travel and unfolding on one curve) and closing. */
export const LETTER_REVEAL = {
  open: 1900,
  /** Closing: crumpling up, and (overlapping its end) the drop out of the page. */
  close: 1500,
  /** The share of the closing spent crumpling; the drop starts a little before it ends. */
  crumple: 0.55,
  hold: undefined as number | undefined,
};
/** The reading zoom on a touch screen (a tap on the sheet). */
const ZOOM = 2.4;

interface Open {
  root: HTMLDivElement;
  close: () => void;
}
let current: Open | null = null;
const pictures = new Map<string, Promise<HTMLImageElement>>();
const image = (url = letterUrl) => {
  let p = pictures.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    pictures.set(url, p);
  }
  return p;
};

/**
 * Where the voice is in the letter at `t` s of its recording (letterWords.json: each word's line, its
 * x from/to on the sheet, and when it is said): the line, and how far along it the ink has come (the
 * word being said fills in as it is said; between words it rests at the end of the last).
 */
function readAt(t: number) {
  const ws = words.words as [number, number, number, number, number][];
  if (t < ws[0][3]) return { line: ws[0][0], x: ws[0][1] };
  let i = 0;
  while (i + 1 < ws.length && ws[i + 1][3] <= t) i++;
  const [line, x0, x1, t0, t1] = ws[i];
  const k = Math.min(1, Math.max(0, (t - t0) / Math.max(0.05, t1 - t0)));
  return { line, x: x0 + (x1 - x0) * k };
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Opens the letter (once at a time). `spot`: where the crumpled sheet lies on
 * the page (its centre and its size, CSS px), so it is lifted from there;
 * `onClosed` runs when it has crumpled up and left the page.
 */
/** One sheet for every reading (a plain 2D canvas: no WebGL context of its own, see letterSheet.ts). */
let shared: LetterSheet | null = null;

export function openLetter(onClosed: () => void, spot?: { x: number; y: number; size: number }) {
  if (current) return;
  letter.open = true;
  pinScroll(true);
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'letter-layer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'The letter');
  const dim = document.createElement('div');
  dim.className = 'letter-dim';
  const stageEl = document.createElement('div');
  stageEl.className = 'letter-stage';
  const label = document.createElement('div');
  label.className = 'letter-cursor';
  label.textContent = TOUCH ? 'TAP TO CLOSE' : 'CLICK TO CLOSE';
  label.setAttribute('aria-hidden', 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'letter-close';
  button.textContent = TOUCH ? 'TAP TO CLOSE' : 'CLICK TO CLOSE';
  // (touch: a tap on the sheet zooms in to read it; said once, under the button)
  const hint = document.createElement('p');
  hint.className = 'letter-hint';
  hint.textContent = 'TAP THE LETTER TO ZOOM';
  hint.setAttribute('aria-hidden', 'true');
  if (TOUCH) root.append(hint);
  // for assistive technology: the letter's own words are in the image; it is described as what it is
  const alt = document.createElement('p');
  alt.className = 'dc-sr';
  alt.textContent =
    "A letter. Subject: We can't keep losing clients like this. From Daniel Drungel, Business Operations, to Dimasta Eblon, CEO. I've been looking at this quarter's numbers, and there's a pattern we can't ignore anymore. We're losing potential clients to competitors with weaker services but much better websites. People visit our site, look around, and leave. We're paying for traffic that goes nowhere. We've talked about redesigning the website for months, but nothing has changed. Meanwhile, our competitors are investing in their online presence, winning new contracts, and making us look outdated. We have a good business, a solid team, and a service people need. But none of that matters if we can't communicate our value before a potential client walks away. We need to take this seriously and get the right person to rebuild our website. Not another quick fix. Something that actually represents what we've built. We can't afford to keep falling behind. Signed.";
  root.append(dim, stageEl, alt, label, button);
  document.body.appendChild(root);
  document.documentElement.classList.add('is-reading');

  // the sheet's size on the page: as large as fits with margins, never past 1.6 × the image's own pixels
  const fit = () => {
    const maxH = Math.min(window.innerHeight * 0.86, 2000);
    const maxW = Math.min(window.innerWidth * 0.9, 1592);
    const h = Math.min(maxH, maxW / ASPECT);
    return { w: h * ASPECT, h };
  };

  let raf = 0;
  let t0 = performance.now();
  let closing = false;
  let closed = false;
  let unfold = 0;
  let from = 0;
  let to = 1;
  let ms = LETTER_REVEAL.open;
  const light = new Vector2(0.3, 0.4);
  let zoom = 1;
  let zoomTo = 1;
  const pan = new Vector2();
  const target = new Vector2(0.3, 0.4);

  // the reading: 'wait' until it is open, then read out ('reading', the words filling in) or, without the
  // voice (the sound off), shown in full ink at once ('done')
  let reading: 'wait' | 'reading' | 'done' = 'wait';
  let readFrom = 0;
  // how far it is read: the line, and along it (99: all of it in ink; -1: none yet)
  let line = 99;
  let lineX = 0;
  let voicedSheet = false;
  const sheet = (shared ??= new LetterSheet());
  stageEl.appendChild(sheet.canvas);
  let dist = 1;
  let unitPx = 1;

  const size = () => {
    const { w, h } = fit();
    // the canvas covers the page; the camera stands where the flat sheet is exactly w × h px
    sheet.resize(window.innerWidth, window.innerHeight);
    unitPx = h;
    dist = (1 / (2 * Math.tan((30 * Math.PI) / 360))) * (window.innerHeight / h);
    void w;
  };
  size();
  window.addEventListener('resize', size);
  // where it lies (the middle of the page lower down if unknown); its size there, as a share of the open sheet
  const ground = {
    x: spot?.x ?? window.innerWidth / 2,
    y: spot?.y ?? window.innerHeight * 0.8,
    // the crumpled ball is about a third of the sheet's height across
    scale: Math.max(0.05, Math.min(0.6, (spot?.size ?? 60) / (fit().h * 0.36))),
  };

  const draw = (now: number) => {
    // (inspection only, in development: `hold` fixes the opening at a point of its curve)
    const held = import.meta.env.DEV ? LETTER_REVEAL.hold : undefined;
    const u = held !== undefined ? held : reduced ? 1 : Math.min(1, (now - t0) / ms);
    // closing: it crumples where it is, then falls (faster and faster) out through the bottom of the page
    const C = LETTER_REVEAL.crumple;
    unfold = closing ? from * (1 - ease(Math.min(1, u / C))) : from + (to - from) * ease(u);
    const drop = closing ? Math.pow(Math.max(0, (u - (C - 0.1)) / (1.1 - C)), 2) : 0;
    light.lerp(target, 0.08);
    // open: the voice reads it out, the words filling in as they are said
    if (!closing && reading === 'wait' && u >= 1) {
      audio.speak('letter');
      reading = audio.saying() === 'letter' ? 'reading' : 'done';
      readFrom = now;
    }
    {
      if (reading === 'reading') {
        if (audio.saying() === 'letter') {
          const r = readAt(audio.sayingTime());
          line = r.line;
          lineX = r.x;
        } else if (audio.sayingLeft() === 0 && now - readFrom > 500) {
          // said to the end (or stopped): all of it in ink
          reading = 'done';
        }
      }
      if (reading === 'done') line = 99;
      else if (reading === 'wait') line = voicedSheet ? -1 : 99;
    }
    {
      // lifted from where it lay, rising and unfolding on one curve, so it is fully open as it arrives in the middle
      const k = 1 - unfold;
      const h = unitPx;
      let px = 0;
      let py = 0;
      if (closing) {
        // from the middle, down and out: the page's half height, plus the ball's size, below the middle
        const out = window.innerHeight / 2 / h + ground.scale * 0.5;
        py = -out * drop;
      } else {
        px = ((ground.x - window.innerWidth / 2) / h) * k;
        // a lift: it rises off the pavement first, then comes forward to the reader
        py = (-(ground.y - window.innerHeight / 2) / h) * k + Math.sin(Math.PI * Math.min(1, unfold * 1.15)) * 0.12 * k;
      }
      // (touch) the reading zoom: the camera closes in on the point tapped, and pans with a drag
      zoom += (zoomTo - zoom) * (reduced ? 1 : 0.18);
      if (Math.abs(zoomTo - zoom) < 0.002) zoom = zoomTo;
      sheet.render({
        unfold,
        light,
        line,
        x: lineX,
        pos: { x: px, y: py },
        // lying on the ground (tipped away), turning to face you as it opens; a slight drift in the hand once open
        rot: { x: -1.15 * k * k + Math.sin(now / 2100) * 0.012 * unfold, y: 0.35 * k + Math.sin(now / 2700) * 0.015 * unfold, z: 0.6 * k },
        scale: ground.scale + (1 - ground.scale) * unfold,
        zoom,
        pan,
        h,
        dist,
      });
    }
    // the page darkens as soon as the sheet is picked up (on the clock, not the unfolding), and back as it is put down
    const shade = closing ? 1 - u : Math.min(1, u * 2.2);
    dim.style.opacity = String(shade * shade * (3 - 2 * shade));
    if (u < 1 || !closing) raf = requestAnimationFrame(draw);
    else finish();
  };

  const move = (e: PointerEvent) => {
    // the supplied cursor (Figma "cursor-button") is the pointer: centred on it
    label.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    root.classList.toggle('has-pointer', e.pointerType !== 'touch');
    target.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  };
  const opened = performance.now();
  /**
   * On a touch screen the sheet is too small to read whole: a tap on it zooms
   * in (ZOOM ×) on the point tapped, a drag then moves over it, another tap
   * zooms back out; the visible TAP TO CLOSE button closes it. With a mouse a
   * click anywhere closes it, as before.
   */
  let touch: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  let lastTouch = 0;
  const limitPan = () => {
    pan.x = Math.max(-ASPECT / 2, Math.min(ASPECT / 2, pan.x));
    pan.y = Math.max(-0.5, Math.min(0.5, pan.y));
  };
  const touchDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('.letter-close')) return;
    touch = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const touchMove = (e: PointerEvent) => {
    if (!touch || e.pointerType !== 'touch') return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    if (Math.hypot(dx, dy) > 8) touch.moved = true;
    if (zoomTo > 1 && touch.moved) {
      const h = fit().h * zoom;
      pan.x = touch.px - dx / h;
      pan.y = touch.py + dy / h;
      limitPan();
    }
  };
  const touchUp = (e: PointerEvent) => {
    if (!touch || e.pointerType !== 'touch') return;
    lastTouch = performance.now();
    if (!touch.moved && performance.now() - opened > 350) {
      if (zoomTo > 1) zoomTo = 1;
      else {
        // in on the point tapped (in sheet units: the sheet is 1 high)
        const h = fit().h;
        pan.x = (e.clientX - window.innerWidth / 2) / h;
        pan.y = -(e.clientY - window.innerHeight / 2) / h;
        limitPan();
        zoomTo = ZOOM;
      }
    }
    touch = null;
  };
  const click = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // the click that opened it does not close it
    if (performance.now() - opened < 350) return;
    // a tap is the zoom's (above); only the button closes on a touch screen
    if (performance.now() - lastTouch < 700 && !(e.target as HTMLElement).closest('.letter-close')) return;
    close();
  };
  root.addEventListener('pointerdown', touchDown);
  root.addEventListener('pointermove', touchMove);
  root.addEventListener('pointerup', touchUp);
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('click', click);
  // nothing under the layer gets the wheel or a touch drag while it is open
  const swallow = (e: Event) => e.preventDefault();
  root.addEventListener('wheel', swallow, { passive: false });
  root.addEventListener('touchmove', swallow, { passive: false });
  window.addEventListener('keydown', key);

  function close() {
    if (closing) return;
    closing = true;
    // the voice stops; the sheet is crumpled up
    if (audio.saying() === 'letter') audio.hush(0.3);
    audio.paper('crumple');
    zoomTo = 1;
    from = unfold;
    to = 0;
    ms = LETTER_REVEAL.close * Math.max(0.5, unfold);
    t0 = performance.now();
    root.classList.add('is-closing');
  }
  function finish() {
    if (closed) return;
    closed = true;
    // the ball has dropped out of view: it lands on the pavement, by your feet
    if (closing) audio.paper('land');
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    window.removeEventListener('keydown', key);
    diagNote('letter closed');
    root.remove();
    // the sheet keeps no picture between readings
    sheet.empty();
    document.documentElement.classList.remove('is-reading');
    current = null;
    letter.open = false;
    pinScroll(false);
    onClosed();
  }

  current = { root, close };
  // the faint sheet only when it will be read out (with the sound on); without it, the letter as it is
  const voiced = story.getState().sound && audio.running;
  Promise.all([image(), voiced ? image(letterLightUrl).catch(() => null) : Promise.resolve(null)])
    .then(([img, faintImg]) => {
      if (closed) return;
      sheet.setImages(img, faintImg ?? img);
      voicedSheet = !!faintImg;
      if (!faintImg) reading = 'done';
      audio.paper('unfold');
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
      button.focus({ preventScroll: true });
    })
    .catch(() => {
      // the image could not be decoded: nothing to read, so nothing holds the story
      finish();
    });
}

/** Closes the letter if it is open (leaving the chapter). */
export function closeLetterNow() {
  current?.close();
}
