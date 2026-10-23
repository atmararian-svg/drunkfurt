import { useEffect, useRef } from 'react';
import { audio } from '../audio/AudioDirector';
import { REV_SEQUENCE, getaway, revPedal, setThrottle } from '../scenes/car/getaway';
import { PressPrompt } from './PressPrompt';

/**
 * The one instruction of the getaway, while the story waits in the driver's
 * seat: PRESS D TO REV, in the same action-prompt system as the fight's
 * (PressPrompt, with ACTION over the scene: combatPrompt.ts). D starts the rev
 * sequence (four presses of the throttle, one a second, then the launch), and
 * under the words the throttle shows: four marks that light one by one, in
 * the page's red, and a bar that dips with each press. The revs
 * themselves are read off the car's own instrument cluster (carCluster.ts).
 * On a touch screen, where there is no D, pressing the panel does the same.
 *
 * The marks follow the sequence's own clock (getaway.revStart) in a
 * requestAnimationFrame loop that writes styles directly: no React state
 * changes while it plays.
 */
export function RevPrompt({ prompt }: { prompt: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  const on = prompt === 'rev';

  useEffect(() => {
    if (!on) return;
    const el = root.current!;
    const pips = Array.from(el.querySelectorAll<HTMLElement>('.rev-pip'));
    const bar = el.querySelector<HTMLElement>('.rev-bar i')!;
    let raf = 0;
    const loop = () => {
      const started = getaway.revStart >= 0;
      el.classList.toggle('is-revving', started);
      const t = started ? (performance.now() - getaway.revStart) / 1000 : -1;
      pips.forEach((p, i) => p.classList.toggle('is-lit', started && t >= REV_SEQUENCE.presses[i]));
      bar.style.transform = `scaleX(${started ? 0.08 + 0.92 * revPedal(t) : 0})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  const press = (down: boolean) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (down) {
      audio.unlock();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setThrottle(down, 'pointer');
  };
  return (
    // (the wrapper only holds the ref; the panel is placed against the overlay, like the fight's)
    <div ref={root} className="rev-wrap">
      <PressPrompt
        kind="rev"
        action="TO REV"
        on={on}
        label="Press D to rev"
        onPointerDown={press(true)}
        onPointerUp={press(false)}
        onPointerCancel={press(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="rev-run" aria-hidden>
          <span className="rev-pips">
            {REV_SEQUENCE.presses.map((p) => (
              <span key={p} className="rev-pip" />
            ))}
          </span>
          <span className="rev-bar">
            <i />
          </span>
        </span>
      </PressPrompt>
    </div>
  );
}
