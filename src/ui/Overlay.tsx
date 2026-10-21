import { useEffect, useRef } from 'react';
import { audio } from '../audio/AudioDirector';
import { clamp } from '../core/math';
import { story, useStory } from '../core/store';
import { EPISODE_SPANS, episodeRange, gateLimit, locate, scrollToProgress, timeline } from '../core/timeline';
import { PLANNED, builtEpisodes } from '../episodes';
import { BEAT, BLOCK, KO, defend, encounter, encounterAt } from '../scenes/city/encounter';
import { drawBrushWipe, drawHits, drawKnockout, drawSpeedLines } from './brush';
import { launchAt } from '../scenes/car/getaway';
import { enterSite, monitor, onScreen } from '../scenes/home/monitor';
import { RevPrompt } from './RevPrompt';

/** An episode that picks up the previous one's last shot, with no page turn between them. */
const seamless = (id: string) => !!EPISODE_SPANS.find((e) => e.id === id)?.seamless;
const nextOf = (id: string) => EPISODE_SPANS[EPISODE_SPANS.findIndex((e) => e.id === id) + 1];

/** Ink coverage of the frame at a given progress: episode ends, episode starts, and the strike's cut. */
function inkAt(p: number): { w: number; mode: 'close' | 'open' } {
  const { id, local } = locate(p);
  if (id === 'outro') return { w: 1, mode: 'close' };
  // the city's last shot (the aftermath) holds longer before the page turns
  const end = id === 'city' ? 0.978 : 0.955;
  if (local > end && !nextOf(id)?.seamless) return { w: (local - end) / (1 - end), mode: 'close' };
  const first = EPISODE_SPANS[0].id === id || seamless(id);
  if (!first && local < 0.045) return { w: 1, mode: 'open' };
  if (!first && local < 0.12) return { w: 1 - (local - 0.045) / 0.075, mode: 'open' };
  if (id === 'city' && encounter.outcome) {
    // once the fight has gone black, the page stays inked until the aftermath opens it again
    const t = encounterAt(local).t;
    const black = encounter.outcome === 'blocked' ? BLOCK.dark : KO.dark;
    if (t >= black && local < BEAT.aftermath) return { w: 1, mode: 'open' };
    if (local >= BEAT.aftermath && local < BEAT.aftermath + 0.035) return { w: 1 - (local - BEAT.aftermath) / 0.035, mode: 'open' };
  }
  return { w: 0, mode: 'open' };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Everything on top of the canvas is printed matter: a title panel, caption
 * boxes, brush-stroke wipes between shots, the one prompt the story asks you to
 * act on, a thin episode rail and a sound switch. All of it follows the same
 * scroll progress as the camera, updated per frame through refs.
 */
export function Overlay() {
  const phase = useStory((s) => s.phase);
  const prompt = useStory((s) => s.prompt);
  const sound = useStory((s) => s.sound);
  const root = useRef<HTMLDivElement>(null);
  const episodes = builtEpisodes();

  useEffect(() => {
    let raf = 0;
    const el = root.current!;
    const captions = Array.from(el.querySelectorAll<HTMLElement>('[data-caption]'));
    const capDefs = episodes.flatMap((ep) => ep.captions);
    const titles = Array.from(el.querySelectorAll<HTMLElement>('[data-title]'));
    const fill = el.querySelector<HTMLElement>('.rail-fill')!;
    const cue = el.querySelector<HTMLElement>('.cue')!;
    const outro = el.querySelector<HTMLElement>('.outro')!;
    const credits = el.querySelector<HTMLElement>('.credits')!;
    const wipe = el.querySelector<HTMLCanvasElement>('.wipe')!;
    const hit = el.querySelector<HTMLCanvasElement>('.impact')!;
    const wctx = wipe.getContext('2d')!;
    const hctx = hit.getContext('2d')!;
    let last = '';
    let lastHit = '';
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const c of [wipe, hit]) {
        c.width = Math.round(window.innerWidth * dpr);
        c.height = Math.round(window.innerHeight * dpr);
      }
      last = '';
    };
    size();
    hit.style.opacity = '1';
    window.addEventListener('resize', size);

    const loop = () => {
      const p = timeline.progress;
      const { id, local } = locate(p);
      captions.forEach((c, i) => {
        const when = capDefs[i].when;
        const on = c.dataset.ep === id && local >= Number(c.dataset.from) && local <= Number(c.dataset.to) && (!when || when());
        c.classList.toggle('is-on', on);
      });
      // a title shows at the start of its episode; later episodes show it over the ink of the hand-over
      titles.forEach((t) => {
        const i = episodes.findIndex((e) => e.id === t.dataset.ep);
        const own = t.dataset.ep === id && local < (i === 0 ? 0.09 : 0.13);
        // over the ink of a page turn; an episode that continues the last shot shows its title over the scene
        const inked = i > 0 && !seamless(t.dataset.ep!);
        const handover = inked && episodes[i - 1].id === id && local > 0.975;
        t.classList.toggle('is-on', own || handover);
        t.classList.toggle('on-ink', inked);
      });
      fill.style.transform = `scaleY(${p})`;
      cue.classList.toggle('is-on', p < 0.004);
      outro.classList.toggle('is-on', id === 'outro' && local > 0.15);
      credits.classList.toggle('is-on', id === 'home' && monitor.armed && !monitor.entering);

      const ink = inkAt(p);
      const key = `${ink.w.toFixed(3)}${ink.mode}${wipe.width}`;
      if (key !== last) {
        drawBrushWipe(wctx, wipe.width, wipe.height, clamp(ink.w, 0, 1), ink.mode, id === 'city' && local > 0.5 ? 13 : 7);
        last = key;
      }
      // the fight frames, a function of where the fight is (its time comes from the progress):
      // defended, the page goes black and the two hits are printed into the dark;
      // knocked out, a flash, then the lights go out as you fall
      const v = id === 'city' ? encounterAt(local) : null;
      const hitT = !v || v.t < 0 || local >= BEAT.aftermath ? -1 : v.t;
      // episode 3: the rush at the end of the launch, in speed lines
      const run = id === 'car' ? launchAt(local) : null;
      const rush = run && run.rpm >= 0 ? run.rush : 0;
      const hitKey = hitT >= 0 ? `${v!.outcome}${hitT.toFixed(3)}${hit.width}` : rush > 0 ? `rush${rush.toFixed(2)}${Math.floor(run!.t * 24)}${hit.width}` : '';
      if (hitKey !== lastHit) {
        hctx.clearRect(0, 0, hit.width, hit.height);
        if (hitT >= 0 && v!.outcome === 'knockedOut') drawKnockout(hctx, hit.width, hit.height, hitT, KO.dark);
        else if (hitT >= 0) drawHits(hctx, hit.width, hit.height, hitT, BLOCK);
        else if (rush > 0) drawSpeedLines(hctx, hit.width, hit.height, rush, run!.t);
        lastHit = hitKey;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [episodes]);

  /** Click / tap / Enter: act on the prompt if one is waiting, otherwise go to the next composed beat. */
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setEnabled(story.getState().sound);
    };
    const next = (e?: MouseEvent) => {
      // the last scene: only a click on the big screen does anything (Enter takes you in as well)
      if (monitor.entering) return;
      if (story.getState().prompt === 'monitor') {
        if (!e || onScreen(e.clientX, e.clientY)) enterSite();
        return;
      }
      if (story.getState().prompt === 'defend') {
        defend();
        return;
      }
      // revving is done by holding D (or the tachometer), not by clicking on
      if (story.getState().prompt === 'rev') return;
      const { id, local } = locate(timeline.target);
      const ep = episodes.find((e) => e.id === id);
      if (!ep) return;
      const r = episodeRange(ep.id);
      const beat = ep.beats.find((b) => b > local + 0.01);
      scrollToProgress(Math.min(gateLimit(), beat === undefined ? r.end + 0.001 : r.start + beat * (r.end - r.start)));
    };
    const onKey = (e: KeyboardEvent) => {
      unlock();
      if (e.code === 'Enter' || (e.code === 'Space' && story.getState().prompt)) {
        e.preventDefault();
        next();
      }
    };
    const onClick = (e: MouseEvent) => {
      unlock();
      if ((e.target as HTMLElement).closest('a,button,.rev-prompt,.handoff')) return;
      next(e);
    };
    // while the story waits at a gate, drift the page back to it so the prompt stays in reach
    let settle = 0;
    const onScroll = () => {
      window.clearTimeout(settle);
      if (!story.getState().prompt) return;
      settle = window.setTimeout(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (window.scrollY / max > gateLimit() + 0.01) scrollToProgress(gateLimit());
      }, 260);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('scroll', onScroll);
    };
  }, [episodes]);

  const toggleSound = () => {
    const on = !story.getState().sound;
    story.setState({ sound: on });
    audio.unlock();
    audio.setEnabled(on);
  };

  return (
    <div className="overlay" ref={root}>
      <div className={`veil ${phase === 'loading' ? 'is-on' : ''}`} />
      <canvas className="wipe" aria-hidden />

      {episodes.map((ep) => (
        <header key={ep.id} className="title" data-title data-ep={ep.id}>
          <span className="title-brand">DRUNKFURT</span>
          <span className="title-kicker">Episode {pad(ep.number)}</span>
          <h1 className="title-name">{ep.title}</h1>
          <span className="title-sub">{ep.subtitle}</span>
        </header>
      ))}

      {episodes.flatMap((ep) =>
        ep.captions.map((c, i) => (
          <aside
            key={`${ep.id}-${i}`}
            className={`caption caption--${c.place} caption--${c.tone ?? 'paper'}`}
            data-caption
            data-ep={ep.id}
            data-from={c.from}
            data-to={c.to}
          >
            {c.kicker && <span className="caption-kicker">{c.kicker}</span>}
            <p>{c.text}</p>
          </aside>
        )),
      )}

      <button
        type="button"
        className={`act ${prompt === 'defend' ? 'is-on' : ''}`}
        aria-hidden={prompt !== 'defend'}
        tabIndex={prompt === 'defend' ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          defend();
        }}
      >
        <span className="act-word">Defend</span>
        <span className="act-hint">Click to defend</span>
      </button>

      <canvas className="impact" aria-hidden />

      <RevPrompt prompt={prompt} />

      <div className="cue">
        <span>Scroll</span>
        <i />
      </div>

      <nav className="rail" aria-label="DRUNKFURT episodes">
        <div className="rail-line">
          <div className="rail-fill" />
        </div>
        <ol>
          {PLANNED.map((p) => {
            const built = EPISODE_SPANS.find((_, i) => i === p.number - 1);
            return (
              <li key={p.number} className={built ? 'is-built' : ''} title={p.title}>
                <span>{pad(p.number)}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <button type="button" className="sound" onClick={toggleSound} aria-pressed={sound}>
        Sound {sound ? 'on' : 'off'}
      </button>

      <p className="credits">
        Room: “Surveillance room” by{' '}
        <a href="https://sketchfab.com/wa_rouk" target="_blank" rel="noreferrer">
          wa_rouk
        </a>{' '}
        · Instrument cluster graphic:{' '}
        <a href="https://www.vecteezy.com" target="_blank" rel="noreferrer">
          Vecteezy.com
        </a>
      </p>

      <section className="outro">
        <span className="title-brand">DRUNKFURT</span>
        <h2 className="title-name">To be continued</h2>
        <p className="credit">
          Instrument cluster graphic:{' '}
          <a href="https://www.vecteezy.com" target="_blank" rel="noreferrer">
            Vecteezy.com
          </a>
        </p>
      </section>
    </div>
  );
}
