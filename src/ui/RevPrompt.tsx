import { audio } from '../audio/AudioDirector';
import { setThrottle } from '../scenes/car/getaway';

/**
 * The one instruction of episode 3, while the story waits in the driver's
 * seat: hold D. The revs themselves are read off the car's own instrument
 * cluster (carCluster.ts). On a touch screen, where there is no D, pressing
 * and holding this card does the same.
 */
export function RevPrompt({ prompt }: { prompt: string | null }) {
  const press = (on: boolean) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (on) {
      audio.unlock();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setThrottle(on, 'pointer');
  };
  return (
    <div
      className={`rev-prompt ${prompt === 'rev' ? 'is-on' : ''}`}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerCancel={press(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="rev-key">
        Hold <kbd>D</kbd> to rev
      </span>
      <span className="rev-touch">Press and hold to rev</span>
    </div>
  );
}
