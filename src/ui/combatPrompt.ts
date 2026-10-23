import { decodeIn } from './decode';
import { FIGHT_ART } from './fightArt';
import { drawPixelated } from './pixelReveal';

/**
 * The story's action prompts, one system for every moment it asks for D
 * (Figma "Text-placement" for the fight, "Text-placement-car-scene" for the
 * car):
 *
 *  - ACTION, top left, the design's slanted lettering: it comes in like a
 *    stamped comic title, through the scene-transition pixelation
 *    (pixelReveal.ts `drawPixelated`, 28 px blocks resolving to sharp) with an
 *    opacity fade and a short settle from a little too big, once per
 *    appearance (ACTION_MS);
 *  - PRESS [D] / TO …, bottom right: the panel for the moment ('defend' in the
 *    fight, 'rev' in the car), its words decoding in (decode.ts), the arrow
 *    over the first letter of the second line nudging inwards and back while
 *    it shows (CSS, only while on).
 *
 * `updateCombatPrompts` is called every frame by the overlay with what should
 * show (pure functions of the story's state); it only acts on changes. The
 * panels take no input themselves beyond their own press (touch); the D key is
 * read by the overlay (defend) and the car (rev).
 */
export type PromptPanel = 'defend' | 'rev';
const ACTION_MS = 650;

interface State {
  action: HTMLCanvasElement | null;
  panels: Partial<Record<PromptPanel, HTMLElement>>;
  actionOn: boolean;
  panel: PromptPanel | null;
  raf: number;
}
const st: State = { action: null, panels: {}, actionOn: false, panel: null, raf: 0 };
const sharp = document.createElement('canvas');
const tiny = document.createElement('canvas');

/** Both prompts off, as on a fresh page (a remount starts from here, so nothing stays up from before). */
function clear() {
  cancelAnimationFrame(st.raf);
  st.action?.classList.remove('is-on');
  if (st.action) {
    st.action.style.opacity = '0';
    st.action.style.transform = '';
  }
  Object.values(st.panels).forEach((p) => p?.classList.remove('is-on'));
  st.actionOn = false;
  st.panel = null;
}

export function mountCombatPrompts(action: HTMLCanvasElement, panels: Partial<Record<PromptPanel, HTMLElement>>) {
  st.action = action;
  st.panels = panels;
  clear();
  return () => {
    clear();
    st.action = null;
    st.panels = {};
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
    // stamped on: in a touch too big and tilted, settling flat as it sharpens
    const k = (1 - e) * (1 - e);
    el.style.transform = u < 1 ? `scale(${(1 + 0.14 * k).toFixed(4)}) rotate(${(-2.5 * k).toFixed(3)}deg)` : '';
    if (u < 1) st.raf = requestAnimationFrame(frame);
  };
  el.style.opacity = '0';
  st.raf = requestAnimationFrame(frame);
}

export function updateCombatPrompts(action: boolean, panel: PromptPanel | null) {
  if (action !== st.actionOn && st.action) {
    st.actionOn = action;
    st.action.classList.toggle('is-on', action);
    if (action) revealAction();
    else {
      cancelAnimationFrame(st.raf);
      st.action.style.opacity = '0';
    }
  }
  if (panel !== st.panel) {
    if (st.panel) st.panels[st.panel]?.classList.remove('is-on');
    st.panel = panel;
    const el = panel ? st.panels[panel] : undefined;
    if (el) {
      el.classList.add('is-on');
      el.querySelectorAll<HTMLElement>('[data-text]').forEach((t, i) => void decodeIn(t, 520, 120 + i * 90));
    }
  }
}
