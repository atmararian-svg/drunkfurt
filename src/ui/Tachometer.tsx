import { useEffect, useRef } from 'react';
import { audio } from '../audio/AudioDirector';
import { localProgress, locate, timeline } from '../core/timeline';
import { CAR_BEAT, LAUNCH_RPM, getaway, setThrottle } from '../scenes/car/getaway';

const R = 80;
const C = 2 * Math.PI * R;
/** The dial sweeps 270°, from bottom left round to bottom right. */
const SWEEP = 0.75;
const MAX = 6000;

/** A point on the dial at a fraction of the sweep (0 = 0 rpm, 1 = 6,000), at radius r. */
function at(f: number, r: number) {
  const a = ((135 + 270 * f) * Math.PI) / 180;
  return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r];
}

/**
 * The tachometer of episode 3: the car's driver display, printed. A black dial
 * with a white 0–6 scale (×1000 rpm), the rising revs in yellow, the reading
 * large in the middle, and the one thing to do: hold D. It shows from the
 * ignition until the page turns after the launch, and it is itself a press
 * target (for touch screens, where there is no D to hold).
 */
export function Tachometer({ prompt }: { prompt: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const value = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let shown = '';
    const loop = () => {
      const { id } = locate(timeline.progress);
      const local = localProgress('car');
      const on = id === 'car' && local >= CAR_BEAT.ignition && local < CAR_BEAT.launchEnd + 0.01;
      const el = root.current!;
      el.classList.toggle('is-on', on);
      if (on) {
        const rpm = Math.max(0, getaway.rpm);
        arc.current!.style.strokeDasharray = `${(Math.min(rpm, MAX) / MAX) * SWEEP * C} ${C}`;
        const text = (Math.round(rpm / 50) * 50).toLocaleString('en-US');
        if (text !== shown) {
          value.current!.textContent = text;
          shown = text;
        }
        el.classList.toggle('is-red', rpm >= LAUNCH_RPM * 0.92);
        el.classList.toggle('is-held', getaway.held);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ticks = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    const major = i % 2 === 0;
    const [x1, y1] = at(f, major ? 66 : 70);
    const [x2, y2] = at(f, 76);
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? 'tach-tick major' : 'tach-tick'} />);
    if (major) {
      const [tx, ty] = at(f, 54);
      ticks.push(
        <text key={`n${i}`} x={tx} y={ty + 4} className="tach-num">
          {i / 2}
        </text>,
      );
    }
  }
  const press = (on: boolean) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (on) audio.unlock();
    if (on) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setThrottle(on, 'pointer');
  };

  return (
    <div
      ref={root}
      className={`tach ${prompt === 'rev' ? 'is-waiting' : ''}`}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerCancel={press(false)}
      onPointerLeave={press(false)}
      onClick={(e) => e.stopPropagation()}
      role="img"
      aria-label="Tachometer"
    >
      <svg viewBox="0 0 200 200" aria-hidden>
        {/* the red-line band: the last 500 rpm, where the launch happens */}
        <circle cx="100" cy="100" r={R} className="tach-band" style={{ strokeDasharray: `${SWEEP * C * (500 / MAX)} ${C}`, strokeDashoffset: -SWEEP * C * (5500 / MAX) }} transform="rotate(135 100 100)" />
        <circle cx="100" cy="100" r={R} className="tach-track" style={{ strokeDasharray: `${SWEEP * C} ${C}` }} transform="rotate(135 100 100)" />
        <circle ref={arc} cx="100" cy="100" r={R} className="tach-arc" style={{ strokeDasharray: `0 ${C}` }} transform="rotate(135 100 100)" />
        {ticks}
      </svg>
      <div className="tach-read">
        <span ref={value} className="tach-value">
          0
        </span>
        <span className="tach-unit">rpm</span>
      </div>
      <div className="tach-hint">
        <span className="tach-hint-key">
          Hold <kbd>D</kbd> to rev
        </span>
        <span className="tach-hint-touch">Press and hold to rev</span>
      </div>
    </div>
  );
}
