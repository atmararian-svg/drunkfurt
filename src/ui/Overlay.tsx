import { useEffect, useRef } from 'react';
import { audio } from '../audio/AudioDirector';
import { clamp } from '../core/math';
import { story, useStory } from '../core/store';
import { CHAPTERS } from '../core/chapters';
import { chapterTurn, episodeRange, gateLimit, locate, scrollToProgress, timeline } from '../core/timeline';
import { builtEpisodes } from '../episodes';
import { hoverDecode } from './decode';
import { BEAT, BLOCK, KO, defend, encounter, encounterAt } from '../scenes/city/encounter';
import { drawBrushWipe, drawHits, drawIgnite, drawKnockout, drawSpeedLines } from './brush';
import { launchAt } from '../scenes/car/getaway';
import { enterSite, monitor, pick } from '../scenes/home/monitor';
import { RevPrompt } from './RevPrompt';

/**
 * Ink over the whole frame at a given progress: the fight's conceal (the dark
 * spreads over the frame before the hits, drawIgnite, and recedes on the
 * aftermath) and the closing card. Moving between chapters is the chapter
 * transition's (chapterTransition.ts), not ink.
 */
function inkAt(p: number): { w: number; mode: 'close' | 'open'; kind: 'ignite' | 'brush' } {
  const { id, local } = locate(p);
  if (id === 'outro') return { w: 1, mode: 'close', kind: 'brush' };
  if (id === 'city' && encounter.outcome) {
    // the dark spreads from the decision and is complete at the outcome's `dark` (BLOCK.dark, KO.dark): the
    // fight itself happens under it; the page stays dark until the aftermath, where it recedes
    const t = encounterAt(local).t;
    const black = encounter.outcome === 'blocked' ? BLOCK.dark : KO.dark;
    const lead = encounter.outcome === 'blocked' ? BLOCK.dark : 0.45;
    if (t >= 0 && local < BEAT.aftermath) return { w: clamp((t - (black - lead)) / lead, 0, 1), mode: 'close', kind: 'ignite' };
    if (local >= BEAT.aftermath && local < BEAT.aftermath + OPEN) return { w: 1 - (local - BEAT.aftermath) / OPEN, mode: 'open', kind: 'ignite' };
  }
  return { w: 0, mode: 'open', kind: 'brush' };
}
/** How much of the city episode the conceal takes to recede on the aftermath. */
const OPEN = 0.045;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Everything on top of the canvas is printed matter: a title panel, caption
 * boxes, brush-stroke wipes between shots, the one prompt the story asks you to
 * act on, a thin episode rail and a sound switch. All of it follows the same
 * scroll progress as the camera, updated per frame through refs.
 */
export function Overlay() {
  const prompt = useStory((s) => s.prompt);
  const sound = useStory((s) => s.sound);
  const root = useRef<HTMLDivElement>(null);
  const episodes = builtEpisodes();

  useEffect(() => {
    let raf = 0;
    const el = root.current!;
    const captions = Array.from(el.querySelectorAll<HTMLElement>('[data-caption]'));
    const capDefs = episodes.flatMap((ep) => ep.captions);
    const fill = el.querySelector<HTMLElement>('.rail-fill')!;
    const cue = el.querySelector<HTMLElement>('.cue')!;
    const outro = el.querySelector<HTMLElement>('.outro')!;
    const credits = el.querySelector<HTMLElement>('.credits')!;
    const rail = Array.from(el.querySelectorAll<HTMLElement>('.rail li'));
    const chapterNow = (id: string) => CHAPTERS.find((c) => (c.episodes as string[]).includes(id))?.number ?? CHAPTERS.length;
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
      fill.style.transform = `scaleY(${p})`;
      cue.classList.toggle('is-on', p < 0.004);
      outro.classList.toggle('is-on', id === 'outro' && local > 0.15);
      credits.classList.toggle('is-on', id === 'home' && monitor.armed && !monitor.entering);
      // the rail marks the chapter you are in
      rail.forEach((li) => li.classList.toggle('is-here', Number(li.dataset.chapter) === chapterNow(id)));

      const ink = inkAt(p);
      const key = `${ink.w.toFixed(3)}${ink.mode}${ink.kind}${wipe.width}`;
      if (key !== last) {
        if (ink.kind === 'ignite') drawIgnite(wctx, wipe.width, wipe.height, clamp(ink.w, 0, 1), ink.mode);
        else drawBrushWipe(wctx, wipe.width, wipe.height, clamp(ink.w, 0, 1), ink.mode, 7);
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

  /** The printed text decodes where the pointer passes over it (captions, title cards). */
  useEffect(() => {
    const el = root.current!;
    const detach = Array.from(el.querySelectorAll<HTMLElement>('[data-decode], [data-decode-in]')).map((t) => hoverDecode(t));
    return () => detach.forEach((d) => d());
  }, [episodes]);

  /** Click / tap / Enter: act on the prompt if one is waiting, otherwise go to the next composed beat. */
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      audio.setEnabled(story.getState().sound);
    };
    const next = (e?: MouseEvent) => {
      // a chapter transition plays by itself
      if (chapterTurn.busy) return;
      // the last scene: only a click on the big screen does anything (Enter takes you in as well)
      if (monitor.entering) return;
      if (story.getState().prompt === 'monitor') {
        // the page under the click: a project, About, All works, or the home page; Enter: the one under the pointer
        if (!e) enterSite(monitor.link);
        else {
          const at = pick(e.clientX, e.clientY);
          if (at) enterSite(at.link);
        }
        return;
      }
      if (story.getState().prompt === 'defend') {
        defend();
        return;
      }
      // revving starts with D (or a press on its card), not with a click
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
      if ((e.target as HTMLElement).closest('a,button,.rev-prompt,.whiteout,.preloader')) return;
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
      <canvas className="wipe" aria-hidden />

      {CHAPTERS.map((c) => (
        <div key={c.number} className="tcard" data-chapter={c.number} role="status" aria-label={`Chapter ${c.number}: ${c.title}. ${c.place}, ${c.time}`}>
          <div className="tcard-slide">
            <div className="tcard-panel">
              <div className="tcard-meta" aria-hidden>
                <span data-decode-in data-text={`DRUNKFURT / CHAPTER ${c.number}`} />
                <span data-decode-in data-text={`${c.place.toUpperCase()} / ${c.time}`} />
              </div>
              <h2 className="tcard-title" aria-hidden data-decode-in data-text={c.title.toUpperCase()} />
            </div>
          </div>
        </div>
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
            {c.kicker && <span className="caption-kicker" data-decode data-text={c.kicker} />}
            <p data-decode data-text={c.text} />
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

      <nav className="rail" aria-label="DRUNKFURT chapters">
        <div className="rail-line">
          <div className="rail-fill" />
        </div>
        <ol>
          {CHAPTERS.map((c) => (
            <li key={c.number} className="is-built" data-chapter={c.number} title={c.title}>
              <span>{pad(c.number)}</span>
            </li>
          ))}
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
