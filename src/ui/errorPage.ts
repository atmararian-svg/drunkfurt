import { ARROW_SVG, OOPS_SVG } from './errorArt';
import { decodeAll, splitChars } from './decode';
import { diagNote } from './diag';
import { TOUCH } from './touch';

/**
 * The page for when something breaks (Figma "Drunkfurt-error-page", frame error-page 1920 × 1080): OOOPS
 * in perspective at the top left, what happened in the middle of the page (JetBrains Mono 12, centred
 * both ways), and at the bottom right, under an arrow, PRESS [R] TO RESTART (the R in the page's red).
 * R, a click on it (a tap on a phone: TAP TO RESTART) starts the story again from the top.
 *
 * Shown when the graphics card has given up for good (a lost WebGL context that a reload did not bring
 * back), when chapter 1 cannot be loaded, and when anything else throws inside the page.
 */
const LINES = [
  'SOMETHING WENT WRONG.',
  'SOME DRUNK GUY TRIPPED OVER THE CABLE AND PULLED THE NIGHT OUT OF THE WALL.',
  'IT HAPPENS IN DRUNKFURT. NOTHING PERSONAL. TRY AGAIN.',
];

let shown = false;

export function showErrorPage(why = '') {
  if (shown) return;
  shown = true;
  diagNote(`error page${why ? `: ${why}` : ''}`);
  document.documentElement.classList.remove('is-preloading');
  document.documentElement.classList.add('has-error');
  const root = document.createElement('main');
  root.className = 'err';
  root.setAttribute('role', 'alert');
  const oops = document.createElement('div');
  oops.className = 'err-oops';
  oops.innerHTML = OOPS_SVG;
  const msg = document.createElement('div');
  msg.className = 'err-msg';
  const texts = LINES.map((l) => {
    const p = document.createElement('p');
    // (the last two words held together: no word alone on a line on a phone)
    const text = l.replace(/ (\S+)$/, '\u00a0$1');
    p.dataset.text = text;
    p.textContent = text;
    msg.append(p);
    return p;
  });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'err-restart';
  btn.setAttribute('aria-label', 'Restart the story');
  // (the arrow and PRESS [R] on the first line, TO RESTART under both, as in the design)
  btn.innerHTML = `<span class="err-arrow">${ARROW_SVG}</span><span class="err-press">${TOUCH ? 'TAP' : 'PRESS<span class="err-key">R</span>'}</span><span class="err-to">TO RESTART</span>`;
  root.append(oops, msg, btn);
  document.body.append(root);
  // (the words decode in, as the page's do)
  texts.forEach((t, i) => {
    splitChars(t);
    window.setTimeout(() => void decodeAll(t, 700), 250 + i * 220);
  });
  const restart = () => {
    try {
      // (from the top: not back into the chapter a reload after a lost context would return to)
      sessionStorage.removeItem('drunkfurt:resume');
    } catch {
      // (no storage)
    }
    location.href = location.origin + location.pathname;
  };
  btn.addEventListener('click', restart);
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        restart();
      }
    },
    true,
  );
}
