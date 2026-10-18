import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioDirector';
import { story, useStory } from '../core/store';
import { input } from '../player/input';

const canvas = () => document.querySelector('canvas');

/**
 * The only interface: a fade from black, a quiet title card, one prompt, and
 * after the step a short-lived control hint. Everything else is in the world.
 */
export function Overlay() {
  const phase = useStory((s) => s.phase);
  const locked = useStory((s) => s.pointerLocked);
  const [hint, setHint] = useState(false);

  useEffect(() => input.onLockChange((l) => story.setState({ pointerLocked: l })), []);

  useEffect(() => {
    if (phase !== 'platform') return;
    setHint(true);
    const id = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(id);
  }, [phase]);

  const engage = () => {
    const s = story.getState();
    const el = canvas();
    if (s.phase === 'arrival') {
      audio.unlock();
      if (el) input.requestLock(el);
      story.setState({ phase: 'stepping-out' });
    } else if (s.phase === 'platform' && !s.pointerLocked && el) {
      input.requestLock(el);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Enter' || e.code === 'Space') && story.getState().phase === 'arrival') {
        e.preventDefault();
        engage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cinematic = phase === 'loading' || phase === 'arrival' || phase === 'stepping-out';

  return (
    <div className={`overlay ${locked ? 'is-locked' : ''}`} onClick={engage}>
      <div className={`veil ${phase === 'loading' ? 'is-on' : ''}`} />
      <div className={`letterbox top ${cinematic ? 'is-on' : ''}`} />
      <div className={`letterbox bottom ${cinematic ? 'is-on' : ''}`} />

      <header className={`titlecard ${phase === 'arrival' ? 'is-on' : ''}`}>
        <span className="wordmark">DRUNKFURT</span>
        <span className="where">Frankfurt (Main) Hbf · Gleis 7 · 23:47</span>
      </header>

      <button
        type="button"
        className={`prompt ${phase === 'arrival' ? 'is-on' : ''}`}
        tabIndex={phase === 'arrival' ? 0 : -1}
        aria-hidden={phase !== 'arrival'}
      >
        Click to step out
      </button>

      <div className={`hint ${phase === 'platform' && (hint || !locked) ? 'is-on' : ''}`}>
        {locked ? 'W A S D  walk   ·   Shift  hurry   ·   Mouse  look' : 'Click to look around'}
      </div>
      {phase === 'platform' && locked && <div className="reticle" />}
    </div>
  );
}
