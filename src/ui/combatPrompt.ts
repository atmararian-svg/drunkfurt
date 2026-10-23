import { decodeIn } from './decode';
import { FIGHT_ART } from './fightArt';
import { drawPixelated } from './pixelReveal';

/**
 * The fight's printed prompts (Figma "Text-placement"):
 *
 *  - ACTION, top left, the design's slanted lettering: it comes in through the
 *    scene-transition pixelation (pixelReveal.ts `drawPixelated`, 28 px blocks
 *    resolving to sharp) with an opacity fade, quickly (ACTION_MS), once per
 *    appearance;
 *  - PRESS [D] / TO DEFEND, bottom right, decoding in (decode.ts) with the
 *    arrow beside it sliding a little to the right and back while it shows
 *    (CSS, only while on).
 *
 * `updateCombatPrompts` is called every frame by the overlay with whether each
 * should show (pure functions of the encounter); it only acts on changes. The
 * prompts never take input themselves beyond the D panel's own click (touch);
 * the D key is the overlay's one keyboard listener.
 */
const ACTION_MS = 650;

interface State {
  action: HTMLCanvasElement | null;
  defend: HTMLElement | null;
  actionOn: boolean;
  defendOn: boolean;
  raf: number;
}
const st: State = { action: null, defend: null, actionOn: false, defendOn: false, raf: 0 };
const sharp = document.createElement('canvas');
const tiny = document.createElement('canvas');

/** Both prompts off, as on a fresh page (a remount starts from here, so nothing stays up from before). */
function clear() {
  cancelAnimationFrame(st.raf);
  st.action?.classList.remove('is-on');
  if (st.action) st.action.style.opacity = '0';
  st.defend?.classList.remove('is-on');
  st.actionOn = st.defendOn = false;
}

export function mountCombatPrompts(action: HTMLCanvasElement, defend: HTMLElement) {
  st.action = action;
  st.defend = defend;
  clear();
  return () => {
    clear();
    st.action = st.defend = null;
  };
}

/** ACTION drawn sharp into `sharp` at the element's size. */
function drawAction(el: HTMLCanvasElement) {
  const r = el.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  el.width = sharp.width = w;
  el.height = sharp.height = h;
  const c = sharp.getContext('2d')!;
  c.clearRect(0, 0, w, h);
  const a = FIGHT_ART.ACTION;
  c.save();
  c.scale(w / a.w, h / a.h);
  c.fillStyle = '#ffffff';
  c.fill(new Path2D(a.d));
  c.restore();
  return { cssW: r.width, cssH: r.height };
}

function revealAction() {
  const el = st.action;
  if (!el) return;
  cancelAnimationFrame(st.raf);
  const { cssW, cssH } = drawAction(el);
  const ctx = el.getContext('2d')!;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  const frame = (now: number) => {
    if (!st.actionOn) return;
    const u = reduced ? 1 : Math.min(1, (now - t0) / ACTION_MS);
    const e = u * u * (3 - 2 * u);
    if (u >= 1) {
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(sharp, 0, 0);
    } else drawPixelated(ctx, tiny, sharp, 28 + (1 - 28) * e, cssW, cssH);
    el.style.opacity = String(Math.min(1, u / 0.45));
    if (u < 1) st.raf = requestAnimationFrame(frame);
  };
  el.style.opacity = '0';
  st.raf = requestAnimationFrame(frame);
}

export function updateCombatPrompts(action: boolean, defend: boolean) {
  if (action !== st.actionOn && st.action) {
    st.actionOn = action;
    st.action.classList.toggle('is-on', action);
    if (action) revealAction();
    else {
      cancelAnimationFrame(st.raf);
      st.action.style.opacity = '0';
    }
  }
  if (defend !== st.defendOn && st.defend) {
    st.defendOn = defend;
    st.defend.classList.toggle('is-on', defend);
    if (defend) st.defend.querySelectorAll<HTMLElement>('[data-text]').forEach((t, i) => void decodeIn(t, 520, 120 + i * 90));
  }
}
