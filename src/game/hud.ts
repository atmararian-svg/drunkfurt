import { story } from '../core/store';
import { decodeAll, splitChars } from '../ui/decode';
import { pointerHeld, releasePointer } from './keys';
import { ACTION_KEY, SOUND_KEY } from './mode';
import { stepTalk, talkHint } from './talk';
import { walk } from './walk';

/**
 * The game's marks on the page: a crosshair while you walk; under it, what E does here ([E] GET
 * IN THE CAR, [E] TALK TO THE SMOKER), in the page's button face; and at the start, the controls,
 * until the first steps have been taken.
 */
export function mountGameHud(host: HTMLElement) {
  const root = document.createElement('div');
  root.className = 'game-hud';
  root.setAttribute('aria-live', 'polite');
  const cross = document.createElement('i');
  cross.className = 'game-cross';
  const hint = document.createElement('p');
  hint.className = 'game-hint';
  const help = document.createElement('p');
  help.className = 'game-help';
  help.innerHTML = `<b>W A S D</b> WALK <span>·</span> <b>MOUSE</b> LOOK <span>·</span> <b>SHIFT</b> HURRY <span>·</span> <b>${ACTION_KEY}</b> ACT, TALK <span>·</span> <b>${SOUND_KEY}</b> SOUND`;
  const click = document.createElement('p');
  click.className = 'game-click';
  click.textContent = 'CLICK TO LOOK AROUND';
  root.append(cross, hint, help, click);
  host.append(root);
  let shown = '';
  let walked = 0;

  const update = (dt: number) => {
    stepTalk();
    // the cursor back where the page wants it (the letter, the big screen at the desk)
    const html = document.documentElement.classList;
    const wantsCursor = story.getState().prompt === 'monitor' || html.contains('is-reading');
    if (wantsCursor !== html.contains('game-cursor')) html.toggle('game-cursor', wantsCursor);
    if (wantsCursor) releasePointer();
    const ready = story.getState().phase === 'ready' && !document.documentElement.classList.contains('is-preloading');
    const text = ready ? (walk.hint ?? talkHint()) : null;
    const want = text ? `[${ACTION_KEY}] ${text}` : '';
    if (want !== shown) {
      shown = want;
      hint.dataset.text = want;
      hint.textContent = want;
      if (want) {
        splitChars(hint);
        void decodeAll(hint, 380);
      }
    }
    root.classList.toggle('is-walking', ready && walk.free);
    hint.classList.toggle('is-on', !!want);
    // the controls: until you have walked a few seconds
    if (walk.free && walk.moved) walked += dt;
    help.classList.toggle('is-on', ready && walked < 4);
    click.classList.toggle('is-on', ready && walk.free && !pointerHeld() && !document.documentElement.classList.contains('is-reading'));
  };
  return { update, dispose: () => root.remove() };
}
